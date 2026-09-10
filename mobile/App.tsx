import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as LocalAuthentication from 'expo-local-authentication';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { openVault } from './src/storage/database';
import { pruneUnusedCredentials } from './src/storage/secrets';
import { MobileSession } from './src/services/session';
import { clearTemporaryFiles } from './src/services/files';
import { Accounts } from './src/ui/Accounts';
import { Overview } from './src/ui/Overview';
import { Portfolio } from './src/ui/Portfolio';
import { Plans } from './src/ui/Plans';
import { Settings } from './src/ui/Settings';
import { Button, colors, Note, type External, type Run } from './src/ui/kit';

async function authenticate(): Promise<void> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE)
    throw new Error('Configura um código de bloqueio ou biometria no telemóvel antes de guardar dados financeiros.');
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Desbloquear Money OS',
    cancelLabel: 'Cancelar', fallbackLabel: 'Usar código do dispositivo', disableDeviceFallback: false,
    biometricsSecurityLevel: 'strong' });
  if (!result.success) throw new Error('O cofre continua bloqueado.');
}
function Unlocked({ session, external, lock }: { session: MobileSession; external: External; lock: () => void }) {
  const [state, setState] = useState(() => session.vault.snapshot());
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const run: Run = async action => {
    if (working.current) return;
    working.current = true; setBusy(true);
    try { await action(); }
    catch (error) { if (mounted.current) Alert.alert('Money OS', error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    finally {
      if (mounted.current && session.vault.isOpen) { setState(session.vault.snapshot()); setBusy(false); }
      working.current = false;
    }
  };
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color: colors.accent, fontWeight: '800', letterSpacing: 2, fontSize: 13 }}>MONEY OS</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Bloquear app" onPress={lock} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.muted, fontSize: 12 }}>COFRE LOCAL · BLOQUEAR</Text></Pressable>
    </View>
    {busy ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, padding: 12, alignItems: 'center' }}><ActivityIndicator color={colors.accent} /><Note>A concluir…</Note></View> : null}
    <View style={{ flex: 1 }}>
      {tab === 'overview' ? <Overview state={state} /> : null}
      {tab === 'accounts' ? <Accounts state={state} session={session} run={run} busy={busy} /> : null}
      {tab === 'portfolio' ? <Portfolio state={state} /> : null}
      {tab === 'plans' ? <Plans state={state} session={session} run={run} busy={busy} /> : null}
      {tab === 'settings' ? <Settings state={state} session={session} run={run} busy={busy} external={external} lock={lock} /> : null}
    </View>
    <View style={{ flexDirection: 'row', borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.bg }}>
      {[['overview', 'Resumo'], ['accounts', 'Contas'], ['portfolio', 'Carteira'], ['plans', 'Planos'], ['settings', 'Definições']].map(([id, label]) =>
        <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id, disabled: busy }} disabled={busy} onPress={() => setTab(id)}
          style={{ flex: 1, minHeight: 60, justifyContent: 'center', alignItems: 'center', borderTopWidth: 2, borderTopColor: tab === id ? colors.accent : 'transparent' }}>
          <Text style={{ color: tab === id ? colors.accent : colors.muted, fontSize: 11, fontWeight: '600' }}>{label}</Text>
        </Pressable>)}
    </View>
  </KeyboardAvoidingView>;
}
export default function App() {
  usePreventScreenCapture();
  const [session, setSession] = useState<MobileSession | null>(null);
  const [opening, setOpening] = useState(false);
  const [covered, setCovered] = useState(false);
  const current = useRef<MobileSession | null>(null);
  const closing = useRef<Promise<void>>(Promise.resolve());
  const systemDialog = useRef(false);
  const openingRef = useRef(false);
  const lock = useCallback(() => {
    const old = current.current;
    current.current = null; setSession(null); setCovered(false);
    if (old) closing.current = old.close().catch(() => undefined);
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      setCovered(next !== 'active' || systemDialog.current);
      if (next === 'background' && !systemDialog.current) lock();
    });
    return () => { subscription.remove(); void current.current?.close(); };
  }, [lock]);
  const unlock = async () => {
    if (openingRef.current) return;
    openingRef.current = true; setOpening(true);
    try {
      await closing.current;
      await authenticate();
      clearTemporaryFiles();
      const vault = await openVault();
      try {
        await pruneUnusedCredentials(vault.snapshot().accounts.map(a => a.credentialRef).filter((ref): ref is string => ref !== null));
      } catch (error) { await vault.close(); throw error; }
      if (AppState.currentState !== 'active') { await vault.close(); return; }
      const next = new MobileSession(vault);
      current.current = next; setSession(next); setCovered(false);
    } catch (error) { Alert.alert('Cofre bloqueado', error instanceof Error ? error.message : 'Não foi possível abrir o cofre.'); }
    finally { setOpening(false); openingRef.current = false; }
  };
  // Native file pickers/share sheets can background the app. Keep it covered,
  // then authenticate again before returning their result to the financial UI.
  const external: External = async action => {
    systemDialog.current = true;
    setCovered(true);
    try {
      const result = await action();
      await authenticate();
      if (!current.current || AppState.currentState !== 'active') throw new Error('Desbloqueia a app para continuar.');
      return result;
    } catch (error) { lock(); throw error; }
    finally { systemDialog.current = false; setCovered(false); }
  };
  return <SafeAreaProvider><StatusBar style="light" /><SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
    {session ? <Unlocked session={session} external={external} lock={lock} /> : <View style={{ flex: 1, padding: 30, justifyContent: 'center', gap: 24 }}>
      <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '800', letterSpacing: 4 }}>MONEY OS</Text>
      <Text style={{ color: colors.ink, fontSize: 40, fontWeight: '700', letterSpacing: -1.5 }}>O teu dinheiro.{'\n'}Só contigo.</Text>
      <Note>Contas, investimentos e planos num cofre cifrado no teu telemóvel. Sem criar conta. Sem enviar o teu património para um servidor Money OS.</Note>
      <Button title={opening ? 'A abrir o cofre…' : 'Desbloquear com o dispositivo'} disabled={opening} onPress={() => void unlock()} />
      <Note>Ao continuar, proteges o acesso com a biometria ou o código do teu dispositivo. Para recuperar os dados noutro telemóvel, cria um backup manual nas definições.</Note>
    </View>}
    {covered ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ color: colors.accent, fontSize: 20, letterSpacing: 3 }}>MONEY OS</Text><Note>Dados protegidos</Note>
    </View> : null}
  </SafeAreaView></SafeAreaProvider>;
}
