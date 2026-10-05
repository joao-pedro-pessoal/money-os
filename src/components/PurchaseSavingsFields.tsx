"use client";

import { useLanguage } from "./LanguageContext";

export default function PurchaseSavingsFields({ discountAmount = '', cashbackExpected = '' }: {
  discountAmount?: string; cashbackExpected?: string;
}) {
  const w = useLanguage().m.quickEntry;
  return <details className="space-y-3">
    <summary className="cursor-pointer text-sm py-2">{w.savingsSummary}</summary>
    <p className="text-xs text-[var(--muted)]">{w.savingsIntro}</p>
    <label className="block text-sm">{w.discount}
      <input name="discountAmount" inputMode="decimal" className="input mt-1" defaultValue={discountAmount} placeholder="0.00" />
    </label>
    <label className="block text-sm">{w.originalPrice}
      <input name="originalPrice" inputMode="decimal" className="input mt-1" placeholder={w.originalPriceHint} />
    </label>
    <label className="block text-sm">{w.cashback}
      <input name="cashbackExpected" inputMode="decimal" className="input mt-1" defaultValue={cashbackExpected} placeholder="0.00" />
    </label>
    <p className="text-xs text-[var(--muted)]">{w.savingsAfter}</p>
  </details>;
}
