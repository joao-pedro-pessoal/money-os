import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { Money, Bare } from "@/components/PrivacyContext";
import { LanguageProvider } from "@/components/LanguageContext";
import PageTabs from "@/components/PageTabs";
import { ACCOUNTS_TABS } from "@/lib/navigation";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), usePathname: () => "/accounts" }));

describe("translation boundaries", () => {
  it("keeps monetary values outside automatic translation", () => {
    for (const element of [createElement(Money, { value: 12.34 }), createElement(Bare, { value: 12.34 })]) {
      expect(renderToStaticMarkup(element)).toMatch(/^<span translate="no">/);
    }
  });
  it("marks translated tabs with their actual language and protects their wording", () => {
    const props = { language: "pt" as const, children: createElement(PageTabs, { tabs: ACCOUNTS_TABS }) };
    const html = renderToStaticMarkup(createElement(LanguageProvider, props));
    expect(html).toContain('translate="no" lang="pt"');
    expect(html).toContain("Contas");
  });
  it("labels the fully translated document with its selected language", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain('<html lang={language}');
    expect(layout).toContain('translate="no"');
    expect(layout).not.toMatch(/google:\s*["']notranslate/);
    const context = readFileSync("src/components/LanguageContext.tsx", "utf8");
    expect(context).not.toContain("document.documentElement.lang = next");
    // The layout keeps its own translated heading without wrapping the pages
    // in a second translation region.
    const settings = readFileSync("src/app/(app)/settings/layout.tsx", "utf8");
    expect(settings).not.toMatch(/<div translate="no"/);
    expect(settings).toContain('<h1 translate="no" lang={language}');
  });
});
