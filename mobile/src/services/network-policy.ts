import type { PlatformId } from '../domain/model';

const routes: Record<PlatformId, { origin: string; method: string; paths: string[] }[]> = {
  trading212: [{ origin: 'https://live.trading212.com', method: 'GET', paths: [
    '/api/v0/equity/account/summary', '/api/v0/equity/positions', '/api/v0/equity/metadata/instruments', '/api/v0/equity/history/dividends',
  ] }],
  hyperliquid: [{ origin: 'https://api.hyperliquid.xyz', method: 'POST', paths: ['/info'] }],
  bybit: [{ origin: 'https://api.bybit.com', method: 'GET', paths: ['/v5/account/wallet-balance', '/v5/position/list'] }],
  binance: [{ origin: 'https://api.binance.com', method: 'GET', paths: ['/api/v3/account', '/api/v3/ticker/price'] }],
  mexc: [
    { origin: 'https://api.mexc.com', method: 'GET', paths: ['/api/v3/account', '/api/v3/ticker/price'] },
    { origin: 'https://contract.mexc.com', method: 'GET', paths: ['/api/v1/private/account/assets', '/api/v1/contract/detail', '/api/v1/private/position/open_positions', '/api/v1/private/position/list/history_positions'] },
  ],
  kraken: [
    { origin: 'https://api.kraken.com', method: 'POST', paths: ['/0/private/BalanceEx', '/0/private/TradeBalance'] },
    { origin: 'https://api.kraken.com', method: 'GET', paths: ['/0/public/AssetPairs', '/0/public/Ticker'] },
  ],
  okx: [{ origin: 'https://www.okx.com', method: 'GET', paths: ['/api/v5/account/balance'] }],
};
const infoTypes = new Set(['clearinghouseState', 'spotClearinghouseState', 'spotMetaAndAssetCtxs', 'perpDexs', 'userAbstraction', 'portfolio', 'allMids', 'userFills']);
export function assertReadRequest(platform: PlatformId, rawUrl: string, method: string, body?: string): void {
  const url = new URL(rawUrl);
  if (url.username || url.password || url.hash || !routes[platform].some(rule =>
    rule.origin === url.origin && rule.method === method && rule.paths.includes(url.pathname)))
    throw new Error('Pedido bloqueado: este destino não pertence às consultas permitidas.');
  if (platform === 'hyperliquid') {
    let data: unknown;
    try { data = JSON.parse(body ?? ''); } catch { throw new Error('Pedido de consulta inválido.'); }
    if (!data || typeof data !== 'object' || !('type' in data) || !infoTypes.has(String(data.type)))
      throw new Error('Operação Hyperliquid não permitida.');
  }
}
export const PLATFORM_DETAILS: Record<PlatformId, { name: string; scope: string; secret: boolean }> = {
  hyperliquid: { name: 'Hyperliquid', scope: 'Endereço público. Spot e perpétuos; sem seed phrase nem chave privada.', secret: false },
  trading212: { name: 'Trading 212', scope: 'Conta Invest: saldo e posições. Chave API e segredo com permissões apenas de leitura.', secret: true },
  bybit: { name: 'Bybit', scope: 'Entidade global bybit.com: conta unificada e posições. Bybit EU não está disponível nesta versão.', secret: true },
  binance: { name: 'Binance', scope: 'Apenas carteira Spot. Funding, Earn e Futures não estão incluídos.', secret: true },
  kraken: { name: 'Kraken', scope: 'Saldos consultáveis pela API Spot. Não representa todas as carteiras e produtos.', secret: true },
  okx: { name: 'OKX', scope: 'Carteira Trading. Funding e Earn não estão incluídos. Exige também a passphrase da API.', secret: true },
  mexc: { name: 'MEXC', scope: 'Spot e Futures quando a API autoriza. Se Futures recusar, apenas Spot; Savings e Staking não incluídos.', secret: true },
};
