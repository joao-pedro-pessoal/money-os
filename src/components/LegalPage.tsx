import Link from "next/link";
import LanguagePicker from "./LanguagePicker";
import { currentLanguage } from "@/actions/language";
import { messagesFor } from "@/lib/i18n/messages";
import { LEGAL_KINDS, LEGAL_PATHS, legalDocument, operatorFrom, updatedOn, type LegalKind } from "@/lib/legal/documents";

/**
 * The privacy notice, the terms or the account-deletion page, for anyone:
 * signed in or not, in the app or in a browser. The words are in
 * lib/legal/documents.ts; this only lays them out.
 */
export default async function LegalPage({ kind }: { kind: LegalKind }) {
  const language = await currentLanguage();
  const doc = legalDocument(kind, language, operatorFrom(process.env));
  const w = messagesFor(language).legal;
  const names: Record<LegalKind, string> = { privacy: w.privacy, terms: w.terms, deletion: w.deletion };

  return (
    <div translate="no" lang={language} className="app-frame">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8 sm:py-12 space-y-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="auth-mark" aria-hidden="true">
              M
            </span>
            <span style={{ fontFamily: "var(--font-heading)" }} className="text-xl tracking-tight whitespace-nowrap text-[var(--foreground)]">
              {w.back}
            </span>
          </Link>
          {/* In its own box, as on the sign-in page: the input rule would otherwise stretch it. */}
          <div className="shrink-0">
            <LanguagePicker className="input w-auto py-1 text-sm" />
          </div>
        </header>

        <nav aria-label={w.pages} className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LEGAL_KINDS.map((k) =>
            k === kind ? (
              <span key={k} aria-current="page" className="font-medium text-[var(--foreground)]">
                {names[k]}
              </span>
            ) : (
              <Link key={k} href={LEGAL_PATHS[k]} className="text-[var(--accent)] hover:underline">
                {names[k]}
              </Link>
            )
          )}
        </nav>

        <article className="space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl tracking-tight text-[var(--foreground)]">{doc.title}</h1>
            <p className="text-xs text-[var(--muted)]">
              {doc.updatedLabel}: {updatedOn(language)}
            </p>
            <p className="text-sm text-[var(--muted)] leading-relaxed">{doc.intro}</p>
          </div>
          {doc.sections.map((section) => (
            <section key={section.heading} className="space-y-3">
              <h2 className="text-lg font-medium text-[var(--foreground)]">{section.heading}</h2>
              {section.paragraphs.map((text) => (
                <p key={text} className="text-sm leading-relaxed text-[var(--foreground)]">
                  <Linked text={text} />
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}

/** `**bold**`, https addresses and email addresses, drawn as what they are. */
const PIECES = /(\*\*[^*]+\*\*|https:\/\/[^\s)]+|[^\s@()]+@[^\s@()]+\.[a-z]{2,})/g;

function Linked({ text }: { text: string }) {
  return (
    <>
      {text.split(PIECES).map((part, i) => {
        if (i % 2 === 0) return part;
        if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
        // An address at the end of a sentence keeps its full stop outside the link.
        const trail = part.match(/[.,;]+$/)?.[0] ?? "";
        const target = trail ? part.slice(0, -trail.length) : part;
        const href = target.startsWith("https://") ? target : `mailto:${target}`;
        return (
          <span key={i}>
            <a href={href} className="text-[var(--accent)] hover:underline break-all" rel="noreferrer">
              {target}
            </a>
            {trail}
          </span>
        );
      })}
    </>
  );
}
