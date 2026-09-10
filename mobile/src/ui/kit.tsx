import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
export const colors = { bg: '#0B1412', card: '#15221E', border: '#2B3C34', ink: '#F3F4ED', muted: '#9BB0A4', accent: '#D4EC9A', danger: '#FFADA1' };
export const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40, gap: 18 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.7 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  label: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  text: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.card, borderRadius: 20, borderColor: colors.border, borderWidth: 1, padding: 18, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  input: { backgroundColor: colors.bg, color: colors.ink, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 50 },
});
export function Page({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <View style={{ gap: 8 }}><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>{children}
  </ScrollView>;
}
export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return <View style={styles.card}>{title ? <Text style={styles.label}>{title}</Text> : null}{children}</View>;
}
export function Note({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return <Text style={[styles.subtitle, danger ? { color: colors.danger } : null]}>{children}</Text>;
}
export function Button({ title, onPress, disabled, secondary, danger }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; danger?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => ({ backgroundColor: secondary ? colors.card : danger ? colors.danger : colors.accent,
      borderColor: colors.border, borderWidth: 1, minHeight: 48, paddingVertical: 12, paddingHorizontal: 16,
      borderRadius: 13, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
    <Text style={{ color: secondary ? colors.ink : colors.bg, fontWeight: '700', fontSize: 14 }}>{title}</Text>
  </Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 7 }}><Text style={styles.subtitle}>{label}</Text><TextInput accessibilityLabel={label}
    placeholderTextColor={colors.muted} style={styles.input} autoCorrect={false} {...props} /></View>;
}
export function Choices<T extends string>({ value, values, onChange }: { value: T; values: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{values.map(item => <Pressable key={item.value}
    accessibilityRole="radio" accessibilityState={{ selected: item.value === value }} onPress={() => onChange(item.value)}
    style={{ paddingHorizontal: 13, paddingVertical: 12, minHeight: 44, borderRadius: 12, backgroundColor: item.value === value ? colors.accent : colors.bg, borderColor: colors.border, borderWidth: 1 }}>
    <Text style={{ color: item.value === value ? colors.bg : colors.ink, fontWeight: '600' }}>{item.label}</Text>
  </Pressable>)}</View>;
}
export function money(amount: string | number | null, currency: string): string {
  if (amount === null) return 'Por medir';
  try { return new Intl.NumberFormat('pt-PT', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount)); }
  catch { return `${Number(amount).toFixed(2)} ${currency}`; }
}
export type Run = (action: () => Promise<unknown>) => Promise<void>;
export type External = <T>(action: () => Promise<T>) => Promise<T>;
