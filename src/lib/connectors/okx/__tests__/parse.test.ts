import { describe, it, expect } from "vitest";
import {
  okxError,
  parseAccountBalances,
  parseTotalEquity,
  okxTimestamp,
  signRequest,
  isValidApiKey,
} from "../parse";

const ok = (data: unknown) => ({ code: "0", msg: "", data });

/**
 * The trap this whole file is shaped around.
 *
 * `code` is a **string** and success is `"0"` — which is truthy in JavaScript.
 * So `if (!code)` is false on success and false on failure, and `if (code)` is
 * true on both. Only an explicit comparison gives the right answer, and the
 * wrong answer here is an account that appears to hold nothing.
 *
 * Both shapes below were confirmed against the live API: a good request answers
 * `code: "0"`, a bad one `code: "51000"`.
 */
describe('code is a string, and "0" is truthy', () => {
  it("reads the success code as success", () => {
    expect(okxError(ok([]))).toBeNull();
  });

  it("reads a failure code as a failure, with the venue's words", () => {
    expect(okxError({ code: "51000", msg: "Parameter instType error", data: [] })).toBe(
      "Parameter instType error (code 51000)"
    );
  });

  /** The specific hazard, asserted so nobody replaces the check with a shortcut. */
  it("does not treat the truthiness of the code as its meaning", () => {
    // Truthy and successful.
    expect(Boolean("0")).toBe(true);
    expect(okxError({ code: "0", msg: "", data: [] })).toBeNull();
    // Also truthy, and a failure.
    expect(Boolean("50113")).toBe(true);
    expect(okxError({ code: "50113", msg: "Invalid Sign", data: [] })).not.toBeNull();
  });

  it("refuses a reply with no code at all rather than assuming success", () => {
    expect(okxError({ data: [] })).not.toBeNull();
    expect(okxError(null)).not.toBeNull();
    expect(okxError("<html>502</html>")).not.toBeNull();
  });

  it("still reports a failure whose message is empty", () => {
    expect(okxError({ code: "1", msg: "", data: [] })).toBe("no message (code 1)");
  });
});

describe("balances", () => {
  const account = (details: unknown[], totalEq = "1234.56") =>
    ok([{ totalEq, details }]);

  it("reads what is held and what the venue says it is worth", () => {
    const b = parseAccountBalances(
      account([
        { ccy: "BTC", eq: "0.5", eqUsd: "39308.00", frozenBal: "0.1" },
        { ccy: "USDT", eq: "1200", eqUsd: "1200.00", frozenBal: "0" },
      ])
    );

    expect(b).toEqual([
      { currency: "BTC", total: 0.5, hold: 0.1, usdValue: 39308 },
      { currency: "USDT", total: 1200, hold: 0, usdValue: 1200 },
    ]);
  });

  it("adds what is frozen in orders to what is held as margin", () => {
    const [b] = parseAccountBalances(
      account([{ ccy: "BTC", eq: "1", eqUsd: "78000", frozenBal: "0.2", ordFrozen: "0.05" }])
    );
    expect(b.hold).toBeCloseTo(0.25, 8);
  });

  /**
   * Null, not zero. A holding the venue puts no value on is unpriced, and
   * counting it as nothing is a portfolio that quietly shrinks.
   */
  it("leaves a holding with no stated value unpriced", () => {
    const [b] = parseAccountBalances(account([{ ccy: "OBSCURE", eq: "100", eqUsd: "" }]));
    expect(b.usdValue).toBeNull();
    expect(b.total).toBe(100);
  });

  it("drops a zero balance, which is a measurement of nothing", () => {
    const b = parseAccountBalances(
      account([
        { ccy: "BTC", eq: "0.5", eqUsd: "39308" },
        { ccy: "ADA", eq: "0", eqUsd: "0" },
      ])
    );
    expect(b.map((x) => x.currency)).toEqual(["BTC"]);
  });

  it("has nothing to report when the reply carried an error", () => {
    expect(
      parseAccountBalances({ code: "50113", msg: "Invalid Sign", data: [{ details: [{ ccy: "BTC", eq: "1" }] }] })
    ).toEqual([]);
  });

  it("survives a reply with no data or no details", () => {
    expect(parseAccountBalances(ok([]))).toEqual([]);
    expect(parseAccountBalances(ok([{ totalEq: "0" }]))).toEqual([]);
  });
});

describe("the account total", () => {
  it("takes the venue's own figure", () => {
    expect(parseTotalEquity(ok([{ totalEq: "1234.56", details: [] }]))).toBe(1234.56);
  });

  /**
   * Null is "OKX did not say" and zero is "you have nothing". On a balance
   * sheet those are different claims and must not render the same.
   */
  it("is null when the venue states no total", () => {
    expect(parseTotalEquity(ok([{ details: [] }]))).toBeNull();
    expect(parseTotalEquity({ code: "50113", msg: "Invalid Sign", data: [] })).toBeNull();
  });
});

describe("signing", () => {
  const SECRET = "22582BD0CFF14C41EDBF1AB98506286D";

  /**
   * The timestamp format is part of the signed material, so a differently
   * formatted one is rejected as an invalid signature — which reads exactly
   * like a wrong key and gets diagnosed as one.
   */
  it("stamps the time as ISO 8601 in UTC with milliseconds", () => {
    expect(okxTimestamp(new Date(Date.UTC(2026, 11, 8, 9, 8, 57, 715)))).toBe(
      "2026-12-08T09:08:57.715Z"
    );
  });

  it("is base64 and the right length for SHA-256", () => {
    const sig = signRequest({
      timestamp: "2026-12-08T09:08:57.715Z",
      method: "GET",
      requestPath: "/api/v5/account/balance",
      apiSecret: SECRET,
    });
    expect(Buffer.from(sig, "base64")).toHaveLength(32);
  });

  it("signs the method in upper case whatever it was given", () => {
    const base = { timestamp: "t", requestPath: "/p", apiSecret: SECRET };
    expect(signRequest({ ...base, method: "get" })).toBe(
      signRequest({ ...base, method: "GET" })
    );
  });

  /**
   * The body is part of the signed material even when it is empty. Omitting it
   * on a GET produces a different signature from including "" — and the two
   * differ silently.
   */
  it("treats an absent body as the empty string", () => {
    const base = { timestamp: "t", method: "GET", requestPath: "/p", apiSecret: SECRET };
    expect(signRequest(base)).toBe(signRequest({ ...base, body: "" }));
  });

  it("changes with every part of the material", () => {
    const base = {
      timestamp: "2026-12-08T09:08:57.715Z",
      method: "GET",
      requestPath: "/api/v5/account/balance",
      apiSecret: SECRET,
    };
    const signature = signRequest(base);

    expect(signRequest({ ...base, timestamp: "2026-12-08T09:08:57.716Z" })).not.toBe(signature);
    expect(signRequest({ ...base, requestPath: "/api/v5/account/config" })).not.toBe(signature);
    expect(signRequest({ ...base, method: "POST" })).not.toBe(signature);
    expect(signRequest({ ...base, body: "{}" })).not.toBe(signature);
    expect(signRequest({ ...base, apiSecret: "different" })).not.toBe(signature);
  });

  /**
   * The query string is part of the request path and therefore part of the
   * signature. Signing the bare path and sending it with parameters is a
   * rejection that looks like a credential problem.
   */
  it("signs the query string along with the path", () => {
    const base = { timestamp: "t", method: "GET", apiSecret: SECRET };
    expect(signRequest({ ...base, requestPath: "/api/v5/account/balance" })).not.toBe(
      signRequest({ ...base, requestPath: "/api/v5/account/balance?ccy=BTC" })
    );
  });
});

describe("the key itself", () => {
  it("rejects an empty box and a wallet address pasted by mistake", () => {
    expect(isValidApiKey("")).toBe(false);
    expect(isValidApiKey("0x1234567890abcdef1234567890abcdef12345678")).toBe(false);
  });

  it("accepts the UUID OKX issues", () => {
    expect(isValidApiKey("1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d")).toBe(true);
  });
});
