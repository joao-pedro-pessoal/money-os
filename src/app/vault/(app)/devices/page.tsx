import type { Metadata } from "next";
import { VaultDevicesPage } from "@/components/vault/VaultPages";

export const metadata: Metadata = { title: "Devices · Your vault" };

export default function Page() {
  return <VaultDevicesPage />;
}
