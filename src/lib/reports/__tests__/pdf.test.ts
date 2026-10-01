import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { SpendingRow } from "@/lib/spending/analyse";
import { buildReport } from "../monthly";
import { buildInvestmentReport } from "../investments";
import { columnChart, compactAmount, lineChart, niceTicks } from "../charts";
import { pdfSafe, renderReportPdf, reportBlocks, type Block, type ReportPdfInput } from "../pdf";
import { reportCsv, reportFileName } from "../document";
import { fmt } from "@/lib/format";

function row(date: string, type: string, amount: number, extra: Partial<SpendingRow> = {}): SpendingRow {
  return {
    date: `${date}T12:00:00.000Z`,
    type,
    amount,
    categoryName: null,
    subcategoryName: null,
    accountName: "Conta à ordem",
    merchant: null,
    fixed: false,
    ...extra,
  };
}

const rows: SpendingRow[] = [
  row("2026-09-01", "income", 2000),
  row("2026-09-03", "expense", -600, { categoryName: "Renda", fixed: true }),
  row("2026-09-10", "expense", -150.5, { categoryName: "🍔 Comida", merchant: "Pingo Doce" }),
  row("2026-08-10", "expense", -100, { categoryName: "🍔 Comida" }),
];

const money = buildReport({
  kind: "month",
  key: "2026-09",
  rows,
  netWorthSeries: [
    { date: "2026-08-31", netWorth: 5000 },
    { date: "2026-09-15", netWorth: 5600 },
    { date: "2026-09-30", netWorth: 6249.5 },
  ],
});

const investments = buildInvestmentReport({
  from: "2026-09-01",
  to: "2026-09-30",
  today: "2026-09-30",
  values: [
    { date: "2026-08-31", value: 3000 },
    { date: "2026-09-15", value: 3100 },
    { date: "2026-09-30", value: 3200 },
  ],
  flows: [{ date: "2026-09-15", amount: -100 }],
  moneyWeightedWithheld: null,
  trades: [],
  income: [{ date: "2026-09-20", kind: "dividend", instrument: "VWCE", amount: 4.2 }],
  benchmark: null,
  holdings: {
    held: 3200,
    unrealised: 150,
    costUnknown: 0,
    items: [{ name: "VWCE", account: "Trade Republic", assetType: "etf", value: 3200, pnl: 150 }],
  },
});

const input: ReportPdfInput = {
  title: "Monthly report",
  label: "September 2026",
  from: "2026-09-01",
  to: "2026-09-30",
  currency: "EUR",
  generatedOn: "2026-10-01",
  money,
  investments,
  notes: [],
};

const allText = (blocks: Block[]) => JSON.stringify(blocks);

describe("what the PDF says", () => {
  const blocks = reportBlocks(input);

  it("states the same totals as the report the page shows", () => {
    const text = allText(blocks);
    for (const amount of [money.totals.income, money.totals.spent, money.totals.net, money.netWorth!.change]) {
      expect(text).toContain(JSON.stringify(fmt(amount, "EUR")).slice(1, -1));
    }
    expect(text).toContain(JSON.stringify(fmt(investments.value!.end, "EUR")).slice(1, -1));
    expect(text).toContain(JSON.stringify(fmt(investments.income.total, "EUR")).slice(1, -1));
  });

  it("draws net worth, spending by category, the portfolio and what is held", () => {
    const charts = blocks.filter((b) => b.type === "line" || b.type === "bars" || b.type === "columns");
    expect(charts.map((b) => ("title" in b ? b.title : ""))).toEqual([
      "Net worth through the period",
      "Where it went",
      "Portfolio value through the period",
      "What is held today, by type · " + fmt(3200, "EUR"),
    ]);
  });

  it("leaves a part out when the report is not about it", () => {
    const onlyMoney = reportBlocks({ ...input, investments: null });
    expect(onlyMoney.some((b) => b.type === "heading" && b.text === "Investments")).toBe(false);
    const onlyInvestments = reportBlocks({ ...input, money: null });
    expect(onlyInvestments.some((b) => b.type === "heading" && b.text === "Day-to-day money")).toBe(false);
  });
});

describe("the PDF file", () => {
  it("is a real PDF that a reader can open, of one page or more", async () => {
    const bytes = await renderReportPdf(input);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const read = await PDFDocument.load(bytes);
    expect(read.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(read.getTitle()).toBe("Money OS · Monthly report · September 2026");
  });

  it("runs onto more pages rather than off the bottom of one", async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      row("2026-09-05", "expense", -(i + 1), { categoryName: `Category ${i}`, merchant: `Shop ${i}` })
    );
    const long = buildReport({ kind: "month", key: "2026-09", rows: many, netWorthSeries: [], topCount: 60 });
    const read = await PDFDocument.load(await renderReportPdf({ ...input, money: long, investments: null }));
    expect(read.getPageCount()).toBeGreaterThan(2);
  });

  it("survives text the standard fonts cannot draw", async () => {
    expect(pdfSafe("🍔 Comida")).toBe("Comida");
    expect(pdfSafe("Café − 5 → 6")).toBe("Café - 5 -> 6");
    expect(pdfSafe("Москва")).toBe("??????");
    expect(pdfSafe("1 234,50 €")).toBe("1 234,50 €");
    await expect(renderReportPdf({ ...input, label: "Сентябрь 🍔" })).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("the CSV and the file names", () => {
  it("holds both parts, after one header", () => {
    const csv = reportCsv({ kind: "month", key: "2026-09", label: "September 2026", from: "2026-09-01", to: "2026-09-30", currency: "EUR", scope: "both", money, investments });
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Money OS monthly report,September 2026");
    expect(lines).toContain(`Spent,${money.totals.spent},${money.previous!.totals.spent}`);
    expect(lines).toContain(`Value change,${investments.value!.change}`);
  });

  it("names the file after its days and its part", () => {
    expect(reportFileName({ key: "2026-09", scope: "both" }, "pdf")).toBe("money-os-report-2026-09.pdf");
    expect(reportFileName({ key: "2026-03-01..2026-04-17", scope: "investments" }, "csv")).toBe(
      "money-os-investments-2026-03-01_2026-04-17.csv"
    );
  });
});

describe("chart geometry, shared by the page and the PDF", () => {
  it("steps an axis in round numbers that cover every value", () => {
    expect(niceTicks(0, 1000)).toEqual([0, 250, 500, 750, 1000]);
    expect(niceTicks(4870, 6249)).toEqual([4500, 5000, 5500, 6000, 6500]);
    const ticks = niceTicks(-120, 340);
    expect(ticks[0]).toBeLessThanOrEqual(-120);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(340);
  });

  it("places a line inside its box, starting late when the data does", () => {
    const area = { width: 400, height: 200, left: 40, right: 10, top: 5, bottom: 15 };
    const chart = lineChart(
      [{ name: "a", points: [{ date: "2026-09-16", value: 10 }, { date: "2026-09-30", value: 20 }] }],
      area,
      { from: "2026-09-01", to: "2026-09-30" }
    );
    const [first, last] = chart.lines[0].points;
    expect(first.x).toBeGreaterThan(area.left + (area.width - area.left - area.right) / 2 - 1);
    expect(last.x).toBe(area.width - area.right);
    for (const p of chart.lines[0].points) {
      expect(p.y).toBeGreaterThanOrEqual(area.top);
      expect(p.y).toBeLessThanOrEqual(area.height - area.bottom);
    }
    expect(chart.xLabels.map((l) => l.date)).toEqual(["2026-09-01", "2026-09-15", "2026-09-30"]);
  });

  it("keeps a month with nothing recorded as a gap, not as zero columns", () => {
    const chart = columnChart(
      [
        { label: "Jan", values: [100, 50] },
        { label: "Feb", values: [null, null] },
      ],
      { width: 300, height: 100, left: 30, right: 0, top: 0, bottom: 10 }
    );
    expect(chart.groups[1].columns.every((c) => c.height === 0 && c.value === null)).toBe(true);
    expect(chart.groups[0].columns[0].height).toBeGreaterThan(chart.groups[0].columns[1].height);
  });

  it("writes axis amounts short", () => {
    expect(compactAmount(950)).toBe("950");
    expect(compactAmount(12500)).toBe("12.5k");
    expect(compactAmount(-1_250_000)).toBe("-1.3M");
  });
});
