import type { Metadata } from "next";
import VaultLinkJoin from "@/components/vault/VaultLinkJoin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open your vault · Money OS",
  manifest: "/vault/manifest.webmanifest",
  // The code's key is in this page's address; no other site needs to be told where it came from.
  referrer: "no-referrer",
};

/**
 * Where a scanned code lands on the phone. The page carries nothing: the code
 * is in the address fragment, read by the page and never sent.
 */
export default function VaultLinkPage() {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Your vault</h1>
      </header>
      <VaultLinkJoin />
    </main>
  );
}
