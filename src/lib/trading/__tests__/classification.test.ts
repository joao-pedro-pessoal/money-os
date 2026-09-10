import { describe, it, expect } from 'vitest';
import { parseTradeClassification } from '../classification';
import { groupValuesOf, type TradeHistoryRow } from '../filter';
import { byTag } from '../stats';

describe('classifications per trade', () => {
  it('accepts the open-position vocabulary and clears unset fields', () => {
    expect(parseTradeClassification({assetType:'stock', riskLevel:'high', timeHorizon:'short', liquidity:'low', expectedReturn:'aggressive'})).toMatchObject({riskLevel:'high', notes:null, playlistId:null, apr:null});
    expect(parseTradeClassification({})).toMatchObject({riskLevel:null, assetType:null});
  });
  it('rejects invalid choices and invalid rates', () => {
    expect(() => parseTradeClassification({riskLevel:'invented'})).toThrow();
    expect(() => parseTradeClassification({apr:'NaN'})).toThrow();
    expect(() => parseTradeClassification({notes:'x'.repeat(10001)})).toThrow();
  });
  it('groups two trades of the same symbol by their individual risk', () => {
    const rows = ['low','high'].map((riskLevel, i) => ({id:String(i), date:'2026-01-01', type:'SELL', symbol:'BTC', quantity:1, amount:10, fees:0, realizedPnl:i ? -5 : 10, description:null, tags:[], accountName:'a', currency:'USD', classification:{ ...parseTradeClassification({riskLevel}), apr:null, connectionId:'c',coin:'BTC',assetTypeAuto:false,playlistName:null }} satisfies TradeHistoryRow));
    const groups = byTag(rows, r => groupValuesOf(r as TradeHistoryRow,'riskLevel'));
    expect(groups).toHaveLength(2);
    expect(groupValuesOf(rows[0],'riskLevel')).toEqual(['low']);
    expect(groupValuesOf(rows[1],'riskLevel')).toEqual(['high']);
  });
});
