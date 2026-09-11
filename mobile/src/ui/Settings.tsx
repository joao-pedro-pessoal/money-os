import { useState } from 'react';
import { Text, View, Switch } from 'react-native';
import { randomUUID, getRandomBytesAsync } from 'expo-crypto';
import { emptyState, type LocalState, type PlatformId } from '../domain/model';
import { decryptBackup, encryptBackup } from '../domain/backup';
import { previewCsv, commitCsv, type ImportPreview } from '../domain/imports';
import { MobileSession } from '../services/session';
import { PLATFORM_DETAILS } from '../services/network-policy';
import { readUserFile, shareEncryptedBackup } from '../services/files';
import { Button, Card, Choices, Field, Note, Page, styles, type External, type Run } from './kit';
import { SyncSettings } from './SyncSettings';

export function Settings({ state, session, run, busy, external, lock }: {
  state: LocalState; session: MobileSession; run: Run; busy: boolean; external: External; lock: () => void;
}) {
  const [section, setSection] = useState<'connections' | 'sync' | 'data' | 'privacy'>('connections');
  const [platform, setPlatform] = useState<PlatformId>('trading212');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [address, setAddress] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [reconnectId, setReconnectId] = useState<string>();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [restored, setRestored] = useState<LocalState | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [importAccount, setImportAccount] = useState('');
  const [importMode, setImportMode] = useState<'bank' | 'broker'>('broker');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [notice, setNotice] = useState('');
  const [erase, setErase] = useState('');
  const details = PLATFORM_DETAILS[platform];
  const selectedAccount = state.accounts.find(a => a.id === importAccount) ?? state.accounts[0];
  function clearKeys() { setApiKey(''); setApiSecret(''); setPassphrase(''); setAddress(''); setReadOnly(false); }
  return <Page title="As tuas definições" subtitle="Ligações diretas. Dados sob o teu controlo.">
    <Choices value={section} values={[{ value: 'connections', label: 'Ligações' }, { value: 'sync', label: 'Sincronização' }, { value: 'data', label: 'Dados' }, { value: 'privacy', label: 'Privacidade' }]} onChange={setSection} />
    {notice ? <Card><Note>{notice}</Note></Card> : null}
    {section === 'connections' ? <>
      {state.accounts.filter(a => a.platform).map(account => <Card key={account.id} title={account.name}>
        <Note>{PLATFORM_DETAILS[account.platform!].scope}</Note>
        <Note>{account.syncedAt ? `Última leitura: ${new Date(account.syncedAt).toLocaleString('pt-PT')}` : 'Sem leitura. O saldo não foi medido.'}</Note>
        {account.credentialRef ? <>
          <Button title="Sincronizar agora" disabled={busy} onPress={() => void run(() => session.sync(account.id))} />
          <Button title="Desligar e apagar credenciais" secondary disabled={busy} onPress={() => void run(() => session.disconnect(account))} />
        </> : <Button title="Voltar a ligar" secondary disabled={busy} onPress={() => { clearKeys(); setPlatform(account.platform!); setName(account.name); setReconnectId(account.id); }} />}
      </Card>)}
      <Card title={reconnectId ? `Voltar a ligar ${name}` : 'Ligar uma corretora'}>
        {!reconnectId ? <Choices value={platform} values={Object.entries(PLATFORM_DETAILS).map(([value, info]) => ({ value: value as PlatformId, label: info.name }))}
          onChange={value => { setPlatform(value); clearKeys(); }} /> : <Button title="Cancelar reconexão" secondary onPress={() => { setReconnectId(undefined); clearKeys(); }} />}
        <Note>{details.scope}</Note>
        <Field label="Nome da conta" value={name} onChangeText={setName} placeholder={details.name} />
        {details.secret ? <>
          <Field label="Chave API" value={apiKey} onChangeText={setApiKey} secureTextEntry autoCapitalize="none" textContentType="none" autoComplete="off" />
          <Field label="Segredo API" value={apiSecret} onChangeText={setApiSecret} secureTextEntry autoCapitalize="none" textContentType="none" autoComplete="off" />
          {platform === 'okx' ? <Field label="Passphrase da API" value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" textContentType="none" autoComplete="off" /> : null}
        </> : <Field label="Endereço público 0x…" value={address} onChangeText={setAddress} autoCapitalize="none" />}
        <View style={styles.row}><Text style={[styles.subtitle, { flex: 1 }]}>{details.secret ? 'Criei estas credenciais apenas com permissões de leitura, sem ordens nem levantamentos.' : 'Este é apenas o endereço público. Não estou a fornecer uma chave privada.'}</Text>
          <Switch accessibilityLabel="Confirmar acesso apenas de leitura" value={readOnly} onValueChange={setReadOnly} /></View>
        <Button title="Guardar ligação no dispositivo" disabled={busy || !readOnly} onPress={() => void run(async () => {
          await session.connect(name.trim() || details.name, platform, { apiKey: apiKey.trim(), apiSecret: apiSecret.trim(),
            passphrase, address: address.trim(), readOnlyConfirmed: true }, reconnectId);
          clearKeys(); setName(''); setReconnectId(undefined); setNotice('Ligação guardada. Usa “Sincronizar agora” para consultar a corretora.');
        })} />
      </Card>
      <Card title="Outras plataformas"><Note>Trade Republic e plataformas sem API compatível: importa o extrato. O conector IBKR atual depende de um gateway num computador e não é oferecido como ligação direta nesta app.</Note></Card>
    </> : null}
    {section === 'sync' ? <SyncSettings session={session} run={run} busy={busy} /> : null}
    {section === 'data' ? <>
      <Card title="Importar um extrato CSV">
        {selectedAccount ? <>
          <Choices value={selectedAccount.id} values={state.accounts.map(a => ({ value: a.id, label: a.name }))} onChange={value => { setImportAccount(value); setPreview(null); }} />
          <Choices value={importMode} values={[{ value: 'broker', label: 'Investimentos' }, { value: 'bank', label: 'Banco' }]} onChange={value => { setImportMode(value); setPreview(null); }} />
          <Note>Importa o histórico. O saldo atual da conta mantém-se, para evitar contar movimentos antigos uma segunda vez. Confirma a moeda do ficheiro antes de continuar.</Note>
          <Button title="Escolher CSV" disabled={busy} onPress={() => void run(async () => {
            const file = await external(readUserFile); if (!file) return;
            setPreview(previewCsv(file.text, session.vault.snapshot(), selectedAccount.id, importMode, randomUUID));
          })} />
          {preview ? <>
            <Note>{preview.rows.length} novos movimentos · {preview.duplicates} já existentes.</Note>
            {preview.problems.slice(0, 8).map((p, i) => <Note key={i} danger>{p}</Note>)}
            {preview.rows.slice(0, 5).map(row => <Note key={row.id}>{row.date.slice(0, 10)} · {row.type} {row.symbol} · {row.amount} {row.currency}</Note>)}
            <Button title="Confirmar importação" disabled={busy || !!preview.problems.length || !preview.rows.length} onPress={() => void run(async () => {
              await session.vault.update(draft => commitCsv(draft, preview)); setPreview(null); setNotice('Histórico importado. O saldo atual não foi alterado.');
            })} />
          </> : null}
        </> : <Note>Adiciona primeiro a conta à qual pertence o extrato.</Note>}
      </Card>
      <Card title="Backup cifrado">
        <Note>A palavra-passe protege o ficheiro. Não a conseguimos recuperar. As chaves das corretoras ficam excluídas; após um restauro terás de voltar a ligá-las.</Note>
        <Field label="Palavra-passe (mínimo de 12 caracteres)" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="off" />
        <Field label="Repetir palavra-passe para exportar" value={repeat} onChangeText={setRepeat} secureTextEntry autoCapitalize="none" autoComplete="off" />
        <Button title="Exportar backup cifrado" disabled={busy} onPress={() => void run(async () => {
          if (password !== repeat) throw new Error('As palavras-passe não coincidem.');
          const encrypted = await encryptBackup(session.vault.snapshot(), password, getRandomBytesAsync);
          await external(() => shareEncryptedBackup(encrypted)); setPassword(''); setRepeat(''); setNotice('Escolhe onde guardar o ficheiro e confirma que ficou disponível nesse destino.');
        })} />
        <Button title="Escolher backup para restaurar" secondary disabled={busy} onPress={() => void run(async () => {
          const file = await external(readUserFile); if (!file) return;
          setRestored(await decryptBackup(file.text, password)); setPassword(''); setRepeat(''); setConfirmation('');
        })} />
        {restored ? <>
          <Note danger>Substitui todos os dados atuais por {restored.accounts.length} contas, {restored.events.length} movimentos, {restored.snapshots.length} leituras, {restored.goals.length} objetivos e {restored.commitments.length} compromissos.</Note>
          <Field label="Escreve RESTAURAR para confirmar" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
          <Button title="Substituir dados por este backup" danger disabled={busy || confirmation !== 'RESTAURAR'} onPress={() => void run(async () => {
            await session.restore(restored); setRestored(null); setConfirmation(''); setNotice('Backup restaurado. Volta a ligar as corretoras quando quiseres atualizar os saldos.');
          })} />
          <Button title="Cancelar restauro" secondary onPress={() => setRestored(null)} />
        </> : null}
      </Card>
    </> : null}
    {section === 'privacy' ? <>
      <Card title="Os dados ficam contigo">
        <Note>A base financeira é cifrada neste telemóvel. As credenciais das corretoras ficam no Keychain/Keystore do dispositivo e nunca saem dele. Não há publicidade nem análise de utilização.</Note>
        <Note>Se ativares a sincronização, o cofre é cifrado neste telemóvel com a tua seed antes de ser enviado. O servidor guarda-o sem o conseguir ler, e fica a saber o teu email, o nome de cada dispositivo e quando foi usado pela última vez.</Note>
        <Note>Ao ler uma corretora, o teu dispositivo contacta-a diretamente. Essa corretora recebe os pedidos e o endereço IP, segundo a sua política de privacidade.</Note>
        <Note>Os backups automáticos do sistema estão desativados para os dados da app. Um backup manual só sai do dispositivo para o destino que escolheres no menu de partilha.</Note>
        <Note>Sem sincronização nem backup manual, perder o dispositivo é perder os dados. Com sincronização, recuperas noutro dispositivo com a seed; sem a seed, ninguém os consegue recuperar. Não há sincronização automática em segundo plano.</Note>
        <Button title="Bloquear agora" secondary onPress={lock} />
      </Card>
      <Card title="Apagar os dados locais">
        <Note danger>Apaga contas, histórico, objetivos e credenciais desta instalação. Os ficheiros de backup que guardaste noutros locais não são apagados.</Note>
        <Field label="Escreve APAGAR para confirmar" value={erase} onChangeText={setErase} autoCapitalize="characters" />
        <Button title="Apagar dados deste dispositivo" danger disabled={busy || erase !== 'APAGAR'} onPress={() => void run(async () => {
          await session.restore(emptyState()); setErase(''); setNotice('Dados locais apagados.');
        })} />
      </Card>
    </> : null}
  </Page>;
}
