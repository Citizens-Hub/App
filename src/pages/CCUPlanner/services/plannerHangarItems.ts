import type { CCUItem } from '@/store/upgradesStore';
import { CcuSourceType, type HangarCcuAllocation, type HangarItem, type Ship } from '@/types';
import { areShipNamesEqual, findShipByIdOrName, normalizeShipNameMatch } from '@/utils/shipDisplay';
import { getActiveCompletedPathsSnapshot, parseStoredCompletedPaths, type StoredCompletedPathUsageEdge } from './completedPathsStorage';

type HangarLotRow = Pick<CCUItem, 'name' | 'parsed' | 'value' | 'canGift'> &
  Partial<Pick<CCUItem, 'from' | 'to'>> & { belongsTo: string | number };
type ShipIdentity = Pick<Ship, 'id' | 'name' | 'alias' | 'localizedName'>;
type LotShipKey = number | string;
type ParsedLotKey = [owner: string, from: LotShipKey, to: LotShipKey, name: string, price: number, giftable: boolean];

export function getHangarLotKey(row: HangarLotRow): string {
  const shipKey = (id: number | undefined, name: string) =>
    typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : normalizeShipNameMatch(name);
  return JSON.stringify([
    String(row.belongsTo), shipKey(row.from?.id, row.parsed.from), shipKey(row.to?.id, row.parsed.to),
    row.name?.trim().replace(/\s+/g, ' ').toUpperCase() || '', row.value, Boolean(row.canGift)
  ]);
}

export function toPlannerHangarItems(rows: readonly CCUItem[], countUnassignedUsage = true): HangarItem[] {
  return rows
    .filter(row => !row.isBuyBack && !row.isSubscription)
    .map((row, index) => ({
      id: index,
      name: row.name,
      type: 'ccu',
      fromShip: row.parsed.from,
      toShip: row.parsed.to,
      price: row.value,
      quantity: row.quantity || 1,
      countUnassignedUsage,
      lot: {
        ownerId: Number(String(row.belongsTo ?? '').trim() || NaN),
        lotKey: getHangarLotKey(row),
        unitPrice: row.value
      }
    }));
}

type PairUsage = Map<string, StoredCompletedPathUsageEdge[]>;
type HangarLotBalance = { item: HangarItem; remaining: number };
const parsedLotKeys = new WeakMap<HangarCcuAllocation, ParsedLotKey | undefined>();

function parseLotKey(key?: string): ParsedLotKey | undefined {
  if (!key) return undefined;
  try {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value) || value.length !== 6) return undefined;
    const [owner, from, to, name, price, giftable] = value;
    const isShipKey = (slot: unknown): slot is LotShipKey => typeof slot === 'string' ||
      (typeof slot === 'number' && Number.isSafeInteger(slot) && slot > 0);
    if (typeof owner === 'string' && owner.trim() && isShipKey(from) && isShipKey(to) &&
        typeof name === 'string' && typeof price === 'number' && Number.isFinite(price) && typeof giftable === 'boolean') {
      return [owner, from, to, name, price, giftable];
    }
  } catch {
    // Unrecognized lot keys can still be matched by exact owner and raw key.
  }
}

function getParsedLotKey(allocation?: HangarCcuAllocation): ParsedLotKey | undefined {
  if (!allocation) return undefined;
  if (!parsedLotKeys.has(allocation)) parsedLotKeys.set(allocation, parseLotKey(allocation.lotKey));
  return parsedLotKeys.get(allocation);
}

function matchesLotShip(slot: LotShipKey | undefined, name: string | undefined, ship: ShipIdentity): boolean {
  if (typeof slot === 'number') return slot === ship.id;
  return [ship.name, ship.alias, ship.localizedName].some(candidate => areShipNamesEqual(slot ?? name, candidate));
}

function getComparableLotKey(allocation: HangarCcuAllocation, parsed: ParsedLotKey | undefined, source: ShipIdentity, target: ShipIdentity): string {
  if (parsed && Number(parsed[0]) === allocation.ownerId &&
      matchesLotShip(parsed[1], undefined, source) && matchesLotShip(parsed[2], undefined, target)) {
    // 84d1511 used a name for either ship whose numeric ID was unavailable. Resolve each slot independently.
    // This is a comparison key only; the old ledger is never rewritten or attributed to another owner.
    return JSON.stringify(['pair', allocation.ownerId, source.id, target.id, parsed[3], parsed[4], parsed[5]]);
  }
  return JSON.stringify(['raw', allocation.ownerId, allocation.lotKey]);
}

function getPairKey(sourceShipId: number, targetShipId: number): string {
  return `${sourceShipId}:${targetShipId}`;
}

let cachedSnapshot: string | null = null;
let cachedUsage: PairUsage = new Map();

function getUsageByPair(snapshot: string | null): PairUsage {
  if (snapshot === cachedSnapshot) return cachedUsage;

  const usage: PairUsage = new Map();
  for (const path of parseStoredCompletedPaths(snapshot)) {
    for (const edge of path.path?.edges ?? []) {
      if (edge.sourceType !== CcuSourceType.HANGER) continue;
      const key = getPairKey(edge.sourceShipId, edge.targetShipId);
      const entries = usage.get(key) ?? [];
      entries.push(edge);
      usage.set(key, entries);
    }
  }
  cachedSnapshot = snapshot;
  cachedUsage = usage;
  return usage;
}

export function getHangarCcuBalances(
  source: ShipIdentity,
  target: ShipIdentity,
  items: readonly HangarItem[],
  snapshot = getActiveCompletedPathsSnapshot(),
  pending: readonly StoredCompletedPathUsageEdge[] = []
): HangarLotBalance[] {
  const matches = items.flatMap(item => {
    if (item.type.toLowerCase() !== 'ccu') return [];
    const parsed = getParsedLotKey(item.lot);
    if (!matchesLotShip(parsed?.[1], item.fromShip, source) || !matchesLotShip(parsed?.[2], item.toShip, target)) return [];
    return [{ item, lotKey: item.lot ? getComparableLotKey(item.lot, parsed, source, target) : undefined }];
  });
  if (!matches.length) return [];

  const known = new Map<string, number>();
  let legacy = 0;
  for (const edge of [...(getUsageByPair(snapshot).get(getPairKey(source.id, target.id)) ?? []), ...pending]) {
    if (edge.sourceShipId !== source.id || edge.targetShipId !== target.id || edge.sourceType !== CcuSourceType.HANGER) continue;
    const allocation = edge.hangarAllocation;
    if (allocation?.lotKey) {
      const key = getComparableLotKey(allocation, getParsedLotKey(allocation), source, target);
      known.set(key, (known.get(key) ?? 0) + 1);
    } else legacy++;
  }

  // Reserve explicit lots before charging any unassigned legacy usage to the pool.
  const balances = matches.map(({ item, lotKey }) => {
    const quantity = item.quantity || 1;
    const used = lotKey ? Math.min(quantity, known.get(lotKey) ?? 0) : 0;
    if (lotKey && used) known.set(lotKey, known.get(lotKey)! - used);
    return { item, remaining: quantity - used };
  });
  for (const balance of balances) {
    if (balance.item.countUnassignedUsage === false) continue;
    const used = Math.min(legacy, balance.remaining);
    balance.remaining -= used;
    legacy -= used;
  }
  return balances;
}

// Resolve inventory before search/type filters so a hidden lot's reservations never move to a visible lot.
export function getHangarCcuRemainingByItem(
  items: readonly HangarItem[], ships: Ship[], snapshot = getActiveCompletedPathsSnapshot()
): Map<HangarItem, number> {
  const pairs = new Map<string, { source: Ship; target: Ship; items: HangarItem[] }>();
  const shipLookup = new Map<string, Ship | null>();
  const findShip = (slot: LotShipKey | undefined, name?: string) => {
    const id = typeof slot === 'number' ? slot : undefined;
    const key = id ? `id:${id}` : normalizeShipNameMatch(name);
    if (!shipLookup.has(key)) shipLookup.set(key, findShipByIdOrName(ships, { id, name }));
    return shipLookup.get(key);
  };
  for (const item of items) {
    const parsed = getParsedLotKey(item.lot);
    const source = findShip(parsed?.[1], item.fromShip);
    const target = findShip(parsed?.[2], item.toShip);
    if (!source || !target) continue;
    const key = getPairKey(source.id, target.id);
    const pair = pairs.get(key) ?? { source, target, items: [] };
    pair.items.push(item);
    pairs.set(key, pair);
  }

  const remaining = new Map<HangarItem, number>();
  for (const { source, target, items: group } of pairs.values()) {
    for (const balance of getHangarCcuBalances(source, target, group, snapshot)) {
      remaining.set(balance.item, balance.remaining);
    }
  }
  return remaining;
}
