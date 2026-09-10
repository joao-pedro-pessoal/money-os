import { ASSET_TYPES, RISK_LEVELS, EXPECTED_RETURNS, TIME_HORIZONS, LIQUIDITY_LEVELS } from '../portfolio/tags';

export const TRADE_CLASSIFICATION_FIELDS = [
  { name: 'assetType', label: 'Asset type', options: ASSET_TYPES },
  { name: 'riskLevel', label: 'Risk', options: RISK_LEVELS },
  { name: 'expectedReturn', label: 'Expected return', options: EXPECTED_RETURNS },
  { name: 'timeHorizon', label: 'Time horizon', options: TIME_HORIZONS },
  { name: 'liquidity', label: 'Liquidity', options: LIQUIDITY_LEVELS },
] as const;

export function parseTradeClassification(input: Record<string, string>) {
  const values: Record<string, string | null> = {};
  for (const field of TRADE_CLASSIFICATION_FIELDS) {
    const value = (input[field.name] ?? '').trim();
    if (value && !field.options.some(o => o.value === value)) throw new Error(`Invalid ${field.label}.`);
    values[field.name] = value || null;
  }
  const apr = (input.apr ?? '').trim();
  if (apr && (!Number.isFinite(Number(apr)) || Number(apr) < 0 || Number(apr) > 99999)) throw new Error('Invalid annual rate.');
  const notes = (input.notes ?? '').trim();
  if (notes.length > 10000) throw new Error('Notes must be at most 10000 characters.');
  return { assetType: values.assetType, riskLevel: values.riskLevel, expectedReturn: values.expectedReturn,
    timeHorizon: values.timeHorizon, liquidity: values.liquidity,
    apr: apr ? Number(apr).toFixed(3) : null, notes: notes || null, playlistId: input.playlistId?.trim() || null };
}
