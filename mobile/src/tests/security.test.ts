import { describe, it, expect } from 'vitest';
import { createHmac as nodeHmac, createHash as nodeHash } from 'node:crypto';
import { createHmac, createHash } from '../services/portable-crypto';
import { assertReadRequest } from '../services/network-policy';
import { amountInput, add } from '../domain/money';

describe('outbound read-only boundary', () => {
  it.each([
    ['https://api.binance.com/api/v3/order', 'POST'],
    ['https://api.binance.com/api/v3/order', 'GET'],
    ['https://api.binance.com.evil.example/api/v3/account', 'GET'],
    ['http://api.binance.com/api/v3/account', 'GET'],
    ['https://user:password@api.binance.com/api/v3/account', 'GET'],
    ['https://api.binance.com/sapi/v1/capital/withdraw/apply', 'POST'],
  ])('blocks %s %s', (url, method) => { expect(() => assertReadRequest('binance', url, method)).toThrow(); });
  it('allows exact signed read endpoints', () => {
    expect(() => assertReadRequest('binance', 'https://api.binance.com/api/v3/account?timestamp=1&signature=test', 'GET')).not.toThrow();
  });
  it('does not accept a different provider even if it is another supported broker', () => {
    expect(() => assertReadRequest('binance', 'https://api.mexc.com/api/v3/account', 'GET')).toThrow();
  });
  it('blocks Hyperliquid write types even on its read endpoint', () => {
    expect(() => assertReadRequest('hyperliquid', 'https://api.hyperliquid.xyz/info', 'POST', '{"type":"order"}')).toThrow();
    expect(() => assertReadRequest('hyperliquid', 'https://api.hyperliquid.xyz/info', 'POST', '{"type":"userFills","user":"test"}')).not.toThrow();
  });
});
describe('portable signing agrees byte-for-byte with Node', () => {
  it.each(['sha256', 'sha512'])('signs %s text and binary payloads', algorithm => {
    for (const key of ['segredo de teste', Buffer.from([1, 250, 3])]) {
      for (const encoding of ['hex', 'base64'] as const) {
        expect(createHmac(algorithm, key).update('/private').update(Buffer.from([0, 255, 1])).digest(encoding))
          .toBe(nodeHmac(algorithm, key).update('/private').update(Buffer.from([0, 255, 1])).digest(encoding));
      }
    }
    expect(createHash(algorithm).update('nonce').digest()).toEqual(nodeHash(algorithm).update('nonce').digest());
  });
});
describe('exact stored amounts', () => {
  it('does not accumulate floating point errors', () => {
    let amount = '0'; for (let i = 0; i < 1000; i++) amount = add(amount, '0.01');
    expect(amount).toBe('10'); expect(add('0.1', '0.2')).toBe('0.3');
  });
  it.each(['NaN', 'Infinity', '', '1e3', '1.234.56', '0.000000001'])('rejects %s', value => { expect(() => amountInput(value)).toThrow(); });
});
