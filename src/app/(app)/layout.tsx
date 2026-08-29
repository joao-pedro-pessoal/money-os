import { PrivacyProvider } from "@/components/PrivacyContext";
import { ThemeProvider } from "@/components/ThemeContext";
import Nav from "@/components/Nav";
import { NavProvider } from "@/components/NavContext";
import TopBar from "@/components/TopBar";
import { getAlerts } from "@/actions/alerts";

export const dynamic = "force-dynamic";

/**
 * Alerts are read here rather than on each page so the bell is present
 * everywhere. It costs the queries behind `getAlerts` on every navigation,
 * which is the price of the warning being where you are rather than where you
 * happened to go looking.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { alerts } = await getAlerts();

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
              <TopBar alerts={alerts} />
              <main className="flex-1 p-4 md:p-8 max-w-5xl">{children}</main>
            </div>
          </div>
        </NavProvider>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
