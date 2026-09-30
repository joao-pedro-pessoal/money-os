import type { Metadata } from "next";
import { VaultAccountsPage } from "@/components/vault/VaultPages";

export const metadata: Metadata = { title: "Accounts · Your vault" };

export default function Page() {
  return <VaultAccountsPage />;
}
