import { useState } from 'react';
import { Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { LocalState } from '../domain/model';
import { amountInput, positive } from '../domain/money';
import { MobileSession } from '../services/session';
import { Button, Card, Choices, colors, Field, money, Note, Page, styles, type Run } from './kit';

export function Plans({ state, session, run, busy }: { state: LocalState; session: MobileSession; run: Run; busy: boolean }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('0');
  const [selectedGoal, setSelectedGoal] = useState('');
  const [subscription, setSubscription] = useState('');
  const [cost, setCost] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  return <Page title="Planear com intenção" subtitle="Objetivos e compromissos, separados do teu património.">
    {state.goals.map(goal => <Card key={goal.id} title={goal.name}>
      <View style={styles.row}><Text style={styles.text}>{money(goal.saved, goal.currency)}</Text><Note>de {money(goal.target, goal.currency)}</Note></View>
      <View style={{ height: 7, borderRadius: 5, backgroundColor: colors.border }}><View style={{ height: 7, borderRadius: 5,
        width: `${Math.min(100, Number(goal.saved) / Number(goal.target) * 100)}%`, backgroundColor: colors.accent }} /></View>
      <Button title="Atualizar objetivo" secondary onPress={() => { setSelectedGoal(goal.id); setName(goal.name); setCurrency(goal.currency); setTarget(goal.target); setSaved(goal.saved); }} />
    </Card>)}
    <Card title={selectedGoal ? 'Editar objetivo' : 'Novo objetivo'}>
      <Field label="Nome do objetivo" value={name} onChangeText={setName} placeholder="Fundo de emergência" />
      <Field label="Moeda" value={currency} onChangeText={v => setCurrency(v.toUpperCase())} autoCapitalize="characters" maxLength={8} />
      <Field label="Valor pretendido" value={target} onChangeText={setTarget} keyboardType="decimal-pad" />
      <Field label="Quanto já reservaste" value={saved} onChangeText={setSaved} keyboardType="decimal-pad" />
      <Note>É uma indicação de planeamento. Não acrescenta dinheiro aos saldos nem executa reservas no banco.</Note>
      <Button title="Guardar objetivo" disabled={busy} onPress={() => void run(async () => {
        await session.vault.update(draft => {
          const goal = { id: selectedGoal || randomUUID(), name: name.trim(), currency, target: positive(target), saved: amountInput(saved) };
          draft.goals = [...draft.goals.filter(g => g.id !== goal.id), goal];
        }); setSelectedGoal(''); setName(''); setTarget(''); setSaved('0');
      })} />
    </Card>
    <Card title="Subscrições e compromissos">
      {state.commitments.map(item => <View key={item.id} style={{ gap: 10 }}>
        <View style={styles.row}><Text style={styles.label}>{item.name}</Text><Text style={styles.text}>{money(item.amount, item.currency)} / {item.period === 'monthly' ? 'mês' : 'ano'}</Text></View>
        <Button title="Remover compromisso" secondary disabled={busy} onPress={() => void run(() => session.vault.update(draft => { draft.commitments = draft.commitments.filter(s => s.id !== item.id); }))} />
      </View>)}
      <Field label="Nome" value={subscription} onChangeText={setSubscription} placeholder="Internet" />
      <Field label={`Valor (${currency})`} value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
      <Choices value={period} values={[{ value: 'monthly', label: 'Mensal' }, { value: 'yearly', label: 'Anual' }]} onChange={setPeriod} />
      <Note>Não são lançadas despesas automaticamente. Regista o pagamento quando acontecer.</Note>
      <Button title="Adicionar compromisso" disabled={busy} onPress={() => void run(async () => {
        await session.vault.update(draft => { draft.commitments.push({ id: randomUUID(), name: subscription.trim(), amount: positive(cost), currency, period }); });
        setSubscription(''); setCost('');
      })} />
    </Card>
  </Page>;
}
