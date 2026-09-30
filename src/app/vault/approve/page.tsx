import type { Metadata } from "next";
import VaultApproveSignIn from "@/components/vault/VaultApproveSignIn";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Let a computer in · Money OS",
  manifest: "/vault/manifest.webmanifest",
  // The code's key is in this page's address; no other site needs to be told where it came from.
  referrer: "no-referrer",
};

/**
 * Where a phone lands after scanning a computer's "Sign in with your phone"
 * code. The page carries nothing: the code is in the address fragment, read by
 * the page and never sent.
 */
export default function VaultApprovePage() {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Your vault</h1>
      </header>
      <VaultApproveSignIn />
    </main>
  );
}
