import { ListingItem, MarketItemVariant, Ship } from '@/types';
import { getMarketItemVisual } from '@/components/marketItemDisplay';

const PRICE_EPSILON = 0.004;

export function getAvailableStock(item: ListingItem) {
  return Math.max(item.stock - item.lockedStock, 0);
}

function getAvailableVariantStock(item: MarketItemVariant) {
  return Math.max(item.stock - item.lockedStock, 0);
}

export function resolveLowestCcuVariant(item: ListingItem): ListingItem | null {
  if (item.itemType !== 'ccu') {
    return item;
  }

  const variants = item.variants?.length
    ? item.variants
    : [{
        skuId: item.skuId,
        name: item.name,
        price: item.price,
        cost: item.cost,
        itemType: 'ccu' as const,
        stock: item.stock,
        lockedStock: item.lockedStock,
        sourceKind: item.sourceKind,
        visibleInMarket: item.visibleInMarket,
        belongsTo: item.belongsTo,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt,
        fromShipId: item.fromShipId,
        toShipId: item.toShipId,
        fromShipName: item.fromShipName,
        toShipName: item.toShipName,
        fromShipManufacturerId: item.fromShipManufacturerId,
        toShipManufacturerId: item.toShipManufacturerId,
        toSkuId: item.toSkuId,
        imageUrl: item.imageUrl,
        imageUrls: item.imageUrls,
        fromImageUrl: item.fromImageUrl,
        toImageUrl: item.toImageUrl,
        seller: item.seller,
      }];
  const availableVariants = variants.filter((variant) => getAvailableVariantStock(variant) > 0);
  const candidates = availableVariants.length ? availableVariants : variants;
  const selectedVariant = [...candidates].sort((left, right) => {
    if (left.price !== right.price) {
      return left.price - right.price;
    }

    const leftCost = typeof left.cost === 'number' ? left.cost : Number.POSITIVE_INFINITY;
    const rightCost = typeof right.cost === 'number' ? right.cost : Number.POSITIVE_INFINITY;
    if (leftCost !== rightCost) {
      return leftCost - rightCost;
    }

    const stockDiff = getAvailableVariantStock(right) - getAvailableVariantStock(left);
    if (stockDiff !== 0) {
      return stockDiff;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  })[0];

  if (!selectedVariant) {
    return null;
  }

  return {
    ...item,
    ...selectedVariant,
    name: item.name,
    variantCount: item.variantCount,
    variants: item.variants,
  };
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
  return item.browseCategory === 'standalone_ship';
}

export function isBundlePackage(item: ListingItem) {
  return item.browseCategory === 'ship_package';
}

export function isPaintListing(item: ListingItem) {
  return item.browseCategory === 'paint';
}

export function isOtherListing(item: ListingItem) {
  return item.browseCategory === 'other';
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

export function getListingMsrpPrice(item: ListingItem, ships: Ship[]) {
  if (item.itemType === 'ccu') {
    const visual = getMarketItemVisual(item, ships);
    if (visual.fromShip && visual.toShip) {
      return (visual.toShip.msrp - visual.fromShip.msrp) / 100;
    }
  }

  if (item.itemType === 'package') {
    return getPackageMsrp(item, ships);
  }

  if (item.itemType === 'credit') {
    return item.creditAmount || item.creditOptions?.[0]?.amount || 0;
  }

  return 0;
}

export type ListingReferencePriceKind = 'market' | 'msrp';

export interface ListingPriceDisplay {
  currentPrice: number;
  marketPrice: number;
  msrpPrice: number;
  officialSavingsAmount: number;
  promotionDiscountPercent: string | null;
  referencePrice: number;
  referenceKind: ListingReferencePriceKind | null;
  discountReferencePrice: number;
  discountPercent: string | null;
  showMsrpReference: boolean;
}

export function getListingPriceDisplay(
  item: ListingItem,
  ships: Ship[],
  options?: {
    currentPrice?: number;
    originalPrice?: number | null;
    msrpItem?: ListingItem | null;
  },
): ListingPriceDisplay {
  const currentPrice = options?.currentPrice ?? item.price;
  const rawMarketPrice = options?.originalPrice ?? item.promotion?.originalPrice ?? 0;
  const marketPrice = rawMarketPrice > currentPrice + PRICE_EPSILON ? rawMarketPrice : 0;
  const msrpSourceItem = options?.msrpItem || item;
  const msrpPrice = getListingMsrpPrice(msrpSourceItem, ships);
  const msrpReferencePrice = msrpPrice > currentPrice + PRICE_EPSILON ? msrpPrice : 0;
  const referencePrice = marketPrice || msrpReferencePrice;
  const referenceKind = marketPrice
    ? 'market'
    : (msrpReferencePrice ? 'msrp' : null);
  const officialSavingsAmount = msrpReferencePrice ? msrpPrice - currentPrice : 0;
  const promotionDiscountPercent = marketPrice > currentPrice + PRICE_EPSILON
    ? ((marketPrice - currentPrice) / marketPrice * 100).toFixed(2)
    : null;

  return {
    currentPrice,
    marketPrice,
    msrpPrice,
    officialSavingsAmount,
    promotionDiscountPercent,
    referencePrice,
    referenceKind,
    discountReferencePrice: marketPrice,
    discountPercent: promotionDiscountPercent,
    showMsrpReference: Boolean(msrpReferencePrice),
  };
}

export function getListingBasePrice(item: ListingItem, ships: Ship[]) {
  return getListingPriceDisplay(item, ships).referencePrice;
}

export function getListingDiscountPercent(item: ListingItem, ships: Ship[]) {
  return getListingPriceDisplay(item, ships).discountPercent;
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
    item.creditAmount ? String(item.creditAmount) : null,
    item.discountRateBps ? String(item.discountRateBps) : null,
    item.sellerCount ? String(item.sellerCount) : null,
    ...(item.creditOptions || []).map((option) => String(option.amount)),
    ...(item.packageShips || []).map((ship) => ship.shipName),
    ...(item.packageItems || []).reduce<string[]>((acc, entry) => {
      acc.push(entry.itemName);
      if (entry.itemKind) acc.push(entry.itemKind);
      return acc;
    }, []),
  ].filter(Boolean).join(' ').toLowerCase();
}
