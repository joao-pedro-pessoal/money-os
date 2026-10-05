import { describe, expect, it } from "vitest";
import { labelIn, messagesFor, serverMessageIn } from "../messages";
import { DEFAULT_LANGUAGE, languageOf, LANGUAGES, localeOf } from "../languages";
import { ACCOUNTS_TABS, ANALYTICS_TABS, INVESTMENT_TABS } from "@/lib/navigation";
import { registrationRefusal } from "@/lib/accounts/limits";
import { passwordProblem } from "@/lib/accounts/password";

const en = messagesFor("en");
const pt = messagesFor("pt");

/** Every string in a message tree, by its path, leaving out the lookup tables and functions. */
function leaves(tree: object, path = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const here = path ? `${path}.${key}` : key;
    if (here === "labels" || here === "server") return [];
    if (typeof value === "string") return [[here, value] as [string, string]];
    if (value && typeof value === "object") return leaves(value, here);
    return [];
  });
}

describe("the languages", () => {
  it("are English unless something else was chosen", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(languageOf(undefined)).toBe("en");
    expect(languageOf("klingon")).toBe("en");
    expect(languageOf("pt")).toBe("pt");
    expect(localeOf("pt")).toBe("pt-PT");
  });

  it("offer only the ones the app is written in", () => {
    for (const { code } of LANGUAGES) expect(messagesFor(code)).toBeDefined();
  });
});

describe("Portuguese", () => {
  /**
   * The few words that are the same in both. Anything else equal to English is a
   * sentence someone forgot to translate.
   */
  const SAME_IN_BOTH = new Set(["nav.manual", "auth.email", "settings.baseMark", "phone.widgetsTitle"]);

  it("translates every sentence English has", () => {
    const untranslated = leaves(pt).filter(
      ([path, text]) => text === leaves(en).find(([p]) => p === path)?.[1] && !SAME_IN_BOTH.has(path)
    );
    expect(untranslated).toEqual([]);
  });

  it("names every page and tab in the menus", () => {
    const names = [
      ...ANALYTICS_TABS,
      ...ACCOUNTS_TABS,
      ...INVESTMENT_TABS,
      ...["Dashboard", "Analytics", "Accounts", "Cash Flow", "Savings", "Budgets", "Buckets", "Subscriptions"].map(
        (label) => ({ label })
      ),
      ...["Coming in", "Library", "Investments", "Manual", "Settings", "Import statement"].map((label) => ({ label })),
      ...["General", "Categories", "Currency & rates", "Your data", "On your phone"].map((label) => ({ label })),
    ].map((t) => t.label);
    const missing = names.filter((name) => name !== "Manual" && labelIn(pt, name) === name);
    expect(missing).toEqual([]);
    // English shows them as written.
    expect(labelIn(en, "Holdings")).toBe("Holdings");
  });

  it("knows what the server says when an account cannot be made or a password is refused", () => {
    const refusals = [
      registrationRefusal({ total: 0, lastHour: 0, lastDay: 0 }, null),
      registrationRefusal({ total: 10, lastHour: 0, lastDay: 0 }, 10),
      registrationRefusal({ total: 0, lastHour: 99, lastDay: 99 }, 10),
      passwordProblem("short"),
      passwordProblem("x".repeat(10_000)),
    ];
    for (const message of refusals) {
      expect(message).not.toBeNull();
      expect(serverMessageIn(pt, message!)).not.toBe(message);
    }
    // A message nobody translated is shown as the server wrote it, not lost.
    expect(serverMessageIn(pt, "Something new went wrong.")).toBe("Something new went wrong.");
  });

  it("writes a number into its sentence", () => {
    expect(pt.nav.pagesFound(1)).toBe("1 página encontrada");
    expect(pt.nav.pagesFound(3)).toBe("3 páginas encontradas");
    expect(pt.quickEntry.amount("EUR")).toBe("Valor (EUR)");
    expect(pt.quickEntry.amount(null)).toBe("Valor");
  });
});
