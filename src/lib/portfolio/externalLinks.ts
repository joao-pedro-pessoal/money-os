import { shortName } from "./shortName";
export type ExternalAssetLink = { label: string; url: string };

const encode = (value: string) => encodeURIComponent(value.trim().toUpperCase());

const CRYPTO_QUOTES = ["USDT", "USDC", "USD", "EUR", "BTC", "ETH"];
const SYMBOL_ALIASES: Record<string, string> = {
  "S&P 500": "SPX", "S&P500": "SPX", SP500: "SPX", "NASDAQ 100": "NDX", NASDAQ100: "NDX",
  DOW: "DJI", GOLD: "XAUUSD", XAU: "XAUUSD", SILVER: "XAGUSD", XAG: "XAGUSD",
  OIL: "USOIL", WTI: "USOIL", BRENT: "UKOIL",
};

/** Converts a user's ticker into a stable symbol for external research URLs. */
export function normalizeExternalSymbol(assetType: string | null | undefined, symbol: string): string {
  const original = symbol.trim().toUpperCase();
  // Broker symbols often arrive as `VWCE.DE`, `NASDAQ:NVDA` or `BTC-USD`.
  // Keep the instrument ticker while dropping the venue decoration.
  const venueTicker = original.includes(":") ? original.split(":").pop()! : original;
  const raw = venueTicker.replace(/[\s/_-]+/g, "");
  const alias = SYMBOL_ALIASES[original] ?? SYMBOL_ALIASES[raw];
  if (alias) return alias;
  if (assetType === "crypto" || assetType === "stablecoin" || assetType === "staking") {
    if (CRYPTO_QUOTES.some((quote) => raw.length > quote.length && raw.endsWith(quote))) return raw;
    return `${raw}USD`;
  }
  return raw;
}

/** Reference links only; these never feed valuation or P&L. */
export function externalAssetLinks(assetType: string | null | undefined, symbol: string, displayName?: string | null): ExternalAssetLink[] {
  const s = normalizeExternalSymbol(assetType, symbol);
  const original = symbol.trim().toUpperCase();
  const isIsin = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(original);
  const shortEtfName = (() => {
    return isIsin ? original : shortName(displayName?.trim() || symbol);
  })();
  const coinSlug = (assetType === "crypto" || assetType === "stablecoin" || assetType === "staking"
    ? s.replace(/(USDT|USD|EUR|BTC|ETH)$/, "")
    : s).toLowerCase();
  const coinNames: Record<string, string> = { btc: "bitcoin", eth: "ethereum", hype: "hyperliquid", sol: "solana", usdt: "tether", usdc: "usd-coin" };
  const coinName = coinNames[coinSlug];
  const coinGecko = coinName ? `https://www.coingecko.com/en/coins/${coinName}` : `https://www.google.com/search?q=${encodeURIComponent(`site:coingecko.com/en/coins/ ${symbol}`)}`;
  const coinMarketCap = coinName ? `https://coinmarketcap.com/currencies/${coinName}/` : `https://www.google.com/search?q=${encodeURIComponent(`site:coinmarketcap.com/currencies/ ${symbol}`)}`;
  const q = encode(s);
  // Search is more reliable than guessing an exchange-specific chart slug:
  // S&P 500 may be `SPX`, `US500` or a broker CFD depending on the venue.
  const sp500 = /(?:S\s*&?\s*P[ -]*500|SPX)/i.test(`${displayName ?? ""} ${symbol}`);
  const tradingView = sp500 ? "https://www.tradingview.com/symbols/SPX/" : `https://www.tradingview.com/search/?q=${encode(assetType === "etf" ? shortEtfName : s)}`;
  switch (assetType) {
    case "cash":
      return [
        { label: "Trading Economics — central bank rates", url: "https://tradingeconomics.com/central-bank-interest-rate" },
        { label: "Investing.com — central banks", url: "https://www.investing.com/central-banks/" },
      ];
    case "stablecoin":
      return [
        { label: "DeFiLlama — pegs and yields", url: "https://defillama.com/stablecoins" },
        { label: "CoinGecko", url: coinGecko },
        { label: "CoinMarketCap", url: coinMarketCap },
      ];
    case "staking":
      return [
        { label: "StakingRewards.com", url: `https://www.google.com/search?q=${encodeURIComponent(`site:stakingrewards.com ${symbol}`)}` },
        { label: "DeFiLlama — yields", url: "https://defillama.com/yields" },
      ];
    case "crypto":
      return [
        { label: "TradingView", url: tradingView },
        { label: "CoinGecko", url: coinGecko },
        { label: "CoinMarketCap", url: coinMarketCap },
      ];
    case "stock":
      return [
        { label: "TradingView", url: tradingView },
        { label: "Stock Analysis", url: `https://stockanalysis.com/stocks/${s.toLowerCase()}/` },
        { label: "OpenInsider", url: `https://openinsider.com/search?q=${q}` },
      ];
    case "etf":
      return [
        { label: "justETF", url: isIsin ? `https://www.justetf.com/en/etf-profile.html?isin=${encode(original)}` : `https://www.justetf.com/en/search.html?search=ETFS&query=${encode(shortEtfName)}` },
        { label: "Trackinsight", url: `https://www.google.com/search?q=${encodeURIComponent("site:trackinsight.com " + shortEtfName)}` },
        { label: sp500 ? "TradingView — S&P 500 index" : "TradingView", url: tradingView },
      ];
    case "bond":
      return [
        { label: "Investing.com — government yields", url: "https://www.investing.com/rates-bonds/" },
        { label: "Trading Economics — bonds", url: "https://tradingeconomics.com/bonds" },
      ];
    case "real_estate":
      return [
        { label: "TradingView — REITs", url: tradingView },
        { label: "Trading Economics — housing", url: "https://tradingeconomics.com/indicators" },
      ];
    case "commodity":
      return [
        { label: "TradingView", url: tradingView },
        { label: "Investing.com — commodities", url: "https://www.investing.com/commodities" },
      ];
    case "index":
      return [
        { label: "TradingView", url: tradingView },
        { label: "Investing.com — global indices", url: "https://www.investing.com/indices/world-indices" },
      ];
    default:
      return [{ label: "TradingView", url: tradingView }];
  }
}
