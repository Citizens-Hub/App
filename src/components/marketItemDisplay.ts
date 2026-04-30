import { ListingItem, MarketCartItem, MarketItemType, Resource, Ship } from '@/types';
import { getShipThumbLarge, toApiAssetUrl } from '@/utils/shipImage';

type MarketDisplayItem = {
  skuId?: string;
  name: string;
  itemType: MarketItemType;
  fromShipId?: number;
  toShipId?: number;
  shipId?: number;
  fromShipName?: string;
  toShipName?: string;
  shipName?: string;
  packageKind?: string;
  insuranceType?: string;
  imageUrl?: string;
  fromImageUrl?: string;
  toImageUrl?: string;
  description?: string;
  externalRef?: string;
  creditAmount?: number;
  discountRateBps?: number;
  sellerCount?: number;
  creditOptions?: Array<{
    amount: number;
    price: number;
    discountRateBps: number;
    sellerCount: number;
  }>;
};

export const MARKET_ITEM_PLACEHOLDER = '/imgs/credit.webp';

export function toLargeRsiImage(url?: string) {
  if (!url) return '';
  if (url.includes('/api/ship-images/') || url.includes('/ship-images/')) {
    return toApiAssetUrl(url);
  }
  return toApiAssetUrl(url.replace('subscribers_vault_thumbnail', 'product_thumb_large'));
}

export function getShipById(ships: Ship[] | undefined, shipId?: number) {
  if (!shipId) return undefined;
  return ships?.find((ship) => ship.id === shipId);
}

export function getMarketItemVisual(item: MarketDisplayItem, ships?: Ship[]) {
  const fromShip = getShipById(ships, item.fromShipId);
  const toShip = getShipById(ships, item.toShipId);
  const ship = getShipById(ships, item.shipId);

  const fromShipName = item.fromShipName || fromShip?.name || '';
  const toShipName = item.toShipName || toShip?.name || '';
  const shipName = item.shipName || ship?.name || '';

  const fromImage = toLargeRsiImage(item.fromImageUrl) || getShipThumbLarge(fromShip) || '';
  const toImage = toLargeRsiImage(item.toImageUrl) || getShipThumbLarge(toShip) || '';
  const primaryImage = toLargeRsiImage(item.imageUrl) || getShipThumbLarge(ship) || '';
  const thumbnail = item.itemType === 'ccu'
    ? toImage || fromImage || primaryImage
    : primaryImage || toImage || fromImage;

  return {
    isCCU: item.itemType === 'ccu',
    thumbnail,
    fromImage,
    toImage,
    primaryImage,
    fromShip,
    toShip,
    ship,
    fromShipName,
    toShipName,
    shipName,
  };
}

export function buildMarketResource(item: ListingItem, ships?: Ship[]): Resource {
  const visual = getMarketItemVisual(item, ships);
  const availableStock = item.stock - item.lockedStock;
  const effectiveAvailableStock = item.itemType === 'credit' ? Number.MAX_SAFE_INTEGER : availableStock;
  const primaryImage = visual.thumbnail || MARKET_ITEM_PLACEHOLDER;

  return {
    id: item.skuId,
    name: item.name,
    title: item.name,
    subtitle: item.itemType,
    excerpt: item.description || '',
    type: item.itemType,
    itemType: item.itemType,
    fromShipId: item.fromShipId,
    toShipId: item.toShipId,
    shipId: item.shipId,
    fromShipName: visual.fromShipName || undefined,
    toShipName: visual.toShipName || undefined,
    shipName: visual.shipName || undefined,
    packageKind: item.packageKind,
    insuranceType: item.insuranceType,
    imageUrl: visual.primaryImage || primaryImage,
    fromImageUrl: visual.fromImage || undefined,
    toImageUrl: visual.toImage || undefined,
    description: item.description,
    externalRef: item.externalRef,
    creditAmount: item.creditAmount,
    discountRateBps: item.discountRateBps,
    sellerCount: item.sellerCount,
    creditOptions: item.creditOptions,
    marketAvailableStock: effectiveAvailableStock,
    media: {
      thumbnail: {
        storeSmall: primaryImage,
      },
      list: item.itemType === 'ccu'
        ? [
            { slideshow: visual.fromImage || MARKET_ITEM_PLACEHOLDER },
            { slideshow: visual.toImage || MARKET_ITEM_PLACEHOLDER },
          ]
        : [
            { slideshow: primaryImage },
          ],
    },
    nativePrice: {
      amount: Math.round(item.price * 100),
      discounted: 0,
      taxDescription: [],
    },
    stock: {
      available: item.itemType === 'credit' ? true : availableStock > 0,
      level: item.itemType === 'credit' ? 'high' : availableStock > 5 ? 'high' : availableStock > 0 ? 'low' : 'none',
    },
    isPackage: item.itemType === 'package',
  };
}

export function buildMarketCartItem(
  item: MarketDisplayItem & { price?: number },
  quantity: number,
  ships?: Ship[],
): MarketCartItem {
  const visual = getMarketItemVisual(item, ships);
  const primaryImage = visual.thumbnail || MARKET_ITEM_PLACEHOLDER;

  return {
    skuId: item.skuId || item.name,
    quantity,
    itemType: item.itemType,
    fromShipId: item.fromShipId,
    toShipId: item.toShipId,
    shipId: item.shipId,
    fromShipName: visual.fromShipName || undefined,
    toShipName: visual.toShipName || undefined,
    shipName: visual.shipName || undefined,
    packageKind: item.packageKind,
    insuranceType: item.insuranceType,
    imageUrl: visual.primaryImage || primaryImage,
    fromImageUrl: visual.fromImage || undefined,
    toImageUrl: visual.toImage || undefined,
    description: item.description,
    externalRef: item.externalRef,
    creditAmount: item.creditAmount,
    discountRateBps: item.discountRateBps,
    sellerCount: item.sellerCount,
    creditOptions: item.creditOptions,
    name: item.name,
    price: item.price,
    discounted: 0,
    media: {
      thumbnail: {
        storeSmall: primaryImage,
      },
      list: item.itemType === 'ccu'
        ? [
            { slideshow: visual.fromImage || MARKET_ITEM_PLACEHOLDER },
            { slideshow: visual.toImage || MARKET_ITEM_PLACEHOLDER },
          ]
        : [
            { slideshow: primaryImage },
          ],
    },
  };
}

export function buildMarketCartItemFromResource(resource: Resource, quantity: number): MarketCartItem {
  const itemType = normalizeMarketItemType(resource.itemType || resource.subtitle);
  const thumbnail = toLargeRsiImage(resource.media?.thumbnail?.storeSmall) || toLargeRsiImage(resource.imageUrl) || MARKET_ITEM_PLACEHOLDER;
  const fromImage = toLargeRsiImage(resource.fromImageUrl) || toLargeRsiImage(resource.media?.list?.[0]?.slideshow) || '';
  const toImage = toLargeRsiImage(resource.toImageUrl) || toLargeRsiImage(resource.media?.list?.[1]?.slideshow) || '';

  return {
    skuId: resource.id,
    quantity,
    itemType,
    fromShipId: resource.fromShipId,
    toShipId: resource.toShipId,
    shipId: resource.shipId,
    fromShipName: resource.fromShipName,
    toShipName: resource.toShipName,
    shipName: resource.shipName,
    packageKind: resource.packageKind,
    insuranceType: resource.insuranceType,
    imageUrl: toLargeRsiImage(resource.imageUrl) || thumbnail,
    fromImageUrl: fromImage || undefined,
    toImageUrl: toImage || undefined,
    description: resource.description,
    externalRef: resource.externalRef,
    creditAmount: resource.creditAmount,
    discountRateBps: resource.discountRateBps,
    sellerCount: resource.sellerCount,
    creditOptions: resource.creditOptions,
    name: resource.name || resource.id,
    price: (resource.nativePrice?.amount || 0) / 100,
    discounted: resource.nativePrice?.discounted ? (resource.nativePrice.discounted / 100) : 0,
    media: resource.media,
  };
}

function normalizeMarketItemType(value?: string): MarketItemType {
  if (value === 'ccu' || value === 'package' || value === 'misc' || value === 'credit') {
    return value;
  }

  return value === 'ship' ? 'package' : 'misc';
}
