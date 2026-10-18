import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { catalogs, interpolate } from "../catalogs";
import { LANGUAGES, directionOf, isLanguage, languageOf, localeOf } from "../languages";
import { messagesFor } from "../messages";
import { en, pt } from "../source";
import { LanguageProvider } from "@/components/LanguageContext";
import LanguagePicker from "@/components/LanguagePicker";
import QrSignIn from "@/components/QrSignIn";
import { SEARCHABLE_PAGES, SETTINGS_TABS, INVESTMENT_TABS, ACCOUNTS_TABS, ANALYTICS_TABS } from "@/lib/navigation";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), usePathname: () => "/login" }));

function strings(tree: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [[path, value]] : typeof value === "object" ? Object.entries(strings(value, path)) : [];
  }));
}
const source = {
  ...strings(en),
  ...Object.fromEntries(Object.keys(pt.labels).map(key => [`labels.${key}`, key])),
  ...Object.fromEntries(Object.keys(pt.server).map(key => [`server.${key}`, key])),
  "nav.pagesFound": "Pages found: {count}", "auth.locked": en.auth.locked("{time}"),
  "quickEntry.amount": en.quickEntry.amount("{currency}"), "quickEntry.amountPlain": en.quickEntry.amount(null),
  "settings.sameAsBase": en.settings.sameAsBase("{currency}"), "settings.lastDone": en.settings.lastDone("{when}"),
};

describe("15 languages with complete shared catalogs", () => {
  it("offers 15 distinct valid locales and rejects untrusted cookie values", () => {
    expect(new Set(LANGUAGES.map(l => l.code)).size).toBe(15);
    for (const { code } of LANGUAGES) {
      expect(isLanguage(code)).toBe(true);
      expect(languageOf(code)).toBe(code);
      expect(Intl.DateTimeFormat.supportedLocalesOf(localeOf(code))).toHaveLength(1);
    }
    for (const bad of ["__proto__", "constructor", "PT", "en; path=/", ""]) {
      expect(isLanguage(bad)).toBe(false);
      expect(languageOf(bad)).toBe("en");
    }
  });

  for (const [language, catalog] of Object.entries(catalogs)) {
    it(`${language} has every message and preserves variables and emphasis`, () => {
      const text: Record<string, string> = catalog;
      expect(Object.keys(text).sort()).toEqual(Object.keys(source).sort());
      for (const [key, value] of Object.entries(source)) {
        expect(text[key].trim(), key).not.toBe("");
        expect(text[key], key).not.toMatch(/ZXQ\d+XQZ|undefined/);
        expect(text[key].match(/\{\w+\}/g) ?? [], key).toEqual(value.match(/\{\w+\}/g) ?? []);
        expect(text[key].match(/\*\*/g)?.length ?? 0, key).toBe(value.match(/\*\*/g)?.length ?? 0);
      }
    });
  }

  it("keeps literal currency and dynamic values intact", () => {
    expect(interpolate("{value}", { value: "$& {time}" })).toBe("$& {time}");
    for (const { code } of LANGUAGES) {
      const m = messagesFor(code);
      expect(m.quickEntry.amount("USD")).toContain("USD");
      expect(m.quickEntry.amount(null)).not.toMatch(/null|undefined|\{/);
      expect(m.auth.locked("13:57")).toContain("13:57");
      expect(m.settings.sameAsBase("JPY")).toContain("JPY");
      expect(m.settings.lastDone("2026-10-14")).toContain("2026-10-14");
      for (const count of [0, 1, 2, 5, 21, 100]) expect(m.nav.pagesFound(count)).toContain(String(count));
      for (const page of [...SEARCHABLE_PAGES, ...SETTINGS_TABS, ...INVESTMENT_TABS, ...ACCOUNTS_TABS, ...ANALYTICS_TABS]) {
        if (code !== "en") expect(m.labels[page.label], `${code}: ${page.label}`).toBeTruthy();
      }
    }
  });

  it.each(LANGUAGES)("renders the picker and QR warning in $code, with the correct direction", ({ code }) => {
    const html = renderToStaticMarkup(<LanguageProvider language={code}><LanguagePicker /><QrSignIn approve /></LanguageProvider>);
    expect(html.match(/<option /g)).toHaveLength(15);
    expect(html).toContain(`value="${code}"`);
    expect(html).toContain(`lang="${code}" dir="${directionOf(code)}"`);
    // Render independently to account for HTML escaping of apostrophes.
    const warning = renderToStaticMarkup(createElement("p", null, messagesFor(code).qr.warning));
    expect(html).toContain(warning);
  });
});
