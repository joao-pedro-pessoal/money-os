// Fixed-point decimal arithmetic for stored amounts. Never accumulate floats.
const SCALE = 100_000_000n;
export function units(value: string): bigint {
  if (!/^-?\d{1,12}(\.\d{1,8})?$/.test(value)) throw new Error('Montante inválido (máximo: 8 casas decimais).');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const amount = BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0'));
  return negative ? -amount : amount;
}
export function decimal(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % SCALE).toString().padStart(8, '0').replace(/0+$/, '');
  const result = `${value < 0n ? '-' : ''}${absolute / SCALE}${fraction ? `.${fraction}` : ''}`;
  units(result); // Refuse overflow of the stored domain as well as bad input.
  return result;
}
export function amountInput(value: string): string {
  return decimal(units(value.trim().replace(',', '.')));
}
export function add(a: string, b: string): string { return decimal(units(a) + units(b)); }
export function negate(a: string): string { return decimal(-units(a)); }
export function measured(value: number): string {
  if (!Number.isFinite(value)) throw new Error('A plataforma devolveu um valor inválido.');
  return decimal(units(value.toFixed(8)));
}
export function positive(value: string): string {
  const parsed = amountInput(value);
  if (units(parsed) <= 0n) throw new Error('O montante tem de ser positivo.');
  return parsed;
}
