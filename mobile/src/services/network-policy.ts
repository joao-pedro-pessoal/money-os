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
/**
 * The encrypted sync server: which address may be used and which requests it may receive.
 *
 * Beside the broker rules on purpose, so there is one place that decides where
 * this app is allowed to send anything. Exact routes and methods, like the
 * brokers', and HTTPS always — except for the addresses a developer's own machine
 * answers on, including 10.0.2.2, which is how the Android emulator reaches it.
 */
const VAULT_ROUTES: { method: string; path: RegExp }[] = [
  { method: 'POST', path: /^\/api\/vault\/register$/ },
  { method: 'POST', path: /^\/api\/vault\/login$/ },
  { method: 'GET', path: /^\/api\/vault$/ },
  { method: 'PUT', path: /^\/api\/vault$/ },
  { method: 'GET', path: /^\/api\/vault\/devices$/ },
  { method: 'DELETE', path: /^\/api\/vault\/devices\/[A-Za-z0-9_-]{1,64}$/ },
];
const DEVELOPMENT_HOSTS = new Set(['127.0.0.1', 'localhost', '10.0.2.2']);

export function vaultServerOrigin(rawServer: string): string {
  let url: URL;
  try { url = new URL(rawServer); } catch { throw new Error('Endereço do servidor de sincronização inválido.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Indica só o endereço do servidor, sem caminho, parâmetros nem credenciais.');
  const development = DEVELOPMENT_HOSTS.has(url.hostname) && url.protocol === 'http:';
  if (url.protocol !== 'https:' && !development) throw new Error('O servidor de sincronização tem de usar HTTPS.');
  return url.origin;
}

export function assertVaultRequest(origin: string, rawUrl: string, method: string): void {
  const url = new URL(rawUrl);
  if (url.origin !== origin || url.username || url.password || url.search || url.hash ||
      !VAULT_ROUTES.some(rule => rule.method === method && rule.path.test(url.pathname)))
    throw new Error('Pedido bloqueado: este destino não pertence ao servidor de sincronização.');
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
