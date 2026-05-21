import type { Ship } from '@/types';

type ShipNameDisplayable = {
  name?: string | null;
  localizedName?: string | null;
};

type ShipManufacturerDisplayable = {
  manufacturer?: {
    name?: string | null;
    localizedName?: string | null;
  } | null;
};

export type ShipLookupTarget = {
  id?: number | string | null;
  name?: string | null;
  localizedName?: string | null;
  alias?: string | null;
};

export type StoredCcuParsedShipTarget = {
  from?: string | null;
  to?: string | null;
};

function normalizeShipQueryValue(value?: string | null) {
  return value?.trim().toLowerCase() || '';
}

function normalizeShipMatchValue(value?: string | null) {
  return value?.trim().toUpperCase() || '';
}

export function normalizeShipNameMatch(value?: string | null) {
  return normalizeShipMatchValue(value);
}

export function areShipNamesEqual(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeShipMatchValue(left);
  const normalizedRight = normalizeShipMatchValue(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft === normalizedRight;
}

export function getShipDisplayName(ship?: ShipNameDisplayable | null): string {
  const localizedName = ship?.localizedName?.trim();
  if (localizedName) {
    return localizedName;
  }

  return ship?.name?.trim() || '';
}

export function getShipManufacturerDisplayName(ship?: ShipManufacturerDisplayable | null): string {
  const localizedManufacturerName = ship?.manufacturer?.localizedName?.trim();
  if (localizedManufacturerName) {
    return localizedManufacturerName;
  }

  return ship?.manufacturer?.name?.trim() || '';
}

export function matchesShipNameQuery(ship: ShipNameDisplayable | null | undefined, query: string): boolean {
  const normalizedQuery = normalizeShipQueryValue(query);
  if (!normalizedQuery) {
    return true;
  }

  return [ship?.name, ship?.localizedName]
    .filter((value): value is string => Boolean(value?.trim()))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function matchesShipManufacturerQuery(ship: ShipManufacturerDisplayable | null | undefined, query: string): boolean {
  const normalizedQuery = normalizeShipQueryValue(query);
  if (!normalizedQuery) {
    return true;
  }

  return [ship?.manufacturer?.name, ship?.manufacturer?.localizedName]
    .filter((value): value is string => Boolean(value?.trim()))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function findShipByIdOrName(ships: Ship[] | undefined, target?: ShipLookupTarget | string | null): Ship | null {
  if (!ships?.length || !target) {
    return null;
  }

  if (typeof target === 'string') {
    const normalizedName = normalizeShipMatchValue(target);
    if (!normalizedName) {
      return null;
    }

    return ships.find((ship) => [
      ship.name,
      ship.localizedName,
      ship.alias,
    ].some((candidate) => normalizeShipMatchValue(candidate) === normalizedName)) || null;
  }

  const numericShipId = typeof target.id === 'number'
    ? target.id
    : typeof target.id === 'string' && target.id.trim() !== '' && !Number.isNaN(Number(target.id))
      ? Number(target.id)
      : null;

  if (typeof numericShipId === 'number') {
    const matchedById = ships.find((ship) => ship.id === numericShipId);
    if (matchedById) {
      return matchedById;
    }
  }

  const candidates = [
    target.name,
    target.localizedName,
    target.alias,
  ]
    .map(normalizeShipMatchValue)
    .filter(Boolean);

  if (candidates.length === 0) {
    return null;
  }

  return ships.find((ship) => (
    candidates.includes(normalizeShipMatchValue(ship.name))
    || candidates.includes(normalizeShipMatchValue(ship.localizedName))
    || candidates.includes(normalizeShipMatchValue(ship.alias))
  )) || null;
}

export function resolveStoredCcuShip(
  ships: Ship[] | undefined,
  parsed: StoredCcuParsedShipTarget | null | undefined,
  direction: 'from' | 'to',
): Ship | null {
  if (!ships?.length) {
    return null;
  }

  const parsedName = direction === 'from' ? parsed?.from : parsed?.to;
  const normalizedParsedName = normalizeShipMatchValue(parsedName);
  if (!normalizedParsedName) {
    return null;
  }

  return ships.find((ship) => normalizeShipMatchValue(ship.name) === normalizedParsedName) || null;
}
