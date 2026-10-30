import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LANGUAGES } from "../languages";
import { languageForEdition, languagesForEdition } from "../editionLanguages";

const cookie = vi.hoisted(() => ({ value: "en" as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: cookie.value }) }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("C4 launch languages", () => {
  it("keeps the complete catalog and restricts the public edition to reviewed languages", () => {
    expect(languagesForEdition("full")).toHaveLength(15);
    expect(languagesForEdition("money").map(item => item.code)).toEqual(["en", "pt"]);
  });
  it.each(LANGUAGES)("normalises $code according to the edition without deleting it", ({ code }) => {
    expect(languageForEdition(code, "full")).toBe(code);
    expect(languageForEdition(code, "money")).toBe(code === "pt" ? "pt" : "en");
  });
  it.each([undefined, null, "", "PT", "__proto__", "en; path=/"])("defaults invalid input %s to English in both editions", value => {
    expect(languageForEdition(value, "full")).toBe("en");
    expect(languageForEdition(value, "money")).toBe("en");
  });
  for (const edition of ["money", "full"]) {
    it(`${edition} renders its picker and normalises the initial client and request language`, async () => {
      vi.stubEnv("NEXT_PUBLIC_PRODUCT_EDITION", edition); vi.resetModules();
      const { LanguageProvider } = await import("@/components/LanguageContext");
      const { default: LanguagePicker } = await import("@/components/LanguagePicker");
      const { currentLanguage } = await import("@/actions/language");
      for (const { code } of LANGUAGES) {
        cookie.value = code;
        const selected = edition === "money" && code !== "pt" ? "en" : code;
        expect(await currentLanguage()).toBe(selected);
        const html = renderToStaticMarkup(<LanguageProvider language={code}><LanguagePicker /></LanguageProvider>);
        expect(html.match(/<option /g)).toHaveLength(edition === "money" ? 2 : 15);
        expect(html).toMatch(new RegExp(`<option value="${selected}"[^>]*selected=""`));
        if (edition === "money") expect(html).not.toContain('value="ar"');
      }
    });
  }
});
