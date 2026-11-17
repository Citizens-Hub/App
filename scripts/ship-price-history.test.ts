import assert from 'node:assert/strict';
import {buildShipPricePeriods,latestShipPrices,priceGroup} from '../src/utils/shipPriceHistory.ts';
const rows = [
 {sku:1,ts:10,change:'+' as const,msrp:17500,edition:'Standard Edition'},
 {sku:2,ts:10,change:'+' as const,msrp:17000,edition:'Standard Edition'},
 {sku:3,ts:10,change:'+' as const,msrp:16500,edition:'Warbond'},
 {sku:1,ts:20,change:'-' as const},
 {sku:2,ts:30,change:'-' as const},
];
assert.deepEqual(buildShipPricePeriods(rows,'Zeus',0,40).map(p=>[p.price,p.start,p.end]),[[165,10,40],[170,10,30],[175,10,20]]);
assert.equal(latestShipPrices(rows,'Zeus',40)?.prices.length,3);
assert.equal(buildShipPricePeriods(rows,'Zeus',25,40).length,2);
assert.deepEqual(buildShipPricePeriods([{sku:1,ts:1,change:'+',msrp:100},{sku:1,ts:2,change:'+',msrp:200},{sku:1,ts:2,change:'-'}],'X',0,3).map(p=>[p.price,p.start,p.end]),[[1,1,2],[2,2,3]]);
assert.equal(buildShipPricePeriods([{ts:1,change:'+',msrp:100},{ts:1,change:'+',msrp:200}],'X',0,3).length,2);
assert.equal(buildShipPricePeriods([{ts:1,change:'+'}],'X',0,3).length,0);
assert.equal(priceGroup('Zeus Upgrade','Zeus'),'standard');
assert.equal(priceGroup('Zeus Upgrade - IAE','Zeus'),'standard');
assert.equal(priceGroup('Zeus Upgrade - IAE','Zeus',16500,17500),'warbond');
assert.equal(priceGroup('Kriegsanleihe-Edition','Zeus'),'warbond');
assert.equal(priceGroup('Fortune','Fortune',17500,17500),'standard');
assert.equal(priceGroup('Zeus WB','Zeus'),'warbond');
assert.equal(priceGroup('Unknown','Zeus'),'standard');
console.log('Ship price history: 13 assertions passed');
