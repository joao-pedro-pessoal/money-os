import { sourceText, type TextTranslator, type TextValues } from "@/lib/i18n/text";
import type { ReportKind } from "./periods";

/** Whole sentences: a period noun is never inserted into translated grammar. */
export const PERIOD_COPY = {
  week: {
    this: "This week", before: "The week before", versus: "vs the week before",
    open: "This week so far — the figures change until it closes.",
    closed: "A closed week, as recorded.",
    noIncome: "no income recorded this week", noSnapshot: "No net worth snapshot inside this week.",
    noSpending: "No spending this week.",
    net: "Includes what markets did, so it can differ from the week's net.",
    averageOne: "average of {0} earlier week", averageMany: "average of {0} earlier weeks",
    approximate: "Amounts in other currencies use today's rates, so an earlier week is approximate.",
  },
  month: {
    this: "This month", before: "The month before", versus: "vs the month before",
    open: "This month so far — the figures change until it closes.",
    closed: "A closed month, as recorded.",
    noIncome: "no income recorded this month", noSnapshot: "No net worth snapshot inside this month.",
    noSpending: "No spending this month.",
    net: "Includes what markets did, so it can differ from the month's net.",
    averageOne: "average of {0} earlier month", averageMany: "average of {0} earlier months",
    approximate: "Amounts in other currencies use today's rates, so an earlier month is approximate.",
  },
  year: {
    this: "This year", before: "The year before", versus: "vs the year before",
    open: "This year so far — the figures change until it closes.",
    closed: "A closed year, as recorded.",
    noIncome: "no income recorded this year", noSnapshot: "No net worth snapshot inside this year.",
    noSpending: "No spending this year.",
    net: "Includes what markets did, so it can differ from the year's net.",
    averageOne: "average of {0} earlier year", averageMany: "average of {0} earlier years",
    approximate: "Amounts in other currencies use today's rates, so an earlier year is approximate.",
  },
  custom: {
    this: "This period", before: "The period before", versus: "vs the period before",
    open: "Up to today — the figures change until the day closes.",
    closed: "A range of days, as recorded.",
    noIncome: "no income recorded this period", noSnapshot: "No net worth snapshot inside this period.",
    noSpending: "No spending this period.",
    net: "Includes what markets did, so it can differ from the period's net.",
    averageOne: "average of {0} earlier period", averageMany: "average of {0} earlier periods",
    approximate: "Amounts in other currencies use today's rates, so an earlier period is approximate.",
  },
} as const;

export function periodCopy(kind: ReportKind, key: keyof typeof PERIOD_COPY.month, translate: TextTranslator = sourceText, values?: TextValues): string {
  return translate(PERIOD_COPY[kind][key], values);
}

/** Snapshot history has no separate-debt history. Never label it net worth. */
export const RECORDED_VALUE_COPY = {
  title: "Recorded value",
  chart: "Recorded value through the period",
  start: "Recorded value at start",
  end: "Recorded value at end",
  change: "Recorded value change",
  note: "Account balances and holdings from recorded snapshots. Separate debts are not deducted, so this is not net worth.",
  empty: "No recorded value snapshot inside this period.",
} as const;
