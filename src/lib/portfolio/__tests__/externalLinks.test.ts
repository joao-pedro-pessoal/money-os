import { describe, expect, it } from 'vitest';
import { externalAssetLinks, normalizeExternalSymbol } from '../externalLinks';

describe('asset research destinations', () => {
  it('uses the index chart for a long S&P 500 fund name and a short ETF query', () => {
    const links = externalAssetLinks('etf', 'iShares Core S&P 500 UCITS ETF USD (Acc)');
    expect(links.find(l => l.label.includes('TradingView'))?.url).toBe('https://www.tradingview.com/symbols/SPX/');
    expect(new URL(links[0].url).searchParams.get('query')).toBe('CORE S&P 500');
  });
  it('preserves sector qualifiers instead of searching for a different index', () => {
    const links = externalAssetLinks('etf', 'MSCI World Information Technology UCITS ETF');
    expect(new URL(links[0].url).searchParams.get('query')).toContain('INFORMATION TECHNOLOGY');
  });
  it('uses an ISIN as an identifier, never as a ticker', () => {
    expect(externalAssetLinks('etf','IE00B5BMR087')[0].url).toContain('etf-profile.html?isin=IE00B5BMR087');
  });
  it('keeps standalone BTC and ETH when deriving coin names', () => {
    expect(normalizeExternalSymbol('crypto','BTC')).toBe('BTCUSD');
    expect(normalizeExternalSymbol('crypto','ETH')).toBe('ETHUSD');
    expect(externalAssetLinks('crypto','BTC')[1].url).toBe('https://www.coingecko.com/en/coins/bitcoin');
  });
});
