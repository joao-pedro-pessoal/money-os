import { PrivacyProvider } from "@/components/PrivacyContext";
import { ThemeProvider } from "@/components/ThemeContext";
import Nav from "@/components/Nav";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <PrivacyProvider>
        <div className="flex">
          <Nav />
          <div className="flex-1 flex flex-col">
            <TopBar />
            <main className="flex-1 p-8 max-w-5xl">{children}</main>
          </div>
        </div>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
