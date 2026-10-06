import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { currentLanguage } from "@/actions/language";
import { legalDocument, operatorFrom } from "@/lib/legal/documents";

export async function generateMetadata(): Promise<Metadata> {
  const doc = legalDocument("deletion", await currentLanguage(), operatorFrom(process.env));
  return { title: `${doc.title} · Money OS` };
}

/** Public: lib/accounts/publicPaths.ts lets it through without a session. */
export default function DeletionPage() {
  return <LegalPage kind="deletion" />;
}
