import type { CCUItem } from '@/store/upgradesStore';
import { CcuSourceType, type HangarItem, type Ship } from '@/types';
import { areShipNamesEqual, findShipByIdOrName, normalizeShipNameMatch } from '@/utils/shipDisplay';
import { getActiveCompletedPathsSnapshot, parseStoredCompletedPaths, type StoredCompletedPathUsageEdge } from './completedPathsStorage';

type HangarLotRow = Pick<CCUItem, 'name' | 'parsed' | 'value' | 'canGift'> &
  Partial<Pick<CCUItem, 'from' | 'to'>> & { belongsTo: string | number };
type ShipIdentity = Pick<Ship, 'id' | 'name' | 'alias' | 'localizedName'>;

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
  const matchesShip = (name: string | undefined, ship: ShipIdentity) =>
    [ship.name, ship.alias, ship.localizedName].some(candidate => areShipNamesEqual(name, candidate));
  const matches = items.filter(item => item.type.toLowerCase() === 'ccu' &&
    matchesShip(item.fromShip, source) && matchesShip(item.toShip, target));
  if (!matches.length) return [];

  const known = new Map<string, number>();
  let legacy = 0;
  for (const edge of [...(getUsageByPair(snapshot).get(getPairKey(source.id, target.id)) ?? []), ...pending]) {
    if (edge.sourceShipId !== source.id || edge.targetShipId !== target.id || edge.sourceType !== CcuSourceType.HANGER) continue;
    const lotKey = edge.hangarAllocation?.lotKey;
    if (lotKey) known.set(lotKey, (known.get(lotKey) ?? 0) + 1);
    else legacy++;
  }

  // Reserve explicit lots before charging any unassigned legacy usage to the pool.
  const balances = matches.map(item => {
    const quantity = item.quantity || 1;
    const lotKey = item.lot?.lotKey;
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
  const findShip = (name?: string) => {
    const key = normalizeShipNameMatch(name);
    if (!shipLookup.has(key)) shipLookup.set(key, findShipByIdOrName(ships, name));
    return shipLookup.get(key);
  };
  for (const item of items) {
    const source = findShip(item.fromShip);
    const target = findShip(item.toShip);
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
