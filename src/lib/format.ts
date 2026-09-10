/** Formats an amount for note lines and tables. Locale-aware, nothing more. */
export function fmt(value: number, currency: string): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value);
}
