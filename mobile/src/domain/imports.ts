import Papa from 'papaparse';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { parseInvestmentActivity, investmentActivityFingerprint } from '../../../src/lib/investment-activity';
import { buildRows, detectColumns } from '../../../src/lib/csv';
import { parseBrokerCsv, inspectBrokerCsv } from '../../../src/lib/csv/broker';
import { Event, type LocalEvent, type LocalState } from './model';
import { measured } from './money';

export interface ImportPreview { rows: LocalEvent[]; problems: string[]; duplicates: number; }
export function previewCsv(text: string, state: LocalState, accountId: string, mode: 'bank' | 'broker', newId: () => string): ImportPreview {
  if (text.length > 10000000) throw new Error('O ficheiro é demasiado grande (máximo: 10 MB).');
  const account = state.accounts.find(a => a.id === accountId);
  if (!account) throw new Error('Escolhe uma conta.');
  const result: ImportPreview = { rows: [], problems: [], duplicates: 0 };
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().replace(/^\uFEFF/, '') });
  if (parsed.data.length > 50000) throw new Error('Máximo de 50 000 linhas por importação.');
  if (parsed.errors.length) return { ...result, problems: parsed.errors.slice(0, 10).map(e => `CSV: ${e.message}`) };
  const headers = parsed.meta.fields ?? [];
  const candidates: Omit<LocalEvent, 'externalId'>[] = [];
  const externalIds: string[] = [];
  const base = { accountId, source: 'csv' as const, transferId: null };
  if (mode === 'bank') {
    const rows = buildRows(parsed.data, detectColumns(headers), new Set());
    rows.forEach((row, i) => {
      if (row.problem || !row.date || row.amount === null) { result.problems.push(`Linha ${i + 2}: ${row.problem ?? 'Dados incompletos'}`); return; }
      const suppliedCurrency = parsed.data[i].currency?.trim().toUpperCase();
      if (suppliedCurrency && suppliedCurrency !== account.currency) { result.problems.push(`Linha ${i + 2}: a moeda não corresponde à conta.`); return; }
      candidates.push({ ...base, id: newId(), date: row.date.toISOString(), type: row.amount < 0 ? 'EXPENSE' : 'INCOME',
        amount: measured(row.amount), currency: account.currency, description: row.description || row.merchant,
        symbol: '', quantity: null, price: null, fees: null });
      externalIds.push(parsed.data[i].external_id?.trim() ?? '');
    });
  } else if (headers.includes('type') && headers.includes('amount') && headers.includes('currency')) {
    parsed.data.forEach((raw, i) => {
      const date = new Date(`${raw.date}T12:00:00Z`);
      if (!/^-?\d+(\.\d+)?$/.test(String(raw.amount ?? '').trim()) ||
          Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw.date) {
        result.problems.push(`Linha ${i + 2}: montante em falta ou data inválida.`); return;
      }
      const read = parseInvestmentActivity(raw);
      if (!read.row) { result.problems.push(`Linha ${i + 2}: ${read.problem}`); return; }
      const { externalId, ...row } = read.row;
      candidates.push({ ...row, ...base, id: newId(), amount: measured(row.amount), date: new Date(row.date).toISOString() });
      externalIds.push(externalId);
    });
  } else {
    const currencyHeader = inspectBrokerCsv(text).columns.find(c => c.role === 'currency')?.header;
    if (!currencyHeader || parsed.data.some(row => !row[currencyHeader]?.trim())) {
      return { ...result, problems: ['O extrato tem de identificar a moeda de cada movimento. Não é assumido EUR.'] };
    }
    const read = parseBrokerCsv(text);
    result.problems.push(...read.rejected.map(r => `Linha ${r.line}: ${r.reason}`));
    for (const row of read.events) {
      candidates.push({ ...base, id: newId(), date: row.date.toISOString(), type: row.kind,
        symbol: row.isin ?? row.symbol ?? '', quantity: row.quantity, price: row.price, fees: row.fees,
        amount: measured(row.amount), currency: row.currency, description: row.description ?? '' });
      externalIds.push(row.externalId ?? '');
    }
  }
  const existing = new Set(state.events.filter(e => e.accountId === accountId && e.source === 'csv').map(e => e.externalId));
  const occurrences = new Map<string, number>();
  candidates.forEach((row, i) => {
    const fingerprint = investmentActivityFingerprint({ ...row, amount: Number(row.amount), externalId: externalIds[i] });
    const identity = externalIds[i] ? `ref:${externalIds[i]}` : `row:${fingerprint}`;
    const ordinal = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, ordinal);
    // Preserve two identical real rows without IDs, while a repeated file is idempotent.
    const key = bytesToHex(sha256(new TextEncoder().encode(`${identity}|${externalIds[i] ? 1 : ordinal}`)));
    if (existing.has(key)) { result.duplicates++; return; }
    const valid = Event.safeParse({ ...row, externalId: key });
    if (!valid.success) { result.problems.push(`Linha de ${row.date}: valores inválidos.`); return; }
    existing.add(key);
    result.rows.push(valid.data);
  });
  return result;
}
export function commitCsv(state: LocalState, preview: ImportPreview): void {
  if (preview.problems.length) throw new Error('Corrige as linhas inválidas antes de importar.');
  const accounts = new Set(state.accounts.map(a => a.id));
  const existing = new Set(state.events.filter(e => e.source === 'csv').map(e => `${e.accountId}|${e.externalId}`));
  for (const row of preview.rows) {
    if (!accounts.has(row.accountId)) throw new Error('A conta já não existe.');
    const key = `${row.accountId}|${row.externalId}`;
    if (!existing.has(key)) { state.events.push(row); existing.add(key); }
  }
  // An imported history never adds to a current measured account balance.
}
