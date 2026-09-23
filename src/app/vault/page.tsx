import VaultApp from "@/components/vault/VaultApp";

export const dynamic = "force-dynamic";

/**
 * Where someone who is not the owner of this installation keeps their money
 * records: their own account, their own vault, encrypted in their browser.
 *
 * The page itself carries no data. It cannot: the server has nothing readable
 * to put here, which is the point of the whole arrangement.
 */
export default function VaultPage() {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Your vault</h1>
        <p className="text-sm text-[var(--muted)]">
          An account of your own on this Money OS. What you record is encrypted on this device with twelve words only
          you have, and stored as something the server cannot read.
        </p>
      </header>
      <VaultApp />
    </main>
  );
}
