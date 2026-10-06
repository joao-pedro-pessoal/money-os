import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { currentLanguage } from "@/actions/language";
import { legalDocument, operatorFrom } from "@/lib/legal/documents";

export async function generateMetadata(): Promise<Metadata> {
  const doc = legalDocument("privacy", await currentLanguage(), operatorFrom(process.env));
  return { title: `${doc.title} · Money OS` };
}

/** Public: lib/accounts/publicPaths.ts lets it through without a session. */
export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}
