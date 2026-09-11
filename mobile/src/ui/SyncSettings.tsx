import { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { MobileSession } from '../services/session';
import type { SyncOutcome } from '../domain/sync';
import type { MergeConflict } from '../domain/merge';
import type { VaultDevice } from '../services/vault-client';
import { Button, Card, Choices, Field, Note, colors, styles, type Run } from './kit';

type Status = Awaited<ReturnType<MobileSession['syncStatus']>>;

function conflictSummary(conflicts: MergeConflict[]): string {
  const kinds = new Set(conflicts.map(c => c.kind));
  const parts: string[] = [];
  if (kinds.has('edited-both') || kinds.has('same-id-different-record'))
    parts.push('registos alterados nos dois dispositivos ficaram com a versão deste');
  if (kinds.has('deleted-and-edited')) parts.push('registos apagados num dispositivo e alterados no outro ficaram alterados');
  if (kinds.has('unexplained-balance')) parts.push('um saldo que os movimentos não explicavam foi recalculado a partir deles');
  return `${parts.join('; ')}.`;
}

/** What a sync round did, in words someone can act on. */
export function describeSync(outcome: SyncOutcome, applied: boolean): string {
  let text: string;
  switch (outcome.status) {
    case 'up-to-date': text = 'Já estava tudo sincronizado.'; break;
    case 'pushed': text = `Enviado. O servidor tem agora a versão ${outcome.version}.`; break;
    case 'pulled': text = `Recebida a versão ${outcome.version}, enviada por outro dispositivo.`; break;
    case 'merged': text = `Juntadas as alterações deste e de outro dispositivo na versão ${outcome.version}.`; break;
    case 'refused':
      text = outcome.reason === 'server-behind'
        ? 'O servidor tem uma versão mais antiga do que a deste dispositivo. Nada foi enviado, para não apagar o que falta no servidor.'
        : outcome.reason === 'unreadable'
          ? `O cofre do servidor não abriu com esta seed, ou foi alterado. Nada mudou neste dispositivo. Detalhe: ${outcome.detail}`
          : outcome.reason === 'invalid-merge'
            ? `Juntar as alterações criaria dados inválidos, por isso nada foi enviado. Detalhe: ${outcome.detail}`
            : 'Outro dispositivo escreveu sempre primeiro. Nada se perdeu; tenta outra vez daqui a pouco.';
  }
  const conflicts = 'conflicts' in outcome ? outcome.conflicts : [];
  if (conflicts.length) {
    text += ` ${conflicts.length === 1 ? 'Houve 1 conflito' : `Houve ${conflicts.length} conflitos`}: ${conflictSummary(conflicts)}`;
  }
  if ('local' in outcome && !applied) {
    text += ' Houve alterações neste dispositivo durante a sincronização; sincroniza outra vez para as incluir.';
  }
  return text;
}

/**
 * Sync settings: join or create an account, keep the seed, sync, manage devices.
 *
 * Says only what the app does. There is no automatic sync on opening the app, and
 * revoking a device does not yet rotate the seed, so neither is promised here.
 */
export function SyncSettings({ session, run, busy }: { session: MobileSession; run: Run; busy: boolean }) {
  const [status, setStatus] = useState<Status>(null);
  const [loaded, setLoaded] = useState(false);
  const [pendingWords, setPendingWords] = useState<string | null>(null);
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [server, setServer] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [seedWords, setSeedWords] = useState('');
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState('');
  const [devices, setDevices] = useState<VaultDevice[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [stop, setStop] = useState('');

  const refresh = useCallback(async () => {
    const next = await session.syncStatus();
    setStatus(next);
    setPendingWords(next && !next.seedConfirmed ? await session.pendingSeedWords() : null);
    setLoaded(true);
  }, [session]);

  useEffect(() => { refresh().catch(() => setLoaded(true)); }, [refresh]);

  if (!loaded) return <Card><Note>A verificar a sincronização…</Note></Card>;

  if (pendingWords) return <Card title="Guarda estas 12 palavras">
    <Note danger>Escreve-as em papel ou guarda-as num gestor de palavras-passe, pela ordem. Não as fotografes nem as envies por mensagem ou email. Depois de confirmares, não voltam a ser mostradas.</Note>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {pendingWords.split(' ').map((word, i) => <View key={i} style={{ width: '47%', backgroundColor: colors.bg, borderColor: colors.border,
        borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
        <Text style={styles.text}>{i + 1}. {word}</Text>
      </View>)}
    </View>
    <View style={styles.row}><Text style={[styles.subtitle, { flex: 1 }]}>Escrevi as 12 palavras pela ordem e guardei-as fora deste telemóvel.</Text>
      <Switch accessibilityLabel="Confirmar que guardei as 12 palavras" value={saved} onValueChange={setSaved} /></View>
    <Button title="Confirmar e ativar a sincronização" disabled={busy || !saved} onPress={() => void run(async () => {
      await session.confirmSeedSaved(); setSaved(false); setPendingWords(null); await refresh();
    })} />
  </Card>;

  if (!status) return <Card title="Sincronizar entre dispositivos">
    <Note>Saldos, movimentos, posições e planos são cifrados neste telemóvel antes de saírem. O servidor guarda-os sem os conseguir ler. As chaves das corretoras nunca saem deste dispositivo: em cada dispositivo novo voltas a ligá-las.</Note>
    <Note danger>A seed de 12 palavras é a única forma de abrir os dados noutro dispositivo. Se perderes todos os dispositivos e a seed, ninguém os consegue recuperar — nem o Money OS.</Note>
    <Choices value={mode} values={[{ value: 'register', label: 'Criar conta' }, { value: 'login', label: 'Já tenho conta' }]} onChange={setMode} />
    <Field label="Endereço do servidor" value={server} onChangeText={setServer} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
    <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
    <Field label={mode === 'register' ? 'Palavra-passe da conta (mínimo de 12 caracteres)' : 'Palavra-passe da conta'} value={password}
      onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="off" />
    <Note>A palavra-passe abre a conta, não os dados. Os dados só se abrem com a seed.</Note>
    <Field label="Nome deste dispositivo" value={deviceName} onChangeText={setDeviceName} placeholder="Telemóvel" />
    {mode === 'login' ? <Field label="As 12 palavras da seed, pela ordem" value={seedWords} onChangeText={setSeedWords}
      autoCapitalize="none" autoComplete="off" textContentType="none" multiline /> : null}
    <Button title={mode === 'register' ? 'Criar conta e gerar a seed' : 'Entrar neste dispositivo'}
      disabled={busy || !server.trim() || !email.trim() || !password || !deviceName.trim() || (mode === 'login' && !seedWords.trim())}
      onPress={() => void run(async () => {
        const started = await session.startSync({ server: server.trim(), email: email.trim(), password,
          deviceName: deviceName.trim(), mode, seedWords });
        setPassword(''); setSeedWords('');
        if (started.seedWords) setPendingWords(started.seedWords);
        await refresh();
      })} />
  </Card>;

  return <>
    <Card title="Sincronização ativa">
      <Note>Servidor: {status.server}</Note>
      <Note>{status.version ? `Versão sincronizada neste dispositivo: ${status.version}.` : 'Este dispositivo ainda não sincronizou.'}</Note>
      <Note>A sincronização não é automática: carrega em “Sincronizar agora” para juntar os dados deste e dos outros dispositivos. Cada dispositivo lê as corretoras com as suas próprias chaves.</Note>
      <Button title="Sincronizar agora" disabled={busy} onPress={() => void run(async () => {
        const { outcome, applied } = await session.syncNow(); setResult(describeSync(outcome, applied)); await refresh();
      })} />
      {result ? <Note>{result}</Note> : null}
    </Card>
    <Card title="Dispositivos desta conta">
      <Note>Revogar um dispositivo impede-o de receber dados novos. Não apaga o que já lá está: se foi roubado, revoga também na corretora as chaves de API que estavam nesse dispositivo.</Note>
      <Button title={devices ? 'Atualizar lista' : 'Ver dispositivos'} secondary disabled={busy}
        onPress={() => void run(async () => setDevices(await session.syncDevices()))} />
      {devices?.map(device => <View key={device.id} style={{ gap: 6 }}>
        <Text style={styles.label}>{device.name}{device.current ? ' · este dispositivo' : ''}</Text>
        <Note>{device.revokedAt ? `Revogado em ${new Date(device.revokedAt).toLocaleString('pt-PT')}.`
          : device.lastSeenAt ? `Última utilização: ${new Date(device.lastSeenAt).toLocaleString('pt-PT')}.` : 'Ainda não usado.'}</Note>
        {!device.current && !device.revokedAt ? (revoking === device.id ? <>
          <Button title={`Confirmar revogação de ${device.name}`} danger disabled={busy} onPress={() => void run(async () => {
            await session.revokeSyncDevice(device.id); setRevoking(null); setDevices(await session.syncDevices());
          })} />
          <Button title="Cancelar" secondary onPress={() => setRevoking(null)} />
        </> : <Button title="Revogar" secondary disabled={busy} onPress={() => setRevoking(device.id)} />) : null}
      </View>)}
    </Card>
    <Card title="Deixar de sincronizar neste dispositivo">
      <Note>Os dados deste telemóvel ficam todos, e a conta e os outros dispositivos não são afetados. Para voltar a sincronizar vais precisar da seed.</Note>
      <Field label="Escreve PARAR para confirmar" value={stop} onChangeText={setStop} autoCapitalize="characters" />
      <Button title="Deixar de sincronizar" danger disabled={busy || stop !== 'PARAR'} onPress={() => void run(async () => {
        await session.stopSync(); setStop(''); setResult(''); setDevices(null); await refresh();
      })} />
    </Card>
  </>;
}
