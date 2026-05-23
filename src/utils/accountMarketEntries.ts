import { AccountMarketEntry, AccountMarketEntryKind, Ship } from '@/types';
import { findShipByIdOrName, getShipDisplayName } from '@/utils/shipDisplay';
import { getShipThumbLarge, toApiAssetUrl } from '@/utils/shipImage';

export interface AccountMarketGroupedMember {
  entry: AccountMarketEntry;
  nestedEntries: AccountMarketEntry[];
}

export interface AccountMarketEntryGroup {
  id: string;
  key: string;
  kind: AccountMarketEntryKind;
  source: 'hangar' | 'buyback';
  entry: AccountMarketEntry;
  nestedEntries: AccountMarketEntry[];
  members: AccountMarketGroupedMember[];
  totalQuantity: number;
  merged: boolean;
  highlighted: boolean;
  highlightSortOrder: number | null;
  sortValue: number;
}

export interface AccountMarketSourceSection {
  source: 'hangar' | 'buyback';
  items: Array<{
    type: 'group';
    group: AccountMarketEntryGroup;
  }>;
}

function normalizeText(value?: string | null) {
  return value?.trim().toUpperCase() || '';
}

function normalizeNumber(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function getEntrySource(entry: AccountMarketEntry): 'hangar' | 'buyback' {
  return entry.source === 'buyback' ? 'buyback' : 'hangar';
}

function getEntryQuantity(entry: AccountMarketEntry) {
  return Math.max(1, entry.quantity || 1);
}

function getEntryValueCents(entry: AccountMarketEntry): number {
  if (typeof entry.value === 'number' && Number.isFinite(entry.value) && entry.value > 0) {
    return Math.round(entry.value * 100);
  }

  return 0;
}

function getEntryMsrpCents(entry: AccountMarketEntry): number {
  if (typeof entry.msrp === 'number' && Number.isFinite(entry.msrp) && entry.msrp > 0) {
    return entry.msrp;
  }

  return 0;
}

function getEntryMoneyCents(entry: AccountMarketEntry, nestedEntries: AccountMarketEntry[] = []): number {
  const msrpCents = getEntryMsrpCents(entry);
  if (msrpCents > 0) {
    return msrpCents;
  }

  const valueCents = getEntryValueCents(entry);
  if (valueCents > 0) {
    return valueCents;
  }

  if (nestedEntries.length > 0) {
    return nestedEntries.reduce((sum, nestedEntry) => (
      sum + (getEntryMoneyCents(nestedEntry) * getEntryQuantity(nestedEntry))
    ), 0);
  }

  return 0;
}

function getEntryPriceSortCents(entry: AccountMarketEntry, nestedEntries: AccountMarketEntry[] = []): number {
  const valueCents = getEntryValueCents(entry);
  if (valueCents > 0) {
    return valueCents;
  }

  const msrpCents = getEntryMsrpCents(entry);
  if (msrpCents > 0) {
    return msrpCents;
  }

  if (nestedEntries.length > 0) {
    return nestedEntries.reduce((sum, nestedEntry) => (
      sum + (getEntryPriceSortCents(nestedEntry) * getEntryQuantity(nestedEntry))
    ), 0);
  }

  return 0;
}

function buildCcuPairKey(entry: Pick<AccountMarketEntry, 'fromShipId' | 'toShipId' | 'fromShipName' | 'toShipName'>) {
  const fromKey = entry.fromShipId ? `id:${entry.fromShipId}` : `name:${normalizeText(entry.fromShipName)}`;
  const toKey = entry.toShipId ? `id:${entry.toShipId}` : `name:${normalizeText(entry.toShipName)}`;
  return `${fromKey}->${toKey}`;
}

function hasBundleParent(entry: AccountMarketEntry, entriesByGroupId: Map<string, AccountMarketEntry[]>) {
  if (!entry.groupId) {
    return false;
  }

  const groupKey = `${getEntrySource(entry)}|${entry.groupId}`;
  return (entriesByGroupId.get(groupKey) || []).some((groupedEntry) => groupedEntry.kind === 'bundle');
}

function getEntryIdentityKey(
  entry: AccountMarketEntry,
  nestedEntries: AccountMarketEntry[] = [],
  options?: {
    includeSource?: boolean;
    includeGiftability?: boolean;
    includeValue?: boolean;
  },
) {
  const includeSource = options?.includeSource !== false;
  const includeGiftability = options?.includeGiftability !== false;
  const includeValue = options?.includeValue !== false;
  const keyParts = [
    `kind:${entry.kind}`,
  ];

  if (includeSource) {
    keyParts.push(`source:${getEntrySource(entry)}`);
  }

  if (includeGiftability) {
    keyParts.push(`gift:${entry.canGift === false ? 'no' : entry.canGift === true ? 'yes' : 'na'}`);
  }

  switch (entry.kind) {
    case 'ccu':
      keyParts.push(`pair:${buildCcuPairKey(entry)}`);
      break;
    case 'ship':
      keyParts.push(`ship:${entry.shipId || normalizeText(entry.shipName || entry.name)}`);
      keyParts.push(`name:${normalizeText(entry.shipName || entry.name)}`);
      break;
    case 'bundle': {
      const normalizedNestedEntries = mergeEntryListForDisplay(nestedEntries, {
        includeSource: true,
        includeGiftability: false,
      });
      const contentsKey = normalizedNestedEntries
        .map((nestedEntry) => (
          `${getEntryIdentityKey(nestedEntry, [], {
            includeSource: false,
            includeGiftability: false,
            includeValue,
          })}|qty:${getEntryQuantity(nestedEntry)}`
        ))
        .join('||');
      keyParts.push(`name:${normalizeText(entry.name)}`);
      keyParts.push(`contents:${contentsKey}`);
      break;
    }
    default:
      keyParts.push(`name:${normalizeText(entry.name)}`);
      keyParts.push(`ship:${entry.shipId || normalizeText(entry.shipName)}`);
      keyParts.push(`image:${normalizeText(entry.imageUrl)}`);
      break;
  }

  if (includeValue) {
    keyParts.push(`value:${normalizeNumber(entry.value)}`);
    keyParts.push(`msrp:${normalizeNumber(entry.msrp)}`);
  }

  return keyParts.join('|');
}

function getKindWeight(kind: AccountMarketEntryKind) {
  switch (kind) {
    case 'bundle':
      return 1;
    case 'ship':
      return 2;
    case 'ccu':
      return 3;
    case 'extra':
      return 4;
    case 'highlight':
      return 5;
    default:
      return 6;
  }
}

function sortEntriesForDisplay(left: AccountMarketEntry, right: AccountMarketEntry) {
  const moneyDiff = getEntryMoneyCents(right) - getEntryMoneyCents(left);
  if (moneyDiff !== 0) {
    return moneyDiff;
  }

  const kindDiff = getKindWeight(left.kind) - getKindWeight(right.kind);
  if (kindDiff !== 0) {
    return kindDiff;
  }

  return left.sortOrder - right.sortOrder;
}

function mergeEntryListForDisplay(
  entries: AccountMarketEntry[],
  options?: {
    includeSource?: boolean;
    includeGiftability?: boolean;
  },
) {
  const buckets = new Map<string, AccountMarketEntry[]>();

  entries.forEach((entry) => {
    const key = getEntryIdentityKey(entry, [], {
      includeSource: options?.includeSource,
      includeGiftability: options?.includeGiftability,
    });
    const bucket = buckets.get(key) || [];
    bucket.push(entry);
    buckets.set(key, bucket);
  });

  return Array.from(buckets.values())
    .map((bucket) => {
      const first = bucket[0];
      const totalQuantity = bucket.reduce((sum, entry) => sum + getEntryQuantity(entry), 0);
      return {
        ...first,
        quantity: totalQuantity,
        sortOrder: bucket.reduce((lowestSortOrder, entry) => Math.min(lowestSortOrder, entry.sortOrder), first.sortOrder),
      } satisfies AccountMarketEntry;
    })
    .sort(sortEntriesForDisplay);
}

export function getAccountEntryPrimaryLabel(entry: AccountMarketEntry) {
  if (entry.kind === 'ccu') {
    const fromShipName = entry.fromShipName || '-';
    const toShipName = entry.toShipName || entry.shipName || '-';
    return `${fromShipName} -> ${toShipName}`;
  }

  return entry.kind === 'bundle' ? entry.name : entry.shipName || entry.name;
}

export function getAccountEntryPreviewImage(entry: AccountMarketEntry, nestedEntries: AccountMarketEntry[] = [], ships: Ship[] = []) {
  if (entry.kind === 'ccu') {
    const toShip = findShipByIdOrName(ships, { id: entry.toShipId, name: entry.toShipName });
    const fromShip = findShipByIdOrName(ships, { id: entry.fromShipId, name: entry.fromShipName });
    return getShipThumbLarge(toShip) || getShipThumbLarge(fromShip);
  }

  if (entry.kind === 'bundle') {
    const nestedShip = nestedEntries.find((nestedEntry) => nestedEntry.kind === 'ship');
    if (nestedShip) {
      const ship = findShipByIdOrName(ships, { id: nestedShip.shipId, name: nestedShip.shipName || nestedShip.name });
      const image = getShipThumbLarge(ship);
      if (image) {
        return image;
      }
    }

    const entryImage = entry.imageUrl ? toApiAssetUrl(entry.imageUrl) : '';
    if (entryImage) {
      return entryImage;
    }

    const nestedImage = nestedEntries.find((nestedEntry) => nestedEntry.imageUrl)?.imageUrl;
    return nestedImage ? toApiAssetUrl(nestedImage) : '';
  }

  if (entry.kind === 'ship') {
    const ship = findShipByIdOrName(ships, { id: entry.shipId, name: entry.shipName || entry.name });
    return getShipThumbLarge(ship) || (entry.imageUrl ? toApiAssetUrl(entry.imageUrl) : '');
  }

  return entry.imageUrl ? toApiAssetUrl(entry.imageUrl) : '';
}

export function groupAccountMarketEntries(entries: AccountMarketEntry[]) {
  const contentEntries = entries
    .filter((entry) => entry.kind !== 'highlight')
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const entriesByGroupId = new Map<string, AccountMarketEntry[]>();
  contentEntries.forEach((entry) => {
    if (!entry.groupId) {
      return;
    }

    const groupKey = `${getEntrySource(entry)}|${entry.groupId}`;
    const groupedEntries = entriesByGroupId.get(groupKey) || [];
    groupedEntries.push(entry);
    entriesByGroupId.set(groupKey, groupedEntries);
  });

  const visitedGroupIds = new Set<string>();

  return contentEntries.flatMap<AccountMarketGroupedMember>((entry) => {
    if (entry.kind === 'ccu' && !hasBundleParent(entry, entriesByGroupId)) {
      return [{ entry, nestedEntries: [] }];
    }

    if (!entry.groupId) {
      return [{ entry, nestedEntries: [] }];
    }

    const groupKey = `${getEntrySource(entry)}|${entry.groupId}`;

    if (visitedGroupIds.has(groupKey)) {
      return [];
    }

    visitedGroupIds.add(groupKey);
    const groupedEntries = (entriesByGroupId.get(groupKey) || [entry])
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder);

    if (groupedEntries.length === 1) {
      return [{ entry: groupedEntries[0], nestedEntries: [] }];
    }

    const parentEntry = groupedEntries.find((groupedEntry) => groupedEntry.kind === 'bundle') || groupedEntries[0];
    return [{
      entry: parentEntry,
      nestedEntries: groupedEntries.filter((groupedEntry) => groupedEntry.id !== parentEntry.id),
    }];
  });
}

export function createAccountMarketHighlightEntry(entry: AccountMarketEntry, sortOrder: number): AccountMarketEntry {
  return {
    ...entry,
    id: `highlight-${entry.id}-${sortOrder}`,
    kind: 'highlight',
    sortOrder,
    linkedEntryId: entry.id,
  };
}

export function doesHighlightReferenceEntry(highlightEntry: AccountMarketEntry, entry: AccountMarketEntry) {
  if (
    highlightEntry.linkedEntryId
    && (
      highlightEntry.linkedEntryId === entry.id
      || highlightEntry.linkedEntryId === entry.linkedEntryId
    )
  ) {
    return true;
  }

  return (
    highlightEntry.groupId === entry.groupId &&
    highlightEntry.name === entry.name &&
    (highlightEntry.shipId ?? null) === (entry.shipId ?? null) &&
    (highlightEntry.fromShipId ?? null) === (entry.fromShipId ?? null) &&
    (highlightEntry.toShipId ?? null) === (entry.toShipId ?? null) &&
    (highlightEntry.source || 'hangar') === (entry.source || 'hangar')
  );
}

export function buildAccountMarketSourceSections(entries: AccountMarketEntry[]): AccountMarketSourceSection[] {
  const highlightEntries = entries
    .filter((entry) => entry.kind === 'highlight')
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const contentEntries = entries
    .filter((entry) => entry.kind !== 'highlight')
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const groupedEntries = groupAccountMarketEntries(contentEntries);
  const sourceBuckets = new Map<string, AccountMarketGroupedMember[]>();

  groupedEntries.forEach((member) => {
    const source = getEntrySource(member.entry);
    const key = getEntryIdentityKey(member.entry, member.nestedEntries);
    const bucketKey = `${source}|${key}`;
    const bucket = sourceBuckets.get(bucketKey) || [];
    bucket.push(member);
    sourceBuckets.set(bucketKey, bucket);
  });

  const mergedGroups = Array.from(sourceBuckets.entries())
    .map(([key, members]) => {
      const firstMember = members[0];
      const representative = firstMember.entry;
      const totalQuantity = members.reduce((sum, member) => sum + getEntryQuantity(member.entry), 0);
      const mergedNestedEntries = mergeEntryListForDisplay(
        firstMember.nestedEntries,
        {
          includeSource: true,
          includeGiftability: false,
        },
      );
      const groupEntry: AccountMarketEntry = {
        ...representative,
        quantity: totalQuantity,
        sortOrder: members.reduce((lowestSortOrder, member) => Math.min(lowestSortOrder, member.entry.sortOrder), representative.sortOrder),
      };
      const sortValue = getEntryPriceSortCents(groupEntry, representative.kind === 'bundle' ? mergedNestedEntries : []);
      const groupEntries = [
        groupEntry,
        ...members.map((member) => member.entry),
        ...members.flatMap((member) => member.nestedEntries),
      ];
      const highlightSortOrder = highlightEntries.reduce<number | null>((lowestSortOrder, highlightEntry) => {
        const referencesGroup = groupEntries.some((entry) => doesHighlightReferenceEntry(highlightEntry, entry));
        if (!referencesGroup) {
          return lowestSortOrder;
        }

        return lowestSortOrder === null
          ? highlightEntry.sortOrder
          : Math.min(lowestSortOrder, highlightEntry.sortOrder);
      }, null);

      return {
        id: members.length > 1 || totalQuantity > 1 ? `merged-${key}` : representative.id,
        key,
        kind: representative.kind,
        source: getEntrySource(representative),
        entry: groupEntry,
        nestedEntries: representative.kind === 'bundle' ? mergedNestedEntries : [],
        members,
        totalQuantity,
        merged: members.length > 1 || totalQuantity > 1,
        highlighted: highlightSortOrder !== null,
        highlightSortOrder,
        sortValue,
      } satisfies AccountMarketEntryGroup;
    });

  return (['hangar', 'buyback'] as const)
    .map((source) => ({
      source,
      items: mergedGroups
        .filter((group) => group.source === source)
        .sort((left, right) => {
          if (left.highlighted !== right.highlighted) {
            return left.highlighted ? -1 : 1;
          }

          if (left.highlighted && right.highlighted) {
            const highlightDiff = (left.highlightSortOrder ?? Number.MAX_SAFE_INTEGER) - (right.highlightSortOrder ?? Number.MAX_SAFE_INTEGER);
            if (highlightDiff !== 0) {
              return highlightDiff;
            }
          }

          const valueDiff = right.sortValue - left.sortValue;
          if (valueDiff !== 0) {
            return valueDiff;
          }

          const kindDiff = getKindWeight(left.kind) - getKindWeight(right.kind);
          if (kindDiff !== 0) {
            return kindDiff;
          }

          return left.entry.sortOrder - right.entry.sortOrder;
        })
        .map((group) => ({
          type: 'group' as const,
          group,
        })),
    }))
    .filter((section) => section.items.length > 0);
}

export function getAccountMarketEntryShipDisplay(entry: AccountMarketEntry, ships: Ship[]) {
  if (entry.kind === 'ccu') {
    const fromShip = findShipByIdOrName(ships, { id: entry.fromShipId, name: entry.fromShipName });
    const toShip = findShipByIdOrName(ships, { id: entry.toShipId, name: entry.toShipName });
    return {
      fromShip,
      toShip,
      fromShipName: getShipDisplayName(fromShip) || entry.fromShipName || '-',
      toShipName: getShipDisplayName(toShip) || entry.toShipName || entry.shipName || '-',
    };
  }

  const ship = findShipByIdOrName(ships, { id: entry.shipId, name: entry.shipName || entry.name });
  return {
    ship,
    shipName: getShipDisplayName(ship) || entry.shipName || entry.name,
  };
}
