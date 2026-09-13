import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { LocalEvent, LocalState } from '../domain/model';
import { linkLocalCashback, recordCash, setPurchaseSavings, unlinkLocalCashback } from '../domain/operations';
import { negate, positive } from '../domain/money';
import { MobileSession } from '../services/session';
import { manualDate } from '../../../src/lib/money/manualEntry';
import { savingsReport } from '../../../src/lib/money/savings';
import { Button, Card, Choices, Field, money, Note, Page, styles, type Run } from './kit';

type Props = { state: LocalState; session: MobileSession; run: Run; busy: boolean };

function PurchaseEditor({ purchase, state, session, run, busy }: Props & { purchase: LocalEvent }) {
  const [discount, setDiscount] = useState(purchase.discountAmount ?? '');
  const [originalPrice, setOriginalPrice] = useState('');
  const [expected, setExpected] = useState(purchase.cashbackExpected ?? '');
  const [category, setCategory] = useState(purchase.categoryId ?? '');
  const [mode, setMode] = useState('existing');
  const [search, setSearch] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const [accountId, setAccountId] = useState(purchase.accountId);
  const [kind, setKind] = useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const linked = state.events.filter(e => e.cashbackForId === purchase.id);
  const owners = new Set(state.events.map(e => e.cashbackForId).filter(Boolean));
  const candidates = state.events.filter(e => ['INCOME', 'EXPENSE'].includes(e.type) && e.id !== purchase.id && !e.cashbackForId &&
    !Number(e.discountAmount ?? 0) && !Number(e.cashbackExpected ?? 0) && !owners.has(e.id) && e.currency === purchase.currency);
  const accounts = state.accounts.filter(a => !a.platform && a.currency === purchase.currency);
  const label = (e: LocalEvent) => `${e.date.slice(0, 10)} · ${e.description || e.type} · ${money(e.amount, e.currency)}`;
  return <Card title={`${purchase.description || 'Compra'} · ${money(purchase.amount, purchase.currency)}`}>
    <Field label={`Desconto / dinheiro poupado (${purchase.currency})`} value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" />
    <Field label="Ou preço original (deixa desconto vazio)" value={originalPrice} onChangeText={setOriginalPrice} keyboardType="decimal-pad" />
    <Field label="Cashback total esperado" value={expected} onChangeText={setExpected} keyboardType="decimal-pad" />
    <Field label="Categoria" value={category} onChangeText={setCategory} maxLength={80} />
    <Button title="Guardar poupanças da compra" disabled={busy} onPress={() => void run(async () => {
      await session.vault.update(draft => setPurchaseSavings(draft, purchase.id, { discount, originalPrice, expected, category }));
      setOriginalPrice('');
    })} />
    <Note>Devolução total: coloca desconto e cashback esperado a zero. Numa devolução parcial, mantém só o benefício restante. Regista o reembolso real como receita; os recebimentos já existentes são preservados.</Note>
    <Choices value={mode} onChange={setMode} values={[{ value: 'existing', label: 'Associar movimento' }, { value: 'new', label: 'Novo recebimento' }]} />
    {mode === 'existing' ? <>
      <Note>Associa uma receita ou uma despesa de reversão. Usa o movimento completo, na mesma moeda, sem alterar o saldo.</Note>
      <Field label="Pesquisar recebimento ou reversão" value={search} onChangeText={setSearch} />
      <Choices value={receiptId} onChange={setReceiptId} values={candidates.filter(e => label(e).toLowerCase().includes(search.toLowerCase())).slice(0, 20).map(e => ({ value: e.id, label: label(e) }))} />
      <Note>Até 20 resultados. Pesquisa pela descrição ou data para encontrar outros.</Note>
      <Button title="Associar cashback" disabled={busy || !candidates.some(e => e.id === receiptId)} onPress={() => void run(async () => {
        await session.vault.update(draft => linkLocalCashback(draft, receiptId, purchase.id)); setReceiptId('');
      })} />
    </> : <>
      <Note>Cria um movimento real e atualiza o saldo. Usa apenas se ainda não existe no histórico.</Note>
      <Choices value={kind} onChange={setKind} values={[{ value: 'INCOME', label: 'Recebido' }, { value: 'EXPENSE', label: 'Revertido / retirado' }]} />
      <Choices value={accountId} onChange={setAccountId} values={accounts.map(a => ({ value: a.id, label: a.name }))} />
      {!accounts.length ? <Note>Adiciona uma conta manual em {purchase.currency} para registar este movimento.</Note> : null}
      <Field label={`Montante (${purchase.currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Field label="Data do recebimento (AAAA-MM-DD)" value={date} onChangeText={setDate} />
      <Button title="Registar movimento de cashback" disabled={busy || !accounts.some(a => a.id === accountId)} onPress={() => void run(async () => {
        const event: LocalEvent = { id: randomUUID(), accountId, type: kind, date: manualDate(date).toISOString(),
          amount: kind === 'INCOME' ? positive(amount) : negate(positive(amount)), currency: purchase.currency,
          description: `Cashback · ${purchase.description || purchase.date.slice(0, 10)}`, source: 'manual', externalId: '',
          transferId: null, quantity: null, price: null, fees: null, symbol: '', cashbackForId: purchase.id };
        await session.vault.update(draft => recordCash(draft, event)); setAmount('');
      })} />
    </>}
    {linked.map(e => <View key={e.id} style={{ gap: 8 }}><Text style={styles.text}>{label(e)}</Text>
      <Button title="Desassociar (manter movimento)" secondary disabled={busy} onPress={() => void run(() => session.vault.update(draft => unlinkLocalCashback(draft, e.id, purchase.id)))} />
    </View>)}
  </Card>;
}

export function Savings(props: Props) {
  const { state, busy } = props;
  const [period, setPeriod] = useState('all');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [accountId, setAccountId] = useState(''), [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState(''), [selected, setSelected] = useState('');
  const [visible, setVisible] = useState(30);
  const range = period === 'month' ? { from: `${month}-01`, to: `${month}-31` } : period === 'year' ? { from: `${year}-01-01`, to: `${year}-12-31` } : period === 'custom' ? { from, to } : {};
  const rangeFrom = range.from, rangeTo = range.to;
  const report = useMemo(() => savingsReport(state.events, { from: rangeFrom, to: rangeTo, accountId, categoryId }), [state.events, rangeFrom, rangeTo, accountId, categoryId]);
  const purchases = state.events.filter(e => e.type === 'EXPENSE' && !e.cashbackForId).sort((a, b) => b.date.localeCompare(a.date));
  const purchase = purchases.find(e => e.id === selected);
  const categories = [...new Set(purchases.map(e => e.categoryId).filter((c): c is string => !!c))].sort();
  return <Page title="Poupanças" subtitle="Descontos e cashback das tuas compras. Não representa saldo disponível nem dinheiro destinado a objetivos.">
    <Card title="Filtros">
      <Choices value={period} onChange={setPeriod} values={[{ value: 'all', label: 'Tudo' }, { value: 'month', label: 'Mês' }, { value: 'year', label: 'Ano' }, { value: 'custom', label: 'Período' }]} />
      {period === 'month' ? <Field label="Mês (AAAA-MM)" value={month} onChangeText={setMonth} /> : null}
      {period === 'year' ? <Field label="Ano" value={year} onChangeText={setYear} keyboardType="number-pad" /> : null}
      {period === 'custom' ? <><Field label="Desde (AAAA-MM-DD)" value={from} onChangeText={setFrom} /><Field label="Até (AAAA-MM-DD)" value={to} onChangeText={setTo} /></> : null}
      <Choices value={accountId} onChange={setAccountId} values={[{ value: '', label: 'Todas as contas' }, ...state.accounts.map(a => ({ value: a.id, label: a.name }))]} />
      <Choices value={categoryId} onChange={setCategoryId} values={[{ value: '', label: 'Todas as categorias' }, ...categories.map(c => ({ value: c, label: c }))]} />
      <Note>Os filtros selecionam compras. Incluem todo o cashback associado a essas compras, mesmo recebido mais tarde. Moedas separadas.</Note>
    </Card>
    {report.totals.map(t => <Card key={t.currency} title={`Poupanças · ${t.currency}`}>
      <Text style={styles.title}>{money(t.total, t.currency)}</Text>
      <Note>Descontos: {money(t.discount, t.currency)}</Note><Note>Cashback recebido líquido: {money(t.received, t.currency)}</Note><Note>Pendente (fora do total): {money(t.pending, t.currency)}</Note>
    </Card>)}
    <Card title="Histórico de poupanças">
      {!report.rows.length ? <Note>Ainda sem poupanças para estes filtros. Seleciona uma compra abaixo.</Note> : null}
      {report.rows.slice(0, visible).map(row => <View key={row.purchase.id} style={{ gap: 8 }}>
        <Button secondary title={`${row.purchase.date.slice(0, 10)} · ${row.purchase.description || 'Compra'}`} disabled={busy} onPress={() => setSelected(row.purchase.id)} />
        <Note>Poupado: {money(row.total, row.purchase.currency)} · pendente: {money(row.pending, row.purchase.currency)}</Note>
      </View>)}
      {report.rows.length > visible ? <Button secondary title="Mostrar mais" onPress={() => setVisible(v => v + 30)} /> : null}
    </Card>
    <Card title="Adicionar ou editar poupanças">
      <Field label="Pesquisar compra por descrição ou data" value={search} onChangeText={setSearch} />
      <Choices value={selected} onChange={setSelected} values={purchases.filter(e => `${e.description} ${e.date}`.toLowerCase().includes(search.toLowerCase())).slice(0, 20).map(e => ({ value: e.id, label: `${e.date.slice(0, 10)} · ${e.description || 'Compra'} · ${money(e.amount, e.currency)}` }))} />
      <Note>Até 20 resultados. Pesquisa para encontrar compras anteriores ou importadas.</Note>
    </Card>
    {purchase ? <PurchaseEditor key={`${purchase.id}:${purchase.discountAmount}:${purchase.cashbackExpected}:${purchase.categoryId}`} {...props} purchase={purchase} /> : null}
  </Page>;
}
