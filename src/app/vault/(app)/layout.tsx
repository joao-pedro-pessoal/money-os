import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeContext";
import { LanguageProvider } from "@/components/LanguageContext";
import { PrivacyProvider } from "@/components/PrivacyContext";
import { NavProvider } from "@/components/NavContext";
import VaultShell from "@/components/vault/VaultShell";

export const dynamic = "force-dynamic";

/**
 * Its own manifest, so "Add to home screen" from here opens here.
 *
 * The site's manifest starts at `/`, which for anyone but the owner is a
 * password they do not have: an installed vault opened on the owner's login
 * page, one tap away from where it should have been.
 */
export const metadata: Metadata = {
  title: "Your vault · Money OS",
  manifest: "/vault/manifest.webmanifest",
};

/**
 * Where someone who is not the owner of this installation keeps their money
 * records: their own account, their own vault, encrypted in their browser.
 *
 * The same providers as the owner's pages — theme, language, hidden values,
 * the menu drawer — so the frame and its buttons behave the same. None of
 * them reads the owner's records. The pages carry no data: the server has
 * nothing readable to put in them, which is the point of the arrangement.
 */
export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <PrivacyProvider>
          <NavProvider>
            <VaultShell>{children}</VaultShell>
          </NavProvider>
        </PrivacyProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
