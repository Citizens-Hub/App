import { ListingItem, MarketPackageItem, MarketPackageShip, MarketSkuTagCode, Ship } from '@/types';
import { BundleItem, CCUItem, ShipItem, UserInfo } from '@/store/upgradesStore';
import { getShipThumbLarge } from '@/utils/shipImage';
import { resolveStoredCcuShip } from '@/utils/shipDisplay';

export type StoreInventoryType = 'ccu' | 'standalone_ship' | 'bundle';
export type StoreListingDisplayType = StoreInventoryType | 'ship_package' | 'paint' | 'other' | 'credit';

export interface StoreInventoryItem {
  sourceKey: string;
  itemType: 'ccu' | 'package';
  displayType: StoreInventoryType;
  browseCategory?: 'standalone_ship' | 'ship_package' | 'paint' | 'other';
  tags?: MarketSkuTagCode[];
  name: string;
  price: number;
  cost?: number;
  stock: number;
  canGift: boolean;
  isBuyBack: boolean;
  fromShipId?: number;
  toShipId?: number;
  shipId?: number;
  fromShipName?: string;
  toShipName?: string;
  shipName?: string;
  fromMsrp?: number;
  toMsrp?: number;
  packageKind?: 'standalone_ship' | 'bundle';
  insuranceType?: string;
  packageShips?: MarketPackageShip[];
  packageItems?: MarketPackageItem[];
  imageUrl?: string;
  description?: string;
  ownerLabels: string[];
  quantityByOwner: Array<{ id: number; name: string; quantity: number }>;
}

interface BuildInventoryItemsArgs {
  ccus: CCUItem[];
  ships: ShipItem[];
  bundles: BundleItem[];
  marketShips: Ship[];
  users: UserInfo[];
  allItemPrices: Record<string, number>;
}

export function buildInventoryItems(args: BuildInventoryItemsArgs): StoreInventoryItem[] {
  const { ccus, ships, bundles, marketShips, users, allItemPrices } = args;

  const ccuGroups = new Map<string, StoreInventoryItem>();

  ccus
    .forEach((item) => {
      const fromShip = resolveStoredCcuShip(marketShips, item.parsed, 'from');
      const toShip = resolveStoredCcuShip(marketShips, item.parsed, 'to');
      if (!fromShip || !toShip) return;

      const key = `ccu:${fromShip.id}:${toShip.id}:${item.canGift ? 1 : 0}:${item.isBuyBack ? 1 : 0}`;
      const ownerName = users.find((user) => user.id === item.belongsTo)?.nickname || `User ${item.belongsTo}`;
      const customPriceKey = `${item.name}-${fromShip.id}-${toShip.id}`;
      const resolvedPrice = allItemPrices[customPriceKey] ?? item.value;
      const quantity = item.quantity || 1;
      const existing = ccuGroups.get(key);

      if (existing) {
        existing.stock += quantity;
        const owner = existing.quantityByOwner.find((entry) => entry.id === item.belongsTo);
        if (owner) {
          owner.quantity += quantity;
        } else {
          existing.quantityByOwner.push({ id: item.belongsTo, name: ownerName, quantity });
          existing.ownerLabels.push(ownerName);
        }
        return;
      }

      ccuGroups.set(key, {
        sourceKey: key,
        itemType: 'ccu',
        displayType: 'ccu',
        name: item.name,
        price: resolvedPrice,
        cost: item.value,
        stock: quantity,
        canGift: item.canGift,
        isBuyBack: item.isBuyBack,
        fromShipId: fromShip.id,
        toShipId: toShip.id,
        fromShipName: fromShip.name,
        toShipName: toShip.name,
        fromMsrp: fromShip.msrp || 0,
        toMsrp: toShip.msrp || 0,
        imageUrl: getShipThumbLarge(toShip) || getShipThumbLarge(fromShip),
        ownerLabels: [ownerName],
        quantityByOwner: [{ id: item.belongsTo, name: ownerName, quantity }],
      });
    });

  const standaloneShips = ships
    .map<StoreInventoryItem | null>((item) => {
      const shipInfo = marketShips.find((ship) => ship.id === item.id || normalizeName(ship.name) === normalizeName(item.name));
      if (!shipInfo) return null;

      const ownerName = users.find((user) => user.id === item.belongsTo)?.nickname || `User ${item.belongsTo}`;
      const quantity = item.quantity || 1;

      return {
        sourceKey: `package:ship:${item.belongsTo}:${item.pageId || item.id}:${shipInfo.id}:${item.canGift ? 1 : 0}:${item.isBuyBack ? 1 : 0}`,
        itemType: 'package',
        displayType: 'standalone_ship',
        name: item.name,
        price: item.value,
        cost: item.value,
        stock: quantity,
        canGift: item.canGift,
        isBuyBack: item.isBuyBack,
        shipId: shipInfo.id,
        shipName: shipInfo.name,
        packageKind: 'standalone_ship',
        insuranceType: item.insurance,
        packageShips: [{ shipId: shipInfo.id, shipName: shipInfo.name, sortOrder: 1 }],
        imageUrl: getShipThumbLarge(shipInfo),
        ownerLabels: [ownerName],
        quantityByOwner: [{ id: item.belongsTo, name: ownerName, quantity }],
        fromMsrp: shipInfo.msrp || 0,
        toMsrp: shipInfo.msrp || 0,
      };
    })
    .filter((item): item is StoreInventoryItem => item !== null);

  const bundleItems = bundles
    .map<StoreInventoryItem>((item) => {
      const bundleShips = (item.ships || [])
        .map((bundleShip, index) => {
          const shipInfo = marketShips.find((ship) => (
            (bundleShip.id && ship.id === bundleShip.id) ||
            (bundleShip.name && normalizeName(ship.name) === normalizeName(bundleShip.name))
          ));

          return {
            shipId: shipInfo?.id,
            shipName: shipInfo?.name || bundleShip.name || `Ship ${index + 1}`,
            sortOrder: index + 1,
          };
        })
        .filter((ship) => ship.shipName);

      const bundleOthers = (item.others || []).map((other, index) => ({
        itemName: other.name,
        itemKind: other.type,
        imageUrl: other.image,
        withImage: other.withImage,
        sortOrder: index + 1,
      }));

      const ownerName = users.find((user) => user.id === item.belongsTo)?.nickname || `User ${item.belongsTo}`;
      const primaryShip = bundleShips[0];
      const primaryShipInfo = primaryShip?.shipId ? marketShips.find((ship) => ship.id === primaryShip.shipId) : undefined;
      const totalMsrp = bundleShips.reduce((sum, ship) => {
        const shipInfo = ship.shipId ? marketShips.find((candidate) => candidate.id === ship.shipId) : undefined;
        return sum + (shipInfo?.msrp || 0);
      }, 0);
      const quantity = item.quantity || 1;

      return {
        sourceKey: `package:bundle:${item.belongsTo}:${item.pageId || item.name}:${item.canGift ? 1 : 0}:${item.isBuyBack ? 1 : 0}`,
        itemType: 'package',
        displayType: 'bundle',
        name: item.name,
        price: item.value,
        cost: item.value,
        stock: quantity,
        canGift: item.canGift,
        isBuyBack: item.isBuyBack,
        shipId: primaryShip?.shipId,
        shipName: primaryShip?.shipName,
        packageKind: 'bundle',
        insuranceType: item.insurance,
        packageShips: bundleShips,
        packageItems: bundleOthers,
        imageUrl: getShipThumbLarge(primaryShipInfo) || bundleOthers.find((entry) => entry.imageUrl)?.imageUrl,
        ownerLabels: [ownerName],
        quantityByOwner: [{ id: item.belongsTo, name: ownerName, quantity }],
        fromMsrp: totalMsrp,
        toMsrp: totalMsrp,
        description: bundleOthers.map((entry) => entry.itemName).join(' / ') || undefined,
      };
    });

  return [
    ...Array.from(ccuGroups.values()),
    ...standaloneShips,
    ...bundleItems,
  ].sort((a, b) => {
    const priority = {
      ccu: 0,
      standalone_ship: 1,
      bundle: 2,
    };

    if (priority[a.displayType] !== priority[b.displayType]) {
      return priority[a.displayType] - priority[b.displayType];
    }

    if (a.isBuyBack !== b.isBuyBack) {
      return a.isBuyBack ? 1 : -1;
    }

    if (a.canGift !== b.canGift) {
      return a.canGift ? -1 : 1;
    }

    return b.price - a.price;
  });
}

export function getInventorySearchText(item: StoreInventoryItem) {
  return [
    item.name,
    item.fromShipName,
    item.toShipName,
    item.shipName,
    item.insuranceType,
    item.packageKind,
    ...item.ownerLabels,
    ...(item.packageShips || []).map((ship) => ship.shipName),
    ...(item.packageItems || []).map((entry) => entry.itemName),
    item.description,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function getListingDisplayType(item: ListingItem): StoreListingDisplayType {
  if (item.itemType === 'ccu') {
    return 'ccu';
  }

  if (item.itemType === 'credit') {
    return 'credit';
  }

  if (item.browseCategory === 'standalone_ship') {
    return 'standalone_ship';
  }

  if (item.browseCategory === 'ship_package') {
    return 'ship_package';
  }

  if (item.browseCategory === 'paint') {
    return 'paint';
  }

  return 'other';
}

export function getListingSearchText(item: ListingItem) {
  return [
    item.name,
    item.fromShipName,
    item.toShipName,
    item.shipName,
    item.insuranceType,
    item.packageKind,
    item.description,
    item.externalRef,
    item.sourceKind,
    ...(item.packageShips || []).map((ship) => ship.shipName),
    ...(item.packageItems || []).map((entry) => entry.itemName),
  ].filter(Boolean).join(' ').toLowerCase();
}

function normalizeName(name?: string) {
  return (name || '').trim().toUpperCase();
}
