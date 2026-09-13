export default function PurchaseSavingsFields({ discountAmount = '', cashbackExpected = '' }: {
  discountAmount?: string; cashbackExpected?: string;
}) {
  return <details className="space-y-3">
    <summary className="cursor-pointer text-sm py-2">Purchase savings · discount and cashback</summary>
    <p className="text-xs text-[var(--muted)]">Expenses only, in the purchase currency. Amount is what you actually paid. A cashback deducted at checkout is a discount.</p>
    <label className="block text-sm">Discount / money saved
      <input name="discountAmount" inputMode="decimal" className="input mt-1" defaultValue={discountAmount} placeholder="0.00" />
    </label>
    <label className="block text-sm">Or original price
      <input name="originalPrice" inputMode="decimal" className="input mt-1" placeholder="Optional — leave discount blank to calculate" />
    </label>
    <label className="block text-sm">Total cashback expected
      <input name="cashbackExpected" inputMode="decimal" className="input mt-1" defaultValue={cashbackExpected} placeholder="0.00" />
    </label>
    <p className="text-xs text-[var(--muted)]">After saving, open Savings to link cashback already received or record its receipt. For a return, correct the retained discount and expected cashback here; record the actual refund separately.</p>
  </details>;
}
