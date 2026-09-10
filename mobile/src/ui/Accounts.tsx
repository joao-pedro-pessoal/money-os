import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { LocalState } from '../domain/model';
import { amountInput, negate, positive } from '../domain/money';
import { accountValue, addAccount, recordCash, transfer, deleteEvent } from '../domain/operations';
import { MobileSession } from '../services/session';
import { Button, Card, Choices, Field, money, Note, Page, styles, type Run } from './kit';

export function Accounts({ state, session, run, busy }: { state: LocalState; session: MobileSession; run: Run; busy: boolean }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [balance, setBalance] = useState('');
  const [selected, setSelected] = useState('');
  const [kind, setKind] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [to, setTo] = useState('');
  const [sent, setSent] = useState('');
  const [received, setReceived] = useState('');
  const [visible, setVisible] = useState(30);
  const manual = state.accounts.filter(a => !a.platform);
  const account = manual.find(a => a.id === selected) ?? manual[0];
  const target = manual.find(a => a.id === to);
  const events = [...state.events].sort((a, b) => b.date.localeCompare(a.date));
  return <Page title="Contas e movimentos" subtitle="O dinheiro que tens e o que acontece com ele.">
    {state.accounts.map(a => <Card key={a.id}>
      <View style={styles.row}><Text style={styles.label}>{a.name}</Text><Text style={styles.label}>{money(accountValue(a).amount, a.currency)}</Text></View>
      <Note>{a.platform ? (a.syncedAt ? `Leitura de ${new Date(a.syncedAt).toLocaleString('pt-PT')}` : 'Ainda sem leitura da corretora') : 'Saldo total declarado, incluindo investimentos nesta conta.'}</Note>
      {accountValue(a).partial ? <Note danger>Valor parcial ou ainda por medir.</Note> : null}
    </Card>)}
    <Card title="Adicionar conta manual">
      <Field label="Nome" value={name} onChangeText={setName} placeholder="Banco, dinheiro ou corretora por extrato" />
      <Field label="Moeda" value={currency} onChangeText={v => setCurrency(v.toUpperCase())} autoCapitalize="characters" maxLength={8} />
      <Field label="Saldo total atual (negativo para dívidas)" value={balance} onChangeText={setBalance} keyboardType="numbers-and-punctuation" />
      <Button title="Guardar conta" disabled={busy} onPress={() => void run(async () => {
        const id = randomUUID();
        await session.vault.update(draft => addAccount(draft, { id, name: name.trim(), currency,
          balance: amountInput(balance), platform: null, credentialRef: null, reading: null,
          syncedAt: null, createdAt: new Date().toISOString() }));
        setName(''); setBalance(''); setSelected(id);
      })} />
    </Card>
    {account ? <>
      <Card title="Registar receita ou despesa">
        <Choices value={account.id} values={manual.map(a => ({ value: a.id, label: a.name }))} onChange={setSelected} />
        <Choices value={kind} values={[{ value: 'EXPENSE', label: 'Despesa' }, { value: 'INCOME', label: 'Receita' }]} onChange={setKind} />
        <Field label={`Montante em ${account.currency}`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Field label="Descrição" value={description} onChangeText={setDescription} />
        <Button title="Registar movimento" disabled={busy} onPress={() => void run(async () => {
          await session.vault.update(draft => recordCash(draft, { id: randomUUID(), accountId: account.id,
            date: new Date().toISOString(), type: kind, amount: kind === 'EXPENSE' ? negate(positive(amount)) : positive(amount),
            currency: account.currency, description, symbol: '', quantity: null, price: null, fees: null,
            source: 'manual', externalId: '', transferId: null }));
          setAmount(''); setDescription('');
        })} />
      </Card>
      {manual.length > 1 ? <Card title="Transferência entre as tuas contas">
        <Note>Saída: {account.name}. Este registo não executa transferências no banco.</Note>
        <Choices value={to} values={manual.filter(a => a.id !== account.id).map(a => ({ value: a.id, label: a.name }))} onChange={setTo} />
        <Field label={`Saiu (${account.currency})`} value={sent} onChangeText={setSent} keyboardType="decimal-pad" />
        {target && target.currency !== account.currency ? <Field label={`Entrou efetivamente (${target.currency})`} value={received} onChangeText={setReceived} keyboardType="decimal-pad" /> : null}
        <Button title="Registar transferência" disabled={busy || !target || target.id === account.id} onPress={() => void run(async () => {
          if (!target) return;
          await session.vault.update(draft => transfer(draft, { from: account.id, to: target.id, sent,
            received: target.currency === account.currency ? sent : received, date: new Date().toISOString(),
            id: randomUUID(), outgoingId: randomUUID(), incomingId: randomUUID() }));
          setSent(''); setReceived('');
        })} />
      </Card> : null}
    </> : null}
    <Card title={`Histórico · ${events.length} movimentos`}>
      {!events.length ? <Note>Regista um movimento ou importa um extrato nas definições.</Note> : null}
      {events.slice(0, visible).map(row => <View key={row.id} style={{ gap: 5, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2B3C34' }}>
        <View style={styles.row}><Text style={styles.label}>{row.symbol || row.type}</Text><Text style={styles.text}>{money(row.amount, row.currency)}</Text></View>
        <Note>{row.description || 'Sem descrição'} · {state.accounts.find(a => a.id === row.accountId)?.name}</Note>
        <Note>{new Date(row.date).toLocaleDateString('pt-PT')} · {row.source === 'sync' ? 'Corretora' : row.source === 'csv' ? 'Extrato' : 'Manual'}</Note>
        {row.source === 'manual' ? <Button title={row.transferId ? 'Desfazer transferência' : 'Desfazer movimento'} secondary disabled={busy}
          onPress={() => Alert.alert('Desfazer registo?', 'O saldo será reposto. Uma transferência é desfeita nas duas contas.', [
            { text: 'Cancelar', style: 'cancel' }, { text: 'Desfazer', style: 'destructive', onPress: () => void run(() => session.vault.update(draft => deleteEvent(draft, row.id))) },
          ])} /> : null}
      </View>)}
      {visible < events.length ? <Button secondary title="Mostrar mais" onPress={() => setVisible(v => v + 30)} /> : null}
    </Card>
  </Page>;
}
