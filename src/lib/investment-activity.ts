export const INVESTMENT_ACTIVITY_TYPES = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "INTEREST",
  "FEE",
  "DEPOSIT",
  "WITHDRAWAL",
  "EXPENSE",
  "INCOME",
  "TAX",
  "TRANSFER",
  "OTHER",
] as const;

export type InvestmentActivityType = (typeof INVESTMENT_ACTIVITY_TYPES)[number];

export const INVESTMENT_ACTIVITY_COLUMNS = [
  "date",
  "type",
  "symbol",
  "quantity",
  "price",
  "amount",
  "fees",
  "currency",
  "description",
  "external_id",
] as const;

export interface InvestmentActivityInput {
  date: string;
  type: InvestmentActivityType;
  symbol: string;
  quantity: number | null;
  price: number | null;
  amount: number;
  fees: number | null;
  currency: string;
  description: string;
  externalId: string;
}

export interface InvestmentActivityPreview {
  row: InvestmentActivityInput | null;
  problem: string | null;
}

export interface LedgerActivity extends InvestmentActivityInput {
  accountId: string;
  fingerprint: string;
}

export interface LedgerPoint {
  date: string;
  /** Market value of reconstructed open positions only. */
  portfolioValue: number;
  /** Statement cash plus open positions; useful for account reconciliation. */
  accountEquity: number;
  realizedPnl: number;
}

export interface LedgerOpenPosition {
  accountId: string;
  symbol: string;
  currency: string;
  quantity: number;
  averageCost: number;
  mark: number;
}

/**
 * Reconstructs account equity and average-cost realised P&L from statement rows.
 * Amount is the authoritative net cash movement, so fees are never subtracted
 * a second time. Prices between trades are carried forward and therefore
 * approximate; an actual stored snapshot supersedes this series in the action.
 */
export function calculateInvestmentLedger(rows: LedgerActivity[]): {
  points: LedgerPoint[];
  realizedByFingerprint: Map<string, number>;
  realizedTotal: number;
  openPositions: LedgerOpenPosition[];
} {
  const ordered = [...rows].sort(
    (a, b) => a.date.localeCompare(b.date) || a.fingerprint.localeCompare(b.fingerprint)
  );
  const accounts = new Map<string, { cash: number; positions: Map<string, { quantity: number; averageCost: number; mark: number }> }>();
  const realizedByFingerprint = new Map<string, number>();
  const daily = new Map<string, LedgerPoint>();
  let realizedTotal = 0;

  for (const row of ordered) {
    const account = accounts.get(row.accountId) ?? { cash: 0, positions: new Map() };
    accounts.set(row.accountId, account);
    account.cash += row.amount;

    // Cash actually received from an investment is realised return. APR is
    // only a projection; only statement rows count here.
    if (row.type === "INTEREST" || row.type === "DIVIDEND") {
      realizedByFingerprint.set(row.fingerprint, row.amount);
      realizedTotal += row.amount;
    }

    if ((row.type === "BUY" || row.type === "SELL") && row.symbol && row.quantity !== null) {
      const key = `${row.symbol}|${row.currency}`;
      const position = account.positions.get(key) ?? { quantity: 0, averageCost: 0, mark: 0 };
      const executionPrice = row.price ?? (row.quantity === 0 ? 0 : Math.abs(row.amount) / row.quantity);

      if (row.type === "BUY") {
        const boughtCost = Math.abs(row.amount);
        const nextQuantity = position.quantity + row.quantity;
        position.averageCost = nextQuantity === 0
          ? 0
          : (position.quantity * position.averageCost + boughtCost) / nextQuantity;
        position.quantity = nextQuantity;
      } else {
        const soldQuantity = Math.min(row.quantity, position.quantity);
        const proceedsForKnownUnits = row.quantity === 0 ? 0 : row.amount * (soldQuantity / row.quantity);
        const realized = proceedsForKnownUnits - soldQuantity * position.averageCost;
        realizedByFingerprint.set(row.fingerprint, realized);
        realizedTotal += realized;
        position.quantity = Math.max(0, position.quantity - soldQuantity);
        if (position.quantity === 0) position.averageCost = 0;
      }
      position.mark = executionPrice;
      account.positions.set(key, position);
    }

    let cash = 0;
    let positionsValue = 0;
    for (const state of accounts.values()) {
      cash += state.cash;
      for (const position of state.positions.values()) positionsValue += position.quantity * position.mark;
    }
    daily.set(row.date, {
      date: row.date,
      portfolioValue: Math.round((positionsValue + Number.EPSILON) * 100) / 100,
      accountEquity: Math.round((cash + positionsValue + Number.EPSILON) * 100) / 100,
      realizedPnl: Math.round((realizedTotal + Number.EPSILON) * 100) / 100,
    });
  }

  return {
    points: [...daily.values()],
    realizedByFingerprint,
    realizedTotal: Math.round((realizedTotal + Number.EPSILON) * 100) / 100,
    openPositions: [...accounts].flatMap(([accountId, state]) =>
      [...state.positions].flatMap(([key, position]) => {
        if (position.quantity <= 0) return [];
        const [symbol, currency] = key.split("|");
        return [{ accountId, symbol, currency, ...position }];
      })
    ),
  };
}

function optionalNumber(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : Number.NaN;
}

export function parseInvestmentActivity(raw: Record<string, unknown>): InvestmentActivityPreview {
  const date = String(raw.date ?? "").trim();
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime())) {
    return { row: null, problem: "Invalid date" };
  }

  const type = String(raw.type ?? "").trim().toUpperCase();
  if (!INVESTMENT_ACTIVITY_TYPES.includes(type as InvestmentActivityType)) {
    return { row: null, problem: "Unknown type" };
  }

  const amount = Number(String(raw.amount ?? "").trim());
  if (!Number.isFinite(amount)) return { row: null, problem: "Invalid amount" };

  const quantity = optionalNumber(raw.quantity);
  const price = optionalNumber(raw.price);
  const fees = optionalNumber(raw.fees);
  if ([quantity, price, fees].some((value) => value !== null && !Number.isFinite(value))) {
    return { row: null, problem: "Invalid quantity, price, or fees" };
  }

  const symbol = String(raw.symbol ?? "").trim().toUpperCase();
  if ((type === "BUY" || type === "SELL") && (!symbol || quantity === null)) {
    return { row: null, problem: "Trades need a symbol and quantity" };
  }

  const currency = String(raw.currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3,8}$/.test(currency)) return { row: null, problem: "Invalid currency" };

  return {
    row: {
      date,
      type: type as InvestmentActivityType,
      symbol,
      quantity,
      price,
      amount,
      fees,
      currency,
      description: String(raw.description ?? "").trim(),
      externalId: String(raw.external_id ?? "").trim(),
    },
    problem: null,
  };
}

const clean = (value: string | number | null) => String(value ?? "").trim().toLowerCase();

/** Stable per-account row identity. An external broker id wins when supplied. */
export function investmentActivityFingerprint(row: InvestmentActivityInput): string {
  if (row.externalId) return `external:${clean(row.externalId)}`;
  return [
    row.date,
    row.type,
    row.symbol,
    row.quantity,
    row.price,
    row.amount,
    row.fees,
    row.currency,
    row.description,
  ]
    .map(clean)
    .join("|");
}

export function buildInvestmentConversionPrompt(currency = "EUR"): string {
  return `Convert the broker, exchange, or investment-account statement below into CSV.

Output rules — follow exactly:
- Output ONLY CSV. No explanation and no markdown code fences.
- The first line must be exactly:
  ${INVESTMENT_ACTIVITY_COLUMNS.join(",")}
- Keep one row per real account event, in the original order. Never invent, merge, or split events.
- date: YYYY-MM-DD.
- type: exactly one of ${INVESTMENT_ACTIVITY_TYPES.join(", ")}.
- symbol: ticker/asset code; required for BUY and SELL, otherwise leave empty when irrelevant.
- quantity: absolute units traded; required for BUY and SELL. Never make SELL quantity negative.
- price: execution price per unit when shown, otherwise empty.
- amount: the SIGNED NET cash movement exactly as the statement reports it, INCLUDING fees. BUY,
  FEE, TAX, EXPENSE and WITHDRAWAL are normally negative; SELL, DIVIDEND, INTEREST, INCOME and
  DEPOSIT are normally positive. A TRANSFER keeps the statement's sign. Do not calculate amount
  from quantity × price when the statement supplies it.
- fees: absolute fee amount when separately disclosed, otherwise empty. This is informational and
  is already included in amount, so never subtract it again.
- currency: the row's currency code. Use ${currency} only when the statement clearly uses the
  account currency. Never convert currencies.
- description: original statement description, trimmed.
- external_id: broker transaction/order/reference id when present, otherwise empty.
- All numbers use a dot decimal and no thousands separator. Quote text fields containing commas.
- Ignore balances, position snapshots, subtotals and running totals; keep trades, dividends,
  interest, fees, deposits, withdrawals, taxes, expenses, income and transfers.
- If a value is unreadable, leave the optional field empty. Omit the row only when date, type,
  amount, currency, or a trade's symbol/quantity cannot be determined without guessing.

Statement:
`;
}

export const INVESTMENT_ACTIVITY_EXAMPLE = [
  INVESTMENT_ACTIVITY_COLUMNS.join(","),
  "2026-01-03,DEPOSIT,,,,1000.00,,EUR,Deposit,dep-001",
  "2026-01-04,BUY,VWCE,5,125.00,-626.00,1.00,EUR,Buy VWCE,ord-101",
  "2026-03-20,DIVIDEND,VWCE,,,8.42,,EUR,Quarterly dividend,div-301",
].join("\n");
