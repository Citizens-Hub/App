type ShipDisplayable = {
  name?: string | null;
  localizedName?: string | null;
};

export function getShipDisplayName(ship?: ShipDisplayable | null): string {
  const localizedName = ship?.localizedName?.trim();
  if (localizedName) {
    return localizedName;
  }

  return ship?.name?.trim() || '';
}

export function matchesShipNameQuery(ship: ShipDisplayable | null | undefined, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [ship?.name, ship?.localizedName]
    .filter((value): value is string => Boolean(value?.trim()))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}
