import type { Metadata } from "next";
import { VaultCashFlowPage } from "@/components/vault/VaultPages";

export const metadata: Metadata = { title: "Cash Flow · Your vault" };

export default function Page() {
  return <VaultCashFlowPage />;
}
