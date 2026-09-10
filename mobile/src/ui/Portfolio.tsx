import { useMemo } from 'react';
import { Text, View } from 'react-native';
import type { LocalState } from '../domain/model';
import { reconstructHoldings } from '../../../src/lib/portfolio/reconstruct';
import type { BrokerEvent } from '../../../src/lib/csv/broker';
import { PLATFORM_DETAILS } from '../services/network-policy';
import { Card, money, Note, Page, styles } from './kit';

export function Portfolio({ state }: { state: LocalState }) {
  const imported = useMemo(() => state.accounts.filter(a => !a.platform).flatMap(account => {
    const rows = state.events.filter(e => e.accountId === account.id && e.source === 'csv' && ['BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'FEE', 'DEPOSIT', 'WITHDRAWAL'].includes(e.type));
    return [...new Set(rows.map(r => r.currency))].map(currency => ({ account, currency,
      result: reconstructHoldings(rows.filter(r => r.currency === currency).map(row => ({ date: new Date(row.date),
        kind: row.type as BrokerEvent['kind'], symbol: row.symbol || null, isin: null, quantity: row.quantity,
        price: row.price, amount: Number(row.amount), fees: row.fees, currency: row.currency,
        description: row.description, externalId: row.externalId, line: 0 })), 'average') }));
  }), [state.accounts, state.events]);
  return <Page title="A tua carteira" subtitle="Posições e moedas sem contar o mesmo dinheiro duas vezes.">
    {!state.accounts.length ? <Card><Note>Adiciona uma conta ou liga uma corretora nas definições.</Note></Card> : null}
    {state.accounts.filter(a => a.platform).map(account => <Card key={account.id} title={account.name}>
      <Note>{PLATFORM_DETAILS[account.platform!].scope}</Note>
      {!account.reading ? <Note>Sincroniza a conta para ver as posições.</Note> : <>
        <Note>Leitura: {account.syncedAt ? new Date(account.syncedAt).toLocaleString('pt-PT') : 'Data não disponível'}</Note>
        {account.reading.positions.map((p, i) => <View key={`${p.coin}-${i}`} style={{ gap: 6, paddingVertical: 9 }}>
          <View style={styles.row}><Text style={styles.label}>{p.coin} · {p.side}</Text><Text style={styles.text}>{p.size} unidades</Text></View>
          <Note>Exposição: {money(p.positionValue, account.currency)} · P&L: {money(p.unrealizedPnl, account.currency)}</Note>
        </View>)}
        {account.reading.balances.filter(b => b.total !== 0).map((b, i) => <View key={`${b.coin}-${i}`} style={styles.row}>
          <Text style={styles.text}>{b.coin} · {b.total}</Text><Text style={styles.text}>{money(b.usdValue, account.currency)}</Text>
        </View>)}
        <Note>Posições já incluídas no saldo da corretora não são adicionadas de novo ao património.</Note>
      </>}
    </Card>)}
    {imported.map(({ account, currency, result }) => <Card key={`${account.id}-${currency}`} title={`${account.name} · extrato ${currency}`}>
      <Note>Reconstrução por custo médio. O extrato não fornece preços atuais. Estas posições estão dentro do saldo total que declaraste para a conta.</Note>
      {result.holdings.map(h => <View key={h.key} style={{ gap: 5, paddingVertical: 9 }}>
        <Text style={styles.label}>{h.symbol ?? h.isin ?? h.key} · {h.quantity} unidades</Text>
        <Note>Custo: {money(h.costBasis, currency)} · Valor atual: por medir</Note>
        {h.incomplete ? <Note danger>Histórico incompleto; confirma as quantidades no extrato.</Note> : null}
      </View>)}
    </Card>)}
  </Page>;
}
