import { PrivacyProvider } from "@/components/PrivacyContext";
import { ThemeProvider } from "@/components/ThemeContext";
import Nav from "@/components/Nav";
import { NavProvider } from "@/components/NavContext";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <PrivacyProvider>
        <NavProvider>
          <div className="flex">
            <Nav />
            {/*
              `min-w-0` is what stops a wide table from pushing the whole page
              sideways: a flex child defaults to min-width:auto, so its content
              sets the floor and the sidebar gets shoved off screen. With it,
              the table scrolls inside its own container instead.
            */}
            <div className="flex-1 min-w-0 flex flex-col">
              <TopBar />
              <main className="flex-1 p-4 md:p-8 max-w-5xl">{children}</main>
            </div>
          </div>
        </NavProvider>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
