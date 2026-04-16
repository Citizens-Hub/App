import { ListingItem, Ship } from '@/types';
import { getMarketItemVisual } from '@/components/marketItemDisplay';

export function getAvailableStock(item: ListingItem) {
  return Math.max(item.stock - item.lockedStock, 0);
}

export function findShip(ships: Ship[], shipId?: number, shipName?: string) {
  if (shipId) {
    const byId = ships.find((ship) => ship.id === shipId);
    if (byId) return byId;
  }

  if (!shipName) return undefined;

  const normalized = shipName.trim().toLowerCase();
  return ships.find((ship) => ship.name.trim().toLowerCase() === normalized);
}

export function isStandaloneShipPackage(item: ListingItem) {
  return item.itemType === 'package' && item.packageKind === 'standalone_ship';
}

export function isBundlePackage(item: ListingItem) {
  return item.itemType === 'package' && item.packageKind === 'bundle';
}

export function getPackageMsrp(item: ListingItem, ships: Ship[]) {
  if (item.itemType !== 'package') return 0;

  const packageShips = item.packageShips || [];
  if (packageShips.length > 0) {
    return packageShips.reduce((sum, packageShip) => {
      const ship = findShip(ships, packageShip.shipId, packageShip.shipName);
      return sum + (ship?.msrp || 0);
    }, 0) / 100;
  }

  const ship = findShip(ships, item.shipId, item.shipName);
  return (ship?.msrp || 0) / 100;
}

export function getListingBasePrice(item: ListingItem, ships: Ship[]) {
  if (item.itemType === 'ccu') {
    const visual = getMarketItemVisual(item, ships);
    if (visual.fromShip && visual.toShip) {
      return (visual.toShip.msrp - visual.fromShip.msrp) / 100;
    }
  }

  if (item.itemType === 'package') {
    return getPackageMsrp(item, ships);
  }

  return 0;
}

export function getListingDiscountPercent(item: ListingItem, ships: Ship[]) {
  const basePrice = getListingBasePrice(item, ships);

  if (basePrice > item.price) {
    return ((basePrice - item.price) / basePrice * 100).toFixed(2);
  }

  return null;
}

export function getListingSearchText(item: ListingItem, ships: Ship[]) {
  const visual = getMarketItemVisual(item, ships);

  return [
    item.name,
    visual.fromShipName,
    visual.toShipName,
    visual.shipName,
    item.packageKind,
    item.insuranceType,
    item.description,
    item.externalRef,
    item.sourceKind,
    ...(item.packageShips || []).map((ship) => ship.shipName),
    ...(item.packageItems || []).reduce<string[]>((acc, entry) => {
      acc.push(entry.itemName);
      if (entry.itemKind) acc.push(entry.itemKind);
      return acc;
    }, []),
  ].filter(Boolean).join(' ').toLowerCase();
}
