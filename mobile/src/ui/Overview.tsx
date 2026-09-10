import { Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import type { LocalState } from '../domain/model';
import { accountValue, totalsByCurrency } from '../domain/operations';
import { Card, colors, money, Note, Page, styles } from './kit';

export function Overview({ state }: { state: LocalState }) {
  const totals = totalsByCurrency(state);
  return <Page title="O teu dinheiro. Contigo." subtitle="Uma visão pessoal, guardada neste dispositivo.">
    <View style={{ backgroundColor: colors.accent, borderRadius: 24, padding: 24, gap: 16 }}>
      <Text style={{ color: colors.bg, fontSize: 12, fontWeight: '700', letterSpacing: 2 }}>PATRIMÓNIO REGISTADO</Text>
      {totals.length ? totals.map(t => <View key={t.currency} style={{ gap: 5 }}>
        <Text style={{ color: colors.bg, fontSize: 34, fontWeight: '700', letterSpacing: -1 }}>{money(t.value, t.currency)}</Text>
        {t.partial ? <Text style={{ color: colors.bg }}>Parcial · {t.missing ? `${t.missing} conta(s) sem leitura` : 'ativos por avaliar'}</Text> : null}
      </View>) : <Text style={{ color: colors.bg, fontSize: 22, fontWeight: '600' }}>Começa por adicionar uma conta.</Text>}
      <Text style={{ color: colors.bg, fontSize: 13 }}>As moedas são apresentadas separadamente. Dívidas declaradas reduzem o total.</Text>
    </View>
    <View style={styles.row}><Text style={styles.label}>{state.accounts.length} contas</Text><Text style={styles.subtitle}>{state.events.length} movimentos</Text></View>
    {state.accounts.map(account => {
      const points = state.snapshots.filter(p => p.accountId === account.id && p.currency === account.currency).slice(-30);
      const values = points.map(p => Number(p.value));
      const low = Math.min(...values), high = Math.max(...values);
      const polyline = values.map((v, i) => `${10 + i * 280 / Math.max(1, values.length - 1)},${75 - (high === low ? 0.5 : (v - low) / (high - low)) * 60}`).join(' ');
      return <Card key={account.id} title={account.name}>
        <Text style={{ color: colors.ink, fontSize: 26, fontWeight: '600' }}>{money(accountValue(account).amount, account.currency)}</Text>
        {points.length > 1 ? <>
          <Svg width="100%" height={90} viewBox="0 0 300 90" accessibilityLabel={`Evolução das últimas ${points.length} leituras de saldo de ${account.name}`}>
            <Polyline points={polyline} stroke={colors.accent} strokeWidth={2.5} fill="none" />
          </Svg>
          <Note>Últimas {points.length} leituras de saldo · {points.some(p => p.partial) ? 'inclui valores parciais' : 'inclui entradas e saídas'}. Não é uma taxa de rentabilidade.</Note>
        </> : <Note>{account.platform ? 'A evolução aparece depois de duas sincronizações.' : 'Saldo total declarado por ti.'}</Note>}
        {account.syncedAt ? <Note>Atualizado: {new Date(account.syncedAt).toLocaleString('pt-PT')}</Note> : null}
      </Card>;
    })}
    <Card title="Privado por definição"><Note>Não precisas de criar uma conta Money OS. As ligações às corretoras só são consultadas quando pedes uma sincronização.</Note></Card>
  </Page>;
}
