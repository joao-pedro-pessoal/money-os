import { fetch as nativeFetch } from 'expo/fetch';
import { createTrading212Connector, clearInstrumentCache } from '../../../src/lib/connectors/trading212';
import { createHyperliquidConnector } from '../../../src/lib/connectors/hyperliquid';
import { createBybitConnector } from '../../../src/lib/connectors/bybit';
import { createBinanceConnector } from '../../../src/lib/connectors/binance';
import { createKrakenConnector } from '../../../src/lib/connectors/kraken';
import { createOkxConnector } from '../../../src/lib/connectors/okx';
import { createMexcConnector } from '../../../src/lib/connectors/mexc';
import type { Connector } from '../../../src/lib/connectors/types';
import type { Credentials } from '../storage/secrets';
import type { PlatformId } from '../domain/model';
import { assertReadRequest } from './network-policy';

export class SyncError extends Error {}
export function createDirectConnector(platform: PlatformId, credentials: Credentials, session: AbortSignal): Connector {
  async function request(url: string, method: string, headers: Record<string, string>, body?: string): Promise<unknown> {
    assertReadRequest(platform, url, method, body);
    if (session.aborted) throw new SyncError('Sincronização cancelada.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    session.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 25000);
    try {
      const response = await nativeFetch(url, {
        method, headers: { Accept: 'application/json', ...headers }, body,
        signal: controller.signal, redirect: 'error', credentials: 'omit',
      });
      if (response.status === 429) throw new SyncError('Limite da API atingido. Aguarda antes de voltar a sincronizar.');
      if (response.status === 401 || response.status === 403)
        throw new SyncError('A corretora recusou o acesso. Verifica as permissões de leitura, a região e as restrições de IP.');
      if (!response.ok) throw new SyncError(`A corretora devolveu HTTP ${response.status}. O último saldo foi mantido.`);
      if (Number(response.headers.get('content-length') ?? 0) > 20000000) throw new SyncError('Resposta demasiado grande.');
      const text = await response.text();
      if (text.length > 20000000) throw new SyncError('Resposta demasiado grande.');
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof SyncError) throw error;
      throw new SyncError('Não foi possível consultar a corretora. Verifica a ligação e tenta novamente.');
    } finally {
      clearTimeout(timeout);
      session.removeEventListener('abort', abort);
    }
  }
  const get = (url: string, headers: Record<string, string> = {}) => request(url, 'GET', headers);
  switch (platform) {
    case 'trading212': return createTrading212Connector(credentials, get);
    case 'hyperliquid': return createHyperliquidConnector((url, body) => request(url, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(body)));
    case 'bybit': return createBybitConnector(credentials, get);
    case 'binance': return createBinanceConnector(credentials, get);
    case 'mexc': return createMexcConnector(credentials, get);
    case 'kraken': return createKrakenConnector(credentials, (url, body, headers) => request(url, 'POST', headers, body), get);
    case 'okx': return createOkxConnector(credentials, get);
  }
}
export function clearConnectorMemory(): void { clearInstrumentCache(); }
