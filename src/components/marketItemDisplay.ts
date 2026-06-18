import { ListingItem, MarketBrowseCategory, MarketCartItem, MarketItemType, MarketSkuTagCode, PromotionPriceInfo, Resource, Ship } from '@/types';
import {
  getMarketImageAssetUrl,
  getMarketImageDisplayUrl,
  MarketImageDisplayVariant,
  resolveMarketImageUrls,
} from '@/utils/marketImages';
import { getShipSlideshowImage, getShipThumbLarge } from '@/utils/shipImage';

type MarketDisplayItem = {
  skuId?: string;
  name: string;
  itemType: MarketItemType;
  browseCategory?: MarketBrowseCategory;
  tags?: MarketSkuTagCode[];
  fromShipId?: number;
  toShipId?: number;
  shipId?: number;
  fromShipName?: string;
  toShipName?: string;
  shipName?: string;
  fromShipManufacturerId?: number;
  toShipManufacturerId?: number;
  shipManufacturerId?: number;
  packageKind?: string;
  insuranceType?: string;
  sourceKind?: string | null;
  imageUrl?: string;
  imageUrls?: string[];
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
  promotion?: PromotionPriceInfo | null;
};

export const MARKET_ITEM_PLACEHOLDER = '/imgs/credit.webp';

type MarketVisualOptions = {
  imageVariant?: MarketImageDisplayVariant;
};

function upgradeToLargeImageVariant(url: string) {
  return url
    .replace('/thumb-small', '/thumb-large')
    .replace('product_thumb_medium_and_small', 'product_thumb_large')
    .replace('subscribers_vault_thumbnail', 'product_thumb_large');
}

export function toLargeRsiImage(url?: string) {
  const normalizedUrl = url?.trim();
  if (!normalizedUrl) return '';
  return getMarketImageAssetUrl(upgradeToLargeImageVariant(normalizedUrl));
}

function getCatalogShipImage(ship: Ship | undefined, variant: MarketImageDisplayVariant) {
  if (!ship) {
    return '';
  }

  return variant === 'thumbLarge'
    ? getShipThumbLarge(ship) || getShipSlideshowImage(ship)
    : getShipSlideshowImage(ship) || getShipThumbLarge(ship);
}

function normalizeShipName(value?: string) {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
}

function parseCcuPairFromDisplayName(value?: string) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) return null;

  const match = normalizedValue.match(/^\s*Upgrade\s*-\s*(.+?)\s+to\s+(.+?)\s*$/i);
  if (!match) return null;

  const fromShipName = match[1]?.trim();
  const toShipName = match[2]?.trim();
  if (!fromShipName || !toShipName) return null;

  return { fromShipName, toShipName };
}

export function getShipById(ships: Ship[] | undefined, shipId?: number, shipName?: string) {
  if (!ships?.length) return undefined;

  if (shipId) {
    const matchedShip = ships.find((ship) => ship.id === shipId);
    if (matchedShip) {
      return matchedShip;
    }
  }

  const normalizedShipName = normalizeShipName(shipName);
  if (!normalizedShipName) return undefined;

  return ships.find((ship) => [
    ship.localizedName,
    ship.name,
    ship.alias,
  ].some((candidate) => normalizeShipName(candidate) === normalizedShipName));
}

export function getMarketItemVisual(item: MarketDisplayItem, ships?: Ship[], options?: MarketVisualOptions) {
  const imageVariant = options?.imageVariant || 'slideshow';
  const parsedCcuPair = item.itemType === 'ccu' ? parseCcuPairFromDisplayName(item.name) : null;
  const resolvedFromShipName = item.fromShipName || parsedCcuPair?.fromShipName;
  const resolvedToShipName = item.toShipName || parsedCcuPair?.toShipName;
  const fromShip = getShipById(ships, item.fromShipId, resolvedFromShipName);
  const toShip = getShipById(ships, item.toShipId, resolvedToShipName);
  const ship = getShipById(ships, item.shipId, item.shipName);

  const fromShipName = resolvedFromShipName || fromShip?.name || '';
  const toShipName = resolvedToShipName || toShip?.name || '';
  const shipName = item.shipName || ship?.name || '';

  const manualImages = resolveMarketImageUrls(item.imageUrl, item.imageUrls)
    .map((imageUrl) => getMarketImageDisplayUrl(upgradeToLargeImageVariant(imageUrl), {
      ships,
      variant: imageVariant,
    }))
    .filter(Boolean);
  const fromImage = getCatalogShipImage(fromShip, imageVariant)
    || getMarketImageDisplayUrl(upgradeToLargeImageVariant(item.fromImageUrl || ''), { ships, variant: imageVariant })
    || '';
  const toImage = getCatalogShipImage(toShip, imageVariant)
    || getMarketImageDisplayUrl(upgradeToLargeImageVariant(item.toImageUrl || ''), { ships, variant: imageVariant })
    || '';
  const shipImage = getCatalogShipImage(ship, imageVariant);
  const primaryImage = item.itemType === 'ccu'
    ? shipImage || manualImages[0] || ''
    : manualImages[0] || shipImage || '';
  const thumbnail = item.itemType === 'ccu'
    ? toImage || fromImage || primaryImage
    : primaryImage || toImage || fromImage;
  const carouselImages = item.itemType === 'ccu'
    ? [fromImage, toImage].filter(Boolean)
    : (manualImages.length > 0 ? manualImages : [primaryImage].filter(Boolean));

  return {
    isCCU: item.itemType === 'ccu',
    thumbnail,
    fromImage,
    toImage,
    primaryImage,
    carouselImages,
    fromShip,
    toShip,
    ship,
    fromShipName,
    toShipName,
    shipName,
  };
}

export function isOcShipListing(item?: Pick<MarketDisplayItem, 'itemType' | 'browseCategory' | 'tags'> | null) {
  if (!item?.tags?.includes('oc')) {
    return false;
  }

  return item.itemType === 'ccu'
    || item.browseCategory === 'standalone_ship'
    || item.browseCategory === 'ship_package';
}

export function isConciergeListing(item?: Pick<MarketDisplayItem, 'tags'> | null) {
  return Boolean(item?.tags?.includes('concierge'));
}

export function isSubscriberStoreListing(item?: Pick<MarketDisplayItem, 'browseCategory'> | null) {
  return item?.browseCategory === 'subscriber_store';
}

export function isLtiShipListing(item?: Pick<MarketDisplayItem, 'itemType' | 'browseCategory' | 'insuranceType'> | null) {
  const insuranceType = item?.insuranceType?.trim();
  if (!insuranceType || !/(?:\blti\b|lifetime\s+insurance)/i.test(insuranceType)) {
    return false;
  }

  return item?.itemType === 'package'
    || item?.browseCategory === 'standalone_ship'
    || item?.browseCategory === 'ship_package';
}

export function resolveMarketImageBadgeKind(
  item?: Pick<MarketDisplayItem, 'itemType' | 'browseCategory' | 'tags' | 'insuranceType'> | null,
): 'oc' | 'concierge' | 'lti' | 'subscriber_store' | null {
  if (isSubscriberStoreListing(item)) {
    return 'subscriber_store';
  }

  if (isOcShipListing(item)) {
    return 'oc';
  }

  if (isConciergeListing(item)) {
    return 'concierge';
  }

  if (isLtiShipListing(item)) {
    return 'lti';
  }

  return null;
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
    browseCategory: item.browseCategory,
    tags: item.tags,
    sourceKind: item.sourceKind || null,
    fromShipId: item.fromShipId,
    toShipId: item.toShipId,
    shipId: item.shipId,
    fromShipName: visual.fromShipName || undefined,
    toShipName: visual.toShipName || undefined,
    shipName: visual.shipName || undefined,
    fromShipManufacturerId: item.fromShipManufacturerId,
    toShipManufacturerId: item.toShipManufacturerId,
    shipManufacturerId: item.shipManufacturerId,
    packageKind: item.packageKind,
    insuranceType: item.insuranceType,
    imageUrl: visual.primaryImage || primaryImage,
    imageUrls: item.imageUrls,
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
        : (visual.carouselImages.length > 0 ? visual.carouselImages : [primaryImage])
            .map((slideshow) => ({ slideshow })),
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
    promotion: item.promotion || null,
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
    browseCategory: item.browseCategory,
    tags: item.tags,
    sourceKind: item.sourceKind || null,
    fromShipId: item.fromShipId,
    toShipId: item.toShipId,
    shipId: item.shipId,
    fromShipName: visual.fromShipName || undefined,
    toShipName: visual.toShipName || undefined,
    shipName: visual.shipName || undefined,
    fromShipManufacturerId: item.fromShipManufacturerId,
    toShipManufacturerId: item.toShipManufacturerId,
    shipManufacturerId: item.shipManufacturerId,
    packageKind: item.packageKind,
    insuranceType: item.insuranceType,
    imageUrl: visual.primaryImage || primaryImage,
    imageUrls: item.imageUrls,
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
    promotion: item.promotion || null,
    media: {
      thumbnail: {
        storeSmall: primaryImage,
      },
      list: item.itemType === 'ccu'
        ? [
            { slideshow: visual.fromImage || MARKET_ITEM_PLACEHOLDER },
            { slideshow: visual.toImage || MARKET_ITEM_PLACEHOLDER },
          ]
        : (visual.carouselImages.length > 0 ? visual.carouselImages : [primaryImage])
            .map((slideshow) => ({ slideshow })),
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
    browseCategory: resource.browseCategory,
    tags: resource.tags,
    sourceKind: resource.sourceKind || null,
    fromShipId: resource.fromShipId,
    toShipId: resource.toShipId,
    shipId: resource.shipId,
    fromShipName: resource.fromShipName,
    toShipName: resource.toShipName,
    shipName: resource.shipName,
    fromShipManufacturerId: resource.fromShipManufacturerId,
    toShipManufacturerId: resource.toShipManufacturerId,
    shipManufacturerId: resource.shipManufacturerId,
    packageKind: resource.packageKind,
    insuranceType: resource.insuranceType,
    imageUrl: toLargeRsiImage(resource.imageUrl) || thumbnail,
    imageUrls: resource.imageUrls,
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
    promotion: resource.promotion || null,
    media: resource.media,
  };
}

function normalizeMarketItemType(value?: string): MarketItemType {
  if (value === 'ccu' || value === 'package' || value === 'misc' || value === 'credit') {
    return value;
  }

  return value === 'ship' ? 'package' : 'misc';
}
