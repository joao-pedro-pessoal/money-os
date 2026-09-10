import { describe, it, expect } from "vitest";
import { readDescription, describableRows } from "../brokerDescription";
import { parseBrokerCsv, inspectBrokerCsv } from "../broker";
import { reconstructHoldings } from "../../portfolio/reconstruct";

/**
 * A broker export that lost its columns.
 *
 * Same shape as a real Trade Republic export converted into this app's bank
 * format: five columns, and every fact about the trade squeezed into the
 * description. Written from the real file's patterns rather than copied from
 * it — a test fixture has no business holding somebody's transaction history.
 */
const FLATTENED = [
  "date,amount,description,merchant,category",
  '2025-03-17,10.00,Card Top up with ****1549,,',
  "2025-03-20,6.00,Depósito aceite: LT07 para DE30,,",
  "2025-03-23,-5.00,PayOut to transit,,",
  '2025-04-01,-10.00,"Savings plan execution IE00B5BMR087 iShares VII plc - iShares Core S&P 500 UCITS ETF USD (Acc), quantity: 0.0173",,',
  '2025-05-01,-10.00,"Savings plan execution IE00B5BMR087 iShares VII plc - iShares Core S&P 500 UCITS ETF USD (Acc), quantity: 0.0169",,',
  '2025-05-15,-13.41,"Buy trade CA25537R1091 DIVIDEND 15 SPLIT A CD 15, quantity: 3.0",,',
  "2025-06-01,0.15,Cash Dividend for ISIN CA25537R1091,,",
  "2025-06-02,0.10,Interest payment,,",
  "2025-06-03,0.02,Your interest payment,,",
  '2025-07-01,16.15,"Sell trade CA25537R1091 DIVIDEND 15 SPLIT A CD 15, quantity: 3.0",,',
  "2025-07-05,-20.00,Outgoing transfer for A Person (LT07),,",
].join("\n");

describe("reading one line of prose", () => {
  it("pulls the type, the instrument and the quantity out of a savings plan row", () => {
    const e = readDescription(
      "Savings plan execution LU1681048804 Amundi Index Solutions - Amundi S&P 500 UCITS ETF - EUR (C), quantity: 0.1"
    );

    expect(e.kind).toBe("BUY");
    expect(e.isin).toBe("LU1681048804");
    expect(e.name).toBe("Amundi Index Solutions - Amundi S&P 500 UCITS ETF - EUR (C)");
    expect(e.quantity).toBe(0.1);
  });

  it("reads a fractional crypto quantity without losing precision", () => {
    const e = readDescription("Sell trade XF000BTC0017 Bitcoin, quantity: 0.000291");

    expect(e.kind).toBe("SELL");
    expect(e.quantity).toBe(0.000291);
    expect(e.name).toBe("Bitcoin");
  });

  it("is not fooled by an instrument called DIVIDEND", () => {
    // A real holding in the file this was written for is called "DIVIDEND 15
    // SPLIT A CD 15". Matching keywords anywhere in the line would read every
    // purchase of it as a dividend payment, and the position would never exist.
    const buy = readDescription("Buy trade CA25537R1091 DIVIDEND 15 SPLIT A CD 15, quantity: 3.0");
    expect(buy.kind).toBe("BUY");
    expect(buy.quantity).toBe(3);

    const dividend = readDescription("Cash Dividend for ISIN CA25537R1091");
    expect(dividend.kind).toBe("DIVIDEND");
    expect(dividend.isin).toBe("CA25537R1091");
  });

  it("tells the two wordings of an interest payment apart from anything else", () => {
    expect(readDescription("Interest payment").kind).toBe("INTEREST");
    expect(readDescription("Your interest payment").kind).toBe("INTEREST");
  });

  it("reads deposits and withdrawals in either language", () => {
    expect(readDescription("Card Top up with ****1549").kind).toBe("DEPOSIT");
    expect(readDescription("Depósito aceite: LT07 para DE30").kind).toBe("DEPOSIT");
    expect(readDescription("Incoming transfer from A Person").kind).toBe("DEPOSIT");
    expect(readDescription("PayOut to transit").kind).toBe("WITHDRAWAL");
    expect(readDescription("Outgoing transfer for A Person (LT07)").kind).toBe("WITHDRAWAL");
  });

  it("says nothing about a line it doesn't recognise", () => {
    // Guessing from a stray keyword is how a fee becomes a purchase.
    expect(readDescription("Coffee at the station").kind).toBeNull();
    expect(readDescription("").kind).toBeNull();
    expect(readDescription(null).kind).toBeNull();
  });

  it("ignores a twelve-character word whose check digit doesn't agree", () => {
    // The check digit is what makes it safe to hunt for an ISIN in free text.
    // US0378331005 is Apple; the 6 below is the same code with the check digit
    // wrong, and it has to be rejected on exactly that basis.
    expect(readDescription("Buy trade US0378331006 Something, quantity: 1").isin).toBeNull();
    expect(readDescription("Buy trade US0378331005 Apple, quantity: 1").isin).toBe("US0378331005");

    // A first attempt at this test used a made-up code that happened to pass
    // the checksum, which is a fair reminder that "looks wrong" and "is wrong"
    // are different questions.
  });

  it("counts how much of a file it could read", () => {
    expect(describableRows(["Interest payment", "Coffee", null, "PayOut to transit"])).toBe(2);
  });
});

describe("a flattened export, end to end", () => {
  it("is recognised as readable rather than rejected", () => {
    const i = inspectBrokerCsv(FLATTENED);

    expect(i.readable).toBe(true);
    expect(i.describedRows).toBe(11);
    expect(i.missingRequired).toEqual([]);
    // Crucially not mistaken for a bank statement, which would send it to the
    // importer that files purchases as expenses.
    expect(i.looksLikeBankStatement).toBe(false);
  });

  it("parses every row", () => {
    const { events, rejected } = parseBrokerCsv(FLATTENED);

    expect(rejected).toEqual([]);
    expect(events).toHaveLength(11);
    expect(events.filter((e) => e.kind === "BUY")).toHaveLength(3);
    expect(events.filter((e) => e.kind === "DEPOSIT")).toHaveLength(2);
    expect(events.filter((e) => e.kind === "INTEREST")).toHaveLength(2);
  });

  it("rebuilds the positions it describes", () => {
    const { events } = parseBrokerCsv(FLATTENED);
    const r = reconstructHoldings(events);

    const sp500 = r.holdings.find((h) => h.isin === "IE00B5BMR087");
    expect(sp500?.quantity).toBeCloseTo(0.0342, 6);
    expect(sp500?.costBasis).toBe(20);

    // Bought 3 for 13.41, sold 3 for 16.15, and collected 0.15 on the way.
    const closed = r.holdings.find((h) => h.isin === "CA25537R1091");
    expect(closed?.quantity).toBe(0);
    expect(closed?.realizedPnl).toBeCloseTo(2.74, 2);
    expect(closed?.incomeReceived).toBe(0.15);
  });

  it("keeps deposits out of the cost of what you hold", () => {
    // The whole reason a broker statement isn't a bank statement: money you
    // added is not money you spent on shares.
    const { events } = parseBrokerCsv(FLATTENED);
    const r = reconstructHoldings(events);

    expect(r.totalCostBasis).toBe(20);
  });
});
