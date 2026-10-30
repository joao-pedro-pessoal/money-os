import { describe, expect, it } from "vitest";
import portuguese from "../full/pt.json";
import { translateText, type TextTranslator } from "../text";
import { periodCopy } from "@/lib/reports/copy";
import { translatedDate } from "@/lib/reports/translatedDate";
import { buildReport } from "@/lib/reports/monthly";
import { reportCsv } from "@/lib/reports/document";
import { reportBlocks } from "@/lib/reports/pdf";
import { accountFreeCash, explainFree } from "@/lib/accounting/unallocated";
import { realisedNote } from "@/lib/trading/realised";
import { fmt } from "@/lib/format";

const translate: TextTranslator = (source, values) => translateText(portuguese, source, values);

describe("Portuguese report copy", () => {
  it.each([
    ["week", "Esta semana", "semana anterior", "semanas anteriores"],
    ["month", "Este mês", "o mês anterior", "meses anteriores"],
    ["year", "Este ano", "o ano anterior", "anos anteriores"],
    ["custom", "Este período", "o período anterior", "períodos anteriores"],
  ] as const)("uses complete sentences for %s", (kind, current, previous, plural) => {
    expect(periodCopy(kind, "this", translate)).toBe(current);
    expect(periodCopy(kind, "versus", translate)).toContain(previous);
    expect(periodCopy(kind, "averageMany", translate, { 0: 3 })).toContain(`3 ${plural}`);
    expect(periodCopy(kind, "averageOne", translate, { 0: 1 })).not.toMatch(/earlier|week|month|year|period/);
    expect(periodCopy(kind, "noIncome", translate)).not.toMatch(/income|week|month|year|period/);
  });

  it("translates generated dates, including shortened chart labels", () => {
    expect(translatedDate("October 2026", translate)).toBe("outubro 2026");
    expect(translatedDate("17 Oct 2026", translate)).toBe("17 out. 2026");
    expect(translatedDate("Sep '26", translate)).toBe("set. '26");
    expect(translatedDate("2026-10-17", translate)).toBe("2026-10-17");
    expect(translatedDate("March 2026")).toBe("March 2026");
  });

  it("uses Portuguese dates and headings in both exports and preserves personal names", () => {
    const money = buildReport({ kind: "month", key: "2026-10", netWorthSeries: [], rows: [{
      date: "2026-10-17T12:00:00.000Z", type: "expense", amount: -25,
      accountName: "September", categoryName: "Income", subcategoryName: null, merchant: "October", fixed: false,
    }] });
    const contents = { kind: "month" as const, key: "2026-10", label: "October 2026",
      from: "2026-10-01", to: "2026-10-31", currency: "EUR", scope: "both" as const, money, investments: null };
    const csv = reportCsv(contents, translate);
    expect(csv.split("\n")[0]).toBe("Relatório mensal Money OS,outubro 2026");
    expect(csv).toContain("September");
    expect(csv).toContain("Income");
    expect(csv).toContain("October");
    const blocks = reportBlocks({ ...contents, title: "Monthly report", generatedOn: "2026-11-01", notes: [], translate, language:"pt" });
    const title = blocks.find(b => b.type === "title");
    expect(title?.text).toBe("Relatório mensal · outubro 2026");
    expect(title?.subtitle).not.toMatch(/Oct|Nov|made on|amounts in/);
    const tables = blocks.filter(b => b.type === "table");
    expect(JSON.stringify(tables)).toContain("September");
    expect(JSON.stringify(tables)).toContain("October");
    expect(JSON.stringify(tables)).toContain("Income");
    expect(JSON.stringify(tables)).not.toContain("17 Oct 2026");
  });

  it("translates the empty report month and the generated-on footer", () => {
    const money=buildReport({kind:"month",key:"2026-10",netWorthSeries:[],rows:[]});
    const blocks=reportBlocks({title:"Monthly report",label:"October 2026",from:"2026-10-01",to:"2026-10-31",currency:"EUR",generatedOn:"2026-10-30",money,investments:null,notes:[],language:"pt",translate});
    expect(blocks).toContainEqual({type:"text",text:"Nada registado em outubro 2026.",muted:true});
    expect(translate("Made on {0}",{0:"30 out. 2026"})).toBe("Criado em 30 out. 2026");
  });

  it("formats and translates all free-cash explanations without changing the amount", () => {
    const view = accountFreeCash({ id: "test", balance: 999 }, 150, { available: 100, spot: 20, marginUsed: 12.5 });
    const explanations = explainFree(view, "EUR", translate, "pt");
    expect(view.free).toBe(-50);
    expect(explanations).toEqual([
      `${fmt(12.5, "EUR", "pt")} está a garantir operações abertas e não pode ser gasto`,
      `${fmt(100, "EUR", "pt")} está reservado para objetivos`,
      `${fmt(20, "EUR", "pt")} está num saldo separado na plataforma`,
      "os objetivos têm mais dinheiro reservado do que esta conta pode gastar neste momento",
    ]);
  });

  it.each([1, 2])("keeps the missing-rate count and translates its plural (%i)", unconverted => {
    const text = realisedNote({ tradesKnown: true, tradesReported: 12, tradesDerived: 0, manualSales: 0, dividends: 0, interest: 0, unconverted }, translate);
    expect(text).toContain("12.00 em operações, conforme comunicado pelas plataformas");
    expect(text).toContain(`${unconverted} ${unconverted === 1 ? "movimento excluído" : "movimentos excluídos"}: sem taxa de câmbio`);
    expect(text).not.toMatch(/trades|left out/);
  });

  it("uses financial meanings for balance and fixed spending", () => {
    expect(translate("Fixed ")).toBe("Fixo ");
    expect(translate("What does that balance mean?")).toBe("O que significa este saldo?");
    expect(translate("what does that balance mean?")).toBe("o que significa este saldo?");
    expect(translate("No positions yet")).toBe("Ainda sem posições");
    expect(translate("TradingView")).toBe("TradingView");
    expect(translate("SnapTrade Personal (your own account)")).toBe("SnapTrade Personal (a tua conta)");
    expect(translate("account")).toBe("conta");
    expect(Object.values(portuguese).join("\n")).not.toMatch(/\bvocê\b/i);
  });
});
