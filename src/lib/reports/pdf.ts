/**
 * The report as a PDF the app writes itself, charts included.
 *
 * It used to become a PDF through the browser's print dialog, which is a
 * different file on every browser, has no charts worth the name, and does not
 * exist at all inside the Android app — a WebView has no print dialog. This
 * file draws the same document everywhere from the same report objects the
 * page and the CSV read, so a total cannot differ between the three.
 *
 * Two steps, kept apart so the first can be tested without reading a PDF:
 *
 * 1. `reportBlocks` decides what the document says — headings, figures,
 *    tables, charts — as plain data.
 * 2. `renderReportPdf` lays those blocks out on A4 pages and draws them, with
 *    the chart geometry from `charts.ts` that the page's own charts use.
 *
 * The fonts are the PDF standard ones, which every reader has, so the file
 * stays small and needs nothing installed. They cover Western European text;
 * a character outside it (an emoji in a category name, say) is dropped or
 * shown as "?" rather than breaking the file — see `pdfSafe`.
 *
 * Pure: no DB, no clock — the day it was made is passed in.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { fmt } from "@/lib/format";
import { barShares, columnChart, compactAmount, lineChart, shortDate, type DatedValue } from "./charts";
import type { InvestmentReport } from "./investments";
import type { PeriodReport } from "./monthly";

export type Tone = "good" | "bad" | null;

export type Block =
  | { type: "title"; text: string; subtitle: string }
  | { type: "heading"; text: string }
  | { type: "text"; text: string; muted?: boolean }
  | { type: "stats"; items: { label: string; value: string; note?: string; tone?: Tone }[] }
  | {
      type: "table";
      title?: string;
      columns: { title: string; align: "left" | "right"; width: number }[];
      rows: string[][];
    }
  | {
      type: "line";
      title: string;
      series: { name: string; color: "accent" | "muted" | "green" | "red"; points: DatedValue[] }[];
      range: { from: string; to: string };
      /** What the axis counts in, printed beside it. */
      unit: string;
    }
  | { type: "bars"; title: string; items: { name: string; value: number; label: string }[] }
  | {
      type: "columns";
      title: string;
      legend: { name: string; color: "green" | "red" }[];
      groups: { label: string; values: (number | null)[] }[];
      unit: string;
    };

export interface ReportPdfInput {
  /** "Monthly report". */
  title: string;
  /** "September 2026". */
  label: string;
  from: string;
  to: string;
  currency: string;
  /** The day the file was made, on the wall. */
  generatedOn: string;
  money: PeriodReport | null;
  investments: InvestmentReport | null;
  /** What the figures could not include, said once at the top. */
  notes: string[];
}

const percent = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
const signedPercent = (n: number, digits = 1) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
const toneOf = (n: number): Tone => (n > 0 ? "good" : n < 0 ? "bad" : null);
const rate = (fraction: number) => signedPercent(fraction * 100, 2);

/** "+12.5% vs August 2026", or nothing to compare with. */
function versus(now: number, before: number | null, label: string): string | undefined {
  if (before === null || before === 0) return undefined;
  return `${signedPercent(((now - before) / before) * 100)} vs ${label}`;
}

/** What the document says, in order. */
export function reportBlocks(input: ReportPdfInput): Block[] {
  const money = (n: number) => fmt(n, input.currency);
  const signedMoney = (n: number) => `${n > 0 ? "+" : ""}${money(n)}`;
  const blocks: Block[] = [
    {
      type: "title",
      text: `${input.title} · ${input.label}`,
      subtitle: `${shortDate(input.from)} to ${shortDate(input.to)} · amounts in ${input.currency} · made on ${shortDate(input.generatedOn)}`,
    },
  ];
  for (const note of input.notes) blocks.push({ type: "text", text: note, muted: true });

  const m = input.money;
  if (m !== null) {
    const noun = m.kind === "custom" ? "period" : m.kind;
    const before = m.previous;
    blocks.push({ type: "heading", text: "Day-to-day money" });
    if (m.totals.transactions === 0) {
      blocks.push({ type: "text", text: `Nothing recorded in ${m.label}.`, muted: true });
    } else {
      blocks.push({
        type: "stats",
        items: [
          { label: "Income", value: money(m.totals.income), note: versus(m.totals.income, before?.totals.income ?? null, before?.label ?? ""), tone: "good" },
          { label: "Spent", value: money(m.totals.spent), note: versus(m.totals.spent, before?.totals.spent ?? null, before?.label ?? ""), tone: "bad" },
          { label: "Net", value: money(m.totals.net), note: m.invested > 0 ? `${money(m.invested)} moved into investments` : undefined, tone: toneOf(m.totals.net) },
          {
            label: "Savings rate",
            value: m.savingsRate === null ? "—" : percent(m.savingsRate),
            note: m.savingsRate === null ? `no income recorded this ${noun}` : "of income kept",
            tone: m.savingsRate === null ? null : toneOf(m.savingsRate),
          },
        ],
      });
      blocks.push({
        type: "stats",
        items: [
          m.netWorth
            ? {
                label: "Net worth",
                value: signedMoney(m.netWorth.change),
                note: `${money(m.netWorth.start)} -> ${money(m.netWorth.end)}, markets included`,
                tone: toneOf(m.netWorth.change),
              }
            : { label: "Net worth", value: "—", note: `no snapshot inside this ${noun}` },
          {
            label: "Fixed spending",
            value: money(m.split.fixed),
            note: m.split.fixedShare === null ? undefined : `${percent(m.split.fixedShare, 0)} of spending`,
          },
          { label: "Variable spending", value: money(m.split.variable), note: "what a decision could still move" },
          ...(m.averageSpent
            ? [{ label: "Average spent before", value: money(m.averageSpent.amount), note: `over ${m.averageSpent.periods} earlier ${m.averageSpent.periods === 1 ? noun : `${noun}s`}` }]
            : []),
        ],
      });
      if (m.netWorthLine.length >= 2) {
        blocks.push({
          type: "line",
          title: "Net worth through the period",
          series: [{ name: "Net worth", color: "accent", points: m.netWorthLine }],
          range: { from: m.from, to: m.to },
          unit: input.currency,
        });
      }
      if (m.months) {
        blocks.push({
          type: "columns",
          title: "Month by month",
          legend: [
            { name: "Income", color: "green" },
            { name: "Spent", color: "red" },
          ],
          groups: m.months.map((month) => ({
            label: month.label.slice(0, 3) + (month.partial ? "*" : ""),
            values: month.totals === null ? [null, null] : [month.totals.income, month.totals.spent],
          })),
          unit: input.currency,
        });
        if (m.months.some((month) => month.partial)) {
          blocks.push({ type: "text", text: "* Only part of the month is inside the period.", muted: true });
        }
      }
      if (m.categories.length > 0) {
        blocks.push({
          type: "bars",
          title: "Where it went",
          items: barShares(m.categories.map((c) => ({ name: c.name, value: c.spent }))).map((b) => ({
            name: b.name,
            value: b.share,
            label: money(b.value),
          })),
        });
        blocks.push({
          type: "table",
          columns: [
            { title: "Category", align: "left", width: 0.34 },
            { title: "Spent", align: "right", width: 0.17 },
            { title: "Share", align: "right", width: 0.12 },
            { title: `${noun[0].toUpperCase()}${noun.slice(1)} before`, align: "right", width: 0.21 },
            { title: "Change", align: "right", width: 0.16 },
          ],
          rows: m.categories.map((c) => [
            `${c.name} (${c.count})`,
            money(c.spent),
            percent(c.share),
            c.previous > 0 ? money(c.previous) : "—",
            c.changePercent === null ? "new" : signedPercent(c.changePercent),
          ]),
        });
        if (m.totals.uncategorised > 0) {
          blocks.push({ type: "text", text: `${money(m.totals.uncategorised)} of spending has no category.`, muted: true });
        }
      }
      if (m.budgets.length > 0) {
        blocks.push({
          type: "table",
          title: "Budgets",
          columns: [
            { title: "Budget", align: "left", width: 0.4 },
            { title: "Spent", align: "right", width: 0.2 },
            { title: "Limit", align: "right", width: 0.2 },
            { title: "Used", align: "right", width: 0.2 },
          ],
          rows: m.budgets.map((b) => [b.name, money(b.spent), money(b.limit), `${b.percent}%${b.status === "over" ? " over" : ""}`]),
        });
      }
      if (m.topExpenses.length > 0) {
        blocks.push({
          type: "table",
          title: "Largest expenses",
          columns: [
            { title: "What", align: "left", width: 0.36 },
            { title: "Date", align: "left", width: 0.16 },
            { title: "Account", align: "left", width: 0.28 },
            { title: "Amount", align: "right", width: 0.2 },
          ],
          rows: m.topExpenses.map((e) => [
            e.category && e.category !== e.name ? `${e.name} · ${e.category}` : e.name,
            e.date,
            e.account,
            money(e.amount),
          ]),
        });
      }
    }
  }

  const inv = input.investments;
  if (inv !== null) {
    blocks.push({ type: "heading", text: "Investments" });
    if (!inv.hasAnything) {
      blocks.push({ type: "text", text: "No investment was valued, bought, sold or paid anything in this period.", muted: true });
    } else {
      blocks.push({
        type: "stats",
        items: [
          inv.value
            ? { label: "Portfolio value", value: money(inv.value.end), note: `from ${money(inv.value.start)} (${signedMoney(inv.value.change)})`, tone: null }
            : { label: "Portfolio value", value: "—", note: "no valuation inside this period" },
          { label: "Deposited", value: money(inv.flows.deposited), note: inv.flows.withdrawn > 0 ? `${money(inv.flows.withdrawn)} withdrawn` : undefined },
          {
            label: "Change beyond deposits",
            value: inv.unexplained === null ? "—" : signedMoney(inv.unexplained),
            note: "markets, and money moved without a recorded deposit or withdrawal",
            tone: inv.unexplained === null ? null : toneOf(inv.unexplained),
          },
          { label: "Dividends and interest", value: money(inv.income.total), note: `${money(inv.income.dividends)} dividends, ${money(inv.income.interest)} interest` },
        ],
      });
      blocks.push({
        type: "stats",
        items: [
          { label: "Bought", value: money(inv.trades.bought), note: `${inv.trades.buys} ${inv.trades.buys === 1 ? "buy" : "buys"}` },
          { label: "Sold", value: money(inv.trades.sold), note: `${inv.trades.sells} ${inv.trades.sells === 1 ? "sale" : "sales"}` },
          {
            label: "Realised from trades",
            value: signedMoney(inv.trades.realised),
            note: `${inv.trades.closed} closing ${inv.trades.closed === 1 ? "fill" : "fills"}, as the venues state it`,
            tone: toneOf(inv.trades.realised),
          },
          { label: "Trading fees", value: money(inv.trades.fees), note: `net of fees ${signedMoney(inv.trades.net)}` },
        ],
      });
      const twr = inv.returns.timeWeighted;
      const index = inv.benchmark !== null && "indexReturn" in inv.benchmark ? inv.benchmark : null;
      blocks.push({
        type: "stats",
        items: [
          {
            label: "Time-weighted return",
            value: twr === null ? "—" : rate(twr.total),
            note: twr === null ? "not measurable here" : `${shortDate(twr.from)} to ${shortDate(twr.to)}; how the choices did`,
            tone: twr === null ? null : toneOf(twr.total),
          },
          {
            label: "Money-weighted return",
            value: inv.returns.moneyWeighted === null ? "—" : rate(inv.returns.moneyWeighted),
            note: inv.returns.moneyWeighted === null ? "not measurable here" : "for the period; how your money did",
            tone: inv.returns.moneyWeighted === null ? null : toneOf(inv.returns.moneyWeighted),
          },
          ...(inv.benchmark === null
            ? []
            : [
                index
                  ? {
                      label: inv.benchmark.name,
                      value: rate(index.indexReturn),
                      note: `${index.differencePoints > 0 ? "+" : ""}${index.differencePoints.toFixed(2)} points ${index.differencePoints >= 0 ? "ahead" : "behind"}`,
                      tone: toneOf(index.differencePoints),
                    }
                  : { label: inv.benchmark.name, value: "—", note: "no comparison" },
              ]),
        ],
      });
      for (const reason of [inv.returns.timeWeightedWithheld, inv.returns.moneyWeightedWithheld]) {
        if (reason !== null) blocks.push({ type: "text", text: reason, muted: true });
      }
      if (inv.benchmark !== null && "unavailable" in inv.benchmark && twr !== null) {
        blocks.push({ type: "text", text: `${inv.benchmark.name}: ${inv.benchmark.unavailable}`, muted: true });
      }
      if (inv.valueLine.length >= 2) {
        blocks.push({
          type: "line",
          title: "Portfolio value through the period",
          series: [{ name: "Portfolio value", color: "accent", points: inv.valueLine }],
          range: { from: inv.from, to: inv.to },
          unit: input.currency,
        });
      }
      if (index && inv.returns.curve.length >= 2) {
        blocks.push({
          type: "line",
          title: `Growth of 100, against ${index.name}`,
          series: [
            { name: "Your portfolio (time-weighted)", color: "accent", points: inv.returns.curve },
            { name: index.name, color: "muted", points: index.curve },
          ],
          range: { from: inv.from, to: inv.to },
          unit: "index, start = 100",
        });
      }
      if (inv.trades.bySymbol.length > 0) {
        blocks.push({
          type: "table",
          title: "Result by instrument",
          columns: [
            { title: "Instrument", align: "left", width: 0.36 },
            { title: "Closed", align: "right", width: 0.12 },
            { title: "Realised", align: "right", width: 0.18 },
            { title: "Fees", align: "right", width: 0.16 },
            { title: "Net", align: "right", width: 0.18 },
          ],
          rows: inv.trades.bySymbol.map((s) => [s.symbol, String(s.closedTrades), signedMoney(s.realized), money(s.fees), signedMoney(s.net)]),
        });
      }
      if (inv.income.byInstrument.length > 0) {
        blocks.push({
          type: "table",
          title: "Dividends by instrument",
          columns: [
            { title: "Instrument", align: "left", width: 0.6 },
            { title: "Payments", align: "right", width: 0.18 },
            { title: "Amount", align: "right", width: 0.22 },
          ],
          rows: inv.income.byInstrument.map((d) => [d.name, String(d.payments), money(d.amount)]),
        });
      }
      if (inv.composition !== null) {
        const c = inv.composition;
        blocks.push({
          type: "bars",
          title: `What is held today, by type · ${money(c.held)}`,
          items: barShares(c.byType.map((t) => ({ name: t.name, value: t.value })), 10).map((b) => ({
            name: b.name,
            value: b.share,
            label: `${money(b.value)} · ${percent(c.byType.find((t) => t.name === b.name)?.percent ?? 0)}`,
          })),
        });
        blocks.push({
          type: "table",
          title: "Largest positions today",
          columns: [
            { title: "Position", align: "left", width: 0.34 },
            { title: "Account", align: "left", width: 0.24 },
            { title: "Value", align: "right", width: 0.16 },
            { title: "Share", align: "right", width: 0.1 },
            { title: "Unrealised", align: "right", width: 0.16 },
          ],
          rows: c.largest.map((p) => [p.name, p.account, money(p.value), percent(p.percent), p.pnl === null ? "—" : signedMoney(p.pnl)]),
        });
        blocks.push({
          type: "text",
          text: `Unrealised today: ${signedMoney(c.unrealised)}${c.costUnknown > 0 ? `, leaving out ${money(c.costUnknown)} whose cost nobody states` : ""}.`,
          muted: true,
        });
      } else if (inv.compositionNote !== null) {
        blocks.push({ type: "text", text: inv.compositionNote, muted: true });
      }
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** The characters the standard fonts can draw beyond Latin-1, by their WinAnsi slot. */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

const REPLACEMENTS: Record<string, string> = {
  "−": "-",
  "→": "->",
  "←": "<-",
  " ": " ",
  " ": " ",
  " ": " ",
  "…": "...",
};

/**
 * Text the standard PDF fonts can draw.
 *
 * They encode Windows-1252, which holds Portuguese, Spanish, French and German
 * whole. Anything else would make the library throw and the whole file fail
 * over one character, so a pictograph is dropped and any other letter becomes
 * "?" — visible, and honest about being a stand-in.
 */
export function pdfSafe(text: string): string {
  let out = "";
  // Composed first, so an accent typed as a separate mark stays on its letter.
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (REPLACEMENTS[ch] !== undefined) out += REPLACEMENTS[ch];
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch;
    else if (/\p{Extended_Pictographic}|\p{Mark}|[‍️]/u.test(ch)) continue;
    else if (ch === "\n" || ch === "\t") out += " ";
    else out += "?";
  }
  return out.replace(/ {2,}/g, " ").trim();
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = { left: 42, right: 42, top: 50, bottom: 48 };
const WIDTH = PAGE_WIDTH - MARGIN.left - MARGIN.right;

const COLOURS: Record<"text" | "muted" | "accent" | "green" | "red" | "rule" | "band", RGB> = {
  text: rgb(0.07, 0.09, 0.15),
  muted: rgb(0.42, 0.45, 0.5),
  accent: rgb(0.31, 0.27, 0.9),
  green: rgb(0.08, 0.5, 0.24),
  red: rgb(0.73, 0.11, 0.11),
  rule: rgb(0.88, 0.89, 0.91),
  band: rgb(0.96, 0.96, 0.97),
};

const toneColour = (tone: Tone | undefined) => (tone === "good" ? COLOURS.green : tone === "bad" ? COLOURS.red : COLOURS.text);

class Layout {
  private page!: PDFPage;
  /** Distance from the top of the page to where the next thing goes. */
  private y = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    private readonly running: string
  ) {
    this.newPage();
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = MARGIN.top;
    this.write(this.running, MARGIN.left, MARGIN.top - 24, 7.5, this.regular, COLOURS.muted, WIDTH);
  }

  /** Starts a new page unless `height` still fits on this one. */
  private room(height: number) {
    if (this.y + height > PAGE_HEIGHT - MARGIN.bottom) this.newPage();
  }

  /** Draws one line of text with its top at `top`, cut to `width` with an ellipsis. */
  private write(text: string, x: number, top: number, size: number, font: PDFFont, color: RGB, width: number, align: "left" | "right" = "left") {
    let safe = pdfSafe(text);
    if (font.widthOfTextAtSize(safe, size) > width) {
      while (safe.length > 1 && font.widthOfTextAtSize(`${safe}...`, size) > width) safe = safe.slice(0, -1);
      safe = `${safe.trimEnd()}...`;
    }
    const drawnWidth = font.widthOfTextAtSize(safe, size);
    this.page.drawText(safe, {
      x: align === "right" ? x + width - drawnWidth : x,
      y: PAGE_HEIGHT - top - size,
      size,
      font,
      color,
    });
  }

  private wrap(text: string, size: number, font: PDFFont, width: number): string[] {
    const words = pdfSafe(text).split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line === "" ? word : `${line} ${word}`;
      if (line !== "" && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line !== "") lines.push(line);
    return lines;
  }

  private rule(top: number, color = COLOURS.rule) {
    this.page.drawLine({
      start: { x: MARGIN.left, y: PAGE_HEIGHT - top },
      end: { x: MARGIN.left + WIDTH, y: PAGE_HEIGHT - top },
      thickness: 0.6,
      color,
    });
  }

  title(text: string, subtitle: string) {
    for (const line of this.wrap(text, 18, this.bold, WIDTH)) {
      this.write(line, MARGIN.left, this.y, 18, this.bold, COLOURS.text, WIDTH);
      this.y += 23;
    }
    this.write(subtitle, MARGIN.left, this.y, 8.5, this.regular, COLOURS.muted, WIDTH);
    this.y += 20;
  }

  heading(text: string) {
    this.room(60);
    this.y += 8;
    this.write(text, MARGIN.left, this.y, 13, this.bold, COLOURS.text, WIDTH);
    this.y += 18;
    this.rule(this.y);
    this.y += 8;
  }

  text(text: string, muted = false) {
    const size = 8.5;
    const lines = this.wrap(text, size, this.regular, WIDTH);
    this.room(lines.length * 11.5 + 4);
    for (const line of lines) {
      this.write(line, MARGIN.left, this.y, size, this.regular, muted ? COLOURS.muted : COLOURS.text, WIDTH);
      this.y += 11.5;
    }
    this.y += 4;
  }

  stats(items: Extract<Block, { type: "stats" }>["items"]) {
    const gap = 10;
    const cell = (WIDTH - gap * (items.length - 1)) / Math.max(1, items.length);
    const notes = items.map((i) => (i.note ? this.wrap(i.note, 7, this.regular, cell - 12) : []));
    const height = 42 + Math.max(0, ...notes.map((n) => n.length)) * 9;
    this.room(height + 8);
    items.forEach((item, i) => {
      const x = MARGIN.left + i * (cell + gap);
      this.page.drawRectangle({ x, y: PAGE_HEIGHT - this.y - height, width: cell, height, color: COLOURS.band });
      this.write(item.label, x + 6, this.y + 7, 7.5, this.regular, COLOURS.muted, cell - 12);
      this.write(item.value, x + 6, this.y + 19, 12, this.bold, toneColour(item.tone), cell - 12);
      notes[i].forEach((line, k) => this.write(line, x + 6, this.y + 36 + k * 9, 7, this.regular, COLOURS.muted, cell - 12));
    });
    this.y += height + 8;
  }

  table(block: Extract<Block, { type: "table" }>) {
    const size = 8;
    const rowHeight = 14;
    const xs = block.columns.reduce<number[]>((acc, c, i) => [...acc, i === 0 ? MARGIN.left : acc[i - 1] + block.columns[i - 1].width * WIDTH], []);
    const header = () => {
      block.columns.forEach((c, i) =>
        this.write(c.title, xs[i] + 3, this.y + 3, 7.5, this.bold, COLOURS.muted, c.width * WIDTH - 6, c.align)
      );
      this.y += rowHeight;
      this.rule(this.y - 1);
    };
    this.room((block.title ? 18 : 0) + rowHeight * Math.min(3, block.rows.length + 1));
    if (block.title) {
      this.write(block.title, MARGIN.left, this.y + 2, 9.5, this.bold, COLOURS.text, WIDTH);
      this.y += 16;
    }
    header();
    block.rows.forEach((row, r) => {
      if (this.y + rowHeight > PAGE_HEIGHT - MARGIN.bottom) {
        this.newPage();
        header();
      }
      if (r % 2 === 1) {
        this.page.drawRectangle({ x: MARGIN.left, y: PAGE_HEIGHT - this.y - rowHeight, width: WIDTH, height: rowHeight, color: COLOURS.band });
      }
      row.forEach((cellText, i) =>
        this.write(cellText, xs[i] + 3, this.y + 3.5, size, this.regular, COLOURS.text, block.columns[i].width * WIDTH - 6, block.columns[i].align)
      );
      this.y += rowHeight;
    });
    this.y += 10;
  }

  line(block: Extract<Block, { type: "line" }>) {
    const height = 170;
    this.room(height + 34);
    this.write(block.title, MARGIN.left, this.y, 9.5, this.bold, COLOURS.text, WIDTH * 0.6);
    this.write(block.unit, MARGIN.left + WIDTH * 0.6, this.y + 1.5, 7.5, this.regular, COLOURS.muted, WIDTH * 0.4, "right");
    this.y += 16;
    const top = this.y;
    const chart = lineChart(block.series, { width: WIDTH, height, left: 40, right: 8, top: 6, bottom: 18 }, block.range);
    const at = (x: number, y: number) => ({ x: MARGIN.left + x, y: PAGE_HEIGHT - top - y });

    for (const tick of chart.yTicks) {
      this.page.drawLine({ start: at(40, tick.y), end: at(WIDTH - 8, tick.y), thickness: 0.4, color: COLOURS.rule });
      this.write(compactAmount(tick.value), MARGIN.left, top + tick.y - 4, 7, this.regular, COLOURS.muted, 34, "right");
    }
    if (chart.zeroY !== null) {
      this.page.drawLine({ start: at(40, chart.zeroY), end: at(WIDTH - 8, chart.zeroY), thickness: 0.7, color: COLOURS.muted });
    }
    chart.xLabels.forEach((label, i) => {
      // The first date starts at its point, the last ends at it, one between is centred on it.
      const text = shortDate(label.date);
      const width = this.regular.widthOfTextAtSize(text, 7);
      const x = i === 0 ? label.x : i === chart.xLabels.length - 1 ? label.x - width : label.x - width / 2;
      this.write(text, MARGIN.left + x, top + height - 12, 7, this.regular, COLOURS.muted, width + 1);
    });
    chart.lines.forEach((line, i) => {
      const color = COLOURS[block.series[i].color];
      for (let k = 1; k < line.points.length; k += 1) {
        this.page.drawLine({
          start: at(line.points[k - 1].x, line.points[k - 1].y),
          end: at(line.points[k].x, line.points[k].y),
          thickness: 1.4,
          color,
        });
      }
      if (line.points.length === 1) {
        this.page.drawCircle({ ...at(line.points[0].x, line.points[0].y), size: 1.8, color });
      }
    });
    this.y += height + 2;
    if (block.series.length > 1) this.legend(block.series.map((s) => ({ name: s.name, color: COLOURS[s.color] })));
    this.y += 8;
  }

  private legend(items: { name: string; color: RGB }[]) {
    let x = MARGIN.left + 40;
    for (const item of items) {
      this.page.drawRectangle({ x, y: PAGE_HEIGHT - this.y - 7, width: 8, height: 3, color: item.color });
      this.write(item.name, x + 12, this.y, 7.5, this.regular, COLOURS.muted, 200);
      x += 24 + this.regular.widthOfTextAtSize(pdfSafe(item.name), 7.5);
    }
    this.y += 12;
  }

  bars(block: Extract<Block, { type: "bars" }>) {
    const rowHeight = 15;
    this.room(18 + rowHeight * Math.min(4, block.items.length));
    this.write(block.title, MARGIN.left, this.y, 9.5, this.bold, COLOURS.text, WIDTH);
    this.y += 16;
    const nameWidth = 150;
    const labelWidth = 120;
    const barWidth = WIDTH - nameWidth - labelWidth - 12;
    for (const item of block.items) {
      this.room(rowHeight);
      this.write(item.name, MARGIN.left, this.y + 2.5, 8, this.regular, COLOURS.text, nameWidth - 6);
      this.page.drawRectangle({
        x: MARGIN.left + nameWidth,
        y: PAGE_HEIGHT - this.y - 11,
        width: barWidth,
        height: 8,
        color: COLOURS.band,
      });
      if (item.value > 0) {
        this.page.drawRectangle({
          x: MARGIN.left + nameWidth,
          y: PAGE_HEIGHT - this.y - 11,
          width: Math.max(1, barWidth * item.value),
          height: 8,
          color: COLOURS.accent,
        });
      }
      this.write(item.label, MARGIN.left + nameWidth + barWidth + 6, this.y + 2.5, 8, this.regular, COLOURS.text, labelWidth + 6, "right");
      this.y += rowHeight;
    }
    this.y += 10;
  }

  columns(block: Extract<Block, { type: "columns" }>) {
    const height = 150;
    this.room(height + 40);
    this.write(block.title, MARGIN.left, this.y, 9.5, this.bold, COLOURS.text, WIDTH * 0.6);
    this.write(block.unit, MARGIN.left + WIDTH * 0.6, this.y + 1.5, 7.5, this.regular, COLOURS.muted, WIDTH * 0.4, "right");
    this.y += 16;
    const top = this.y;
    const chart = columnChart(block.groups, { width: WIDTH, height, left: 40, right: 8, top: 6, bottom: 18 });
    const at = (x: number, y: number) => ({ x: MARGIN.left + x, y: PAGE_HEIGHT - top - y });
    for (const tick of chart.yTicks) {
      this.page.drawLine({ start: at(40, tick.y), end: at(WIDTH - 8, tick.y), thickness: 0.4, color: COLOURS.rule });
      this.write(compactAmount(tick.value), MARGIN.left, top + tick.y - 4, 7, this.regular, COLOURS.muted, 34, "right");
    }
    for (const group of chart.groups) {
      group.columns.forEach((column, k) => {
        if (column.height <= 0) return;
        const { x, y } = at(column.x, column.y + column.height);
        this.page.drawRectangle({ x, y, width: column.width, height: column.height, color: COLOURS[block.legend[k]?.color ?? "accent"] });
      });
      this.write(group.label, MARGIN.left + group.x, top + height - 12, 7, this.regular, COLOURS.muted, group.width + 4);
    }
    this.y += height + 2;
    this.legend(block.legend.map((l) => ({ name: l.name, color: COLOURS[l.color] })));
    this.y += 8;
  }

  /** Page numbers, once every page exists. */
  finish(footer: string) {
    const pages = this.doc.getPages();
    pages.forEach((page, i) => {
      const text = pdfSafe(`${footer} · page ${i + 1} of ${pages.length}`);
      page.drawText(text, {
        x: MARGIN.left,
        y: MARGIN.bottom - 28,
        size: 7,
        font: this.regular,
        color: COLOURS.muted,
      });
    });
  }
}

/** The report as a PDF file. */
export async function renderReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Money OS · ${input.title} · ${input.label}`));
  doc.setProducer("Money OS");
  doc.setCreator("Money OS");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const layout = new Layout(doc, regular, bold, `Money OS · ${input.title} · ${input.label}`);

  for (const block of reportBlocks(input)) {
    switch (block.type) {
      case "title":
        layout.title(block.text, block.subtitle);
        break;
      case "heading":
        layout.heading(block.text);
        break;
      case "text":
        layout.text(block.text, block.muted);
        break;
      case "stats":
        layout.stats(block.items);
        break;
      case "table":
        layout.table(block);
        break;
      case "line":
        layout.line(block);
        break;
      case "bars":
        layout.bars(block);
        break;
      case "columns":
        layout.columns(block);
        break;
    }
  }
  layout.finish(`Money OS · made on ${shortDate(input.generatedOn)}`);
  return doc.save();
}
