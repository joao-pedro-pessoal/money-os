import { PrivacyProvider } from "@/components/PrivacyContext";
import Nav from "@/components/Nav";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivacyProvider>
      <div className="flex">
        <Nav />
        <main className="flex-1 p-8 max-w-5xl">{children}</main>
      </div>
    </PrivacyProvider>
  );
}
