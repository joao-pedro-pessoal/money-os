import { describe, expect, it } from "vitest";
import { LEGAL_KINDS, legalDocument, operatorFrom, updatedOn, type LegalDocument } from "../documents";
import { LANGUAGES } from "@/lib/i18n/languages";
import { messagesFor } from "@/lib/i18n/messages";

const someone = { name: "Ana Exemplo", email: "privacy@example.org" };
const nobody = { name: null, email: null };
const all = (doc: LegalDocument) => [doc.title, doc.intro, ...doc.sections.flatMap((s) => [s.heading, ...s.paragraphs])].join("\n");

describe("who runs the site", () => {
  it("is read from the environment, trimmed, with an email that is one", () => {
    expect(operatorFrom({ OPERATOR_NAME: "  Ana  ", CONTACT_EMAIL: " a@b.pt " })).toEqual({ name: "Ana", email: "a@b.pt" });
    expect(operatorFrom({})).toEqual(nobody);
    expect(operatorFrom({ OPERATOR_NAME: "", CONTACT_EMAIL: "   " })).toEqual(nobody);
    expect(operatorFrom({ CONTACT_EMAIL: "not an address" }).email).toBeNull();
  });

  it("is named, with the address to write to, on every page that needs one", () => {
    for (const { code } of LANGUAGES) {
      expect(all(legalDocument("privacy", code, someone))).toContain("Ana Exemplo");
      for (const kind of LEGAL_KINDS) expect(all(legalDocument(kind, code, someone))).toContain("privacy@example.org");
    }
  });

  it("still says where to write when no address is set, and invents none", () => {
    for (const { code } of LANGUAGES) {
      for (const kind of LEGAL_KINDS) {
        const text = all(legalDocument(kind, code, nobody));
        expect(text).toContain("Google Play");
        expect(text).not.toMatch(/[^\s@()]+@[^\s@()]+\.[a-z]{2,}/);
      }
    }
  });
});

describe("the two languages", () => {
  it("say the same things, section for section and paragraph for paragraph", () => {
    for (const kind of LEGAL_KINDS) {
      const shape = (code: "en" | "pt") => legalDocument(kind, code, someone).sections.map((s) => s.paragraphs.length);
      expect(shape("pt")).toEqual(shape("en"));
    }
  });

  it("put each paragraph in the same place, so a reader switching language finds it", () => {
    for (const kind of LEGAL_KINDS) {
      const lead = (code: "en" | "pt") =>
        legalDocument(kind, code, someone).sections.map((s) => s.paragraphs.map((p) => /^\*\*[^*]+:\*\*/.test(p)));
      expect(lead("pt")).toEqual(lead("en"));
    }
    const where = (code: "en" | "pt", word: string) =>
      legalDocument("privacy", code, someone).sections.flatMap((s) => s.paragraphs).findIndex((p) => p.includes(word));
    expect(where("pt", "Widgets Android")).toBe(where("en", "Android widgets"));
  });

  it("date the text in each language's own way", () => {
    expect(updatedOn("en")).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
    expect(updatedOn("pt")).toMatch(/^\d{1,2} de [a-zç]+ de \d{4}$/);
  });
});

describe("what the pages claim", () => {
  // docs/LEGAL_SECURITY_CHECKLIST.md: never claim these.
  const NEVER = [/completely safe/i, /fraud-proof/i, /real-time/i, /fully accurate/i, /100 ?%/, /totalmente segur/i, /à prova de fraude/i, /tempo real/i];

  it("never promise what no service can", () => {
    for (const { code } of LANGUAGES) {
      for (const kind of LEGAL_KINDS) {
        const text = all(legalDocument(kind, code, someone));
        for (const claim of NEVER) expect(text).not.toMatch(claim);
      }
    }
  });

  it("say plainly that the app moves no money and gives no advice", () => {
    expect(all(legalDocument("terms", "en", someone))).toMatch(/cannot buy, sell, transfer or withdraw/);
    expect(all(legalDocument("terms", "pt", someone))).toMatch(/Não compra, não vende, não transfere nem levanta/);
  });

  it("do not say only you can see your records: whoever runs the database can", () => {
    expect(all(legalDocument("privacy", "en", someone))).toMatch(/has technical access/);
    expect(all(legalDocument("privacy", "pt", someone))).toMatch(/tem, por isso, acesso técnico/);
  });

  it("name the buttons as the app names them, so the steps can be followed", () => {
    for (const { code } of LANGUAGES) {
      const m = messagesFor(code);
      const deletion = all(legalDocument("deletion", code, someone));
      expect(deletion).toContain(m.nav.settings);
      expect(deletion).toContain(m.settings.accountTitle);
      expect(deletion).toContain(m.account.deleteStart);
      expect(deletion).toContain(m.auth.forgot);
      expect(all(legalDocument("privacy", code, someone))).toContain(m.labels["Your data"] ?? "Your data");
    }
  });

  it("tell someone uninstalling the app that it does not delete the account", () => {
    expect(all(legalDocument("deletion", "en", someone))).toMatch(/Uninstalling the app does \*\*not\*\* delete the account/);
    expect(all(legalDocument("deletion", "pt", someone))).toMatch(/Desinstalar a app \*\*não\*\* apaga a conta/);
  });
});
