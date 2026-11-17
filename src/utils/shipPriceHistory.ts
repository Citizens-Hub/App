import type { PriceHistoryEntry } from '../types';

export type PriceGroup = 'standard' | 'warbond';
export interface ShipPricePeriod {
  id: string;
  group: PriceGroup;
  start: number;
  end: number;
  price: number;
}
export function priceGroup(edition = '', shipName = '', cents?: number, baseCents?: number): PriceGroup {
  const name = edition.toLowerCase().trim();
  if (/\bwarbond\b|\bwb\b|kriegsanleihe/.test(name)) return 'warbond';
  if (!name || name === 'unknown' || name.includes('standard')) return 'standard';
  const ship = shipName.toLowerCase().trim();
  if (name === `${ship} upgrade` || name === `${ship} - upgrade`) return 'standard';
  // Old records omit the edition marker. Use their actual discount, not a suffix guess.
  return Number.isFinite(cents) && Number.isFinite(baseCents) && cents! < baseCents! ? 'warbond' : 'standard';
}

/** Preserve each SKU's availability intervals before grouping by edition for display.
 * Two prices active at the same timestamp are separate periods, never a timestamp map.
 */
export function buildShipPricePeriods(history: readonly PriceHistoryEntry[], shipName: string, rangeStart: number, rangeEnd: number): ShipPricePeriod[] {
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) return [];
  const active = new Map<string, Array<{ start: number; price: number; group: PriceGroup; id: string }>>();
  const periods: ShipPricePeriod[] = [];
  const close = (period: { start: number; price: number; group: PriceGroup; id: string }, end: number) => {
    if (period.start > rangeEnd || end < rangeStart) return;
    periods.push({ ...period, start: Math.max(period.start, rangeStart), end: Math.min(end, rangeEnd) });
  };
  const events = history.map((entry, index) => ({entry,index})).filter(({entry}) => Number.isFinite(entry.ts) && entry.ts <= rangeEnd)
    .sort((a,b) => a.entry.ts-b.entry.ts || (a.entry.change === b.entry.change ? a.index-b.index : a.entry.change === '-' ? -1 : 1));
  for (const {entry,index} of events) {
    const knownSku = Number.isFinite(entry.sku);
    const key = knownSku ? `sku:${entry.sku}` : `edition:${entry.edition || ''}`;
    const opened = active.get(key) || [];
    if (entry.change === '-') {
      const previous = opened.shift();
      if (previous) close(previous,entry.ts);
      active.set(key,opened);
      continue;
    }
    const cents = entry.msrp ?? entry.baseMsrp;
    if (typeof cents !== 'number' || !Number.isFinite(cents) || cents < 0) continue;
    if (knownSku) { for (const previous of opened) close(previous,entry.ts); opened.length = 0; }
    opened.push({id:`${key}:${index}`,start:entry.ts,price:cents/100,group:priceGroup(entry.edition,shipName,cents,entry.baseMsrp)});
    active.set(key,opened);
  }
  for (const opened of active.values()) for (const previous of opened) close(previous,rangeEnd);
  return periods.sort((a,b)=>a.start-b.start || a.price-b.price);
}

export function latestShipPrices(history: readonly PriceHistoryEntry[], shipName: string, until = Date.now()) {
  const additions = history.filter(entry=>entry.change === '+' && entry.ts <= until && Number.isFinite(entry.ts) && Number.isFinite(entry.msrp ?? entry.baseMsrp));
  if (!additions.length) return null;
  const ts = Math.max(...additions.map(entry=>entry.ts));
  const prices = new Map<string,{group:PriceGroup;price:number}>();
  for(const entry of additions.filter(entry=>entry.ts === ts)) {
    const group=priceGroup(entry.edition,shipName,entry.msrp,entry.baseMsrp), price=(entry.msrp ?? entry.baseMsrp)!/100;
    if(price>=0) prices.set(`${group}:${price}`,{group,price});
  }
  return {ts,prices:[...prices.values()].sort((a,b)=>a.group.localeCompare(b.group)||a.price-b.price)};
}
