import type { Ship, ShipDetailImage } from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT.replace(/\/+$/, '');
const PUBLIC_IMAGES_BASE_URL = import.meta.env.VITE_PUBLIC_IMAGES_ENDPOINT?.trim().replace(/\/+$/, '') || '';
const IMAGE_BASE_URL = PUBLIC_IMAGES_BASE_URL || API_BASE_URL;
const RSI_BASE_URL = 'https://robertsspaceindustries.com';

function isAbsoluteUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://');
}

function normalizeShipImageSlot(value?: string | null) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    || 'image'
  );
}

function isDetailThumbnailSlot(value?: string | null) {
  return normalizeShipImageSlot(value) === 'thumbnail';
}

function toImageBaseUrl(value: string) {
  const pathname = value.startsWith('/') ? value : `/${value}`;
  const baseUrl = !PUBLIC_IMAGES_BASE_URL && /^\/ships\/\d+\//.test(pathname)
    ? 'https://images.citizenshub.app'
    : IMAGE_BASE_URL;
  return `${baseUrl}${pathname}`;
}

function toRsiAssetUrl(value: string) {
  return `${RSI_BASE_URL}${value.startsWith('/') ? value : `/${value}`}`;
}

export function toApiAssetUrl(value?: string | null, options?: { source?: 'citizenshub' | 'rsi' }) {
  if (!value) return '';
  if (isAbsoluteUrl(value)) return value;
  if (options?.source === 'rsi') {
    return toRsiAssetUrl(value);
  }
  // Dynamic aliases are served by the Worker, never by the R2 image domain.
  if (/^\/?(?:api\/)?ship-images\//.test(value)) {
    const url = new URL(value.startsWith('/') ? value : `/${value}`, 'https://localhost');
    url.searchParams.set('v', '2');
    return `${API_BASE_URL}${url.pathname}${url.search}`;
  }
  return toImageBaseUrl(value);
}

function isShipImageAlias(value: string) {
  const url = new URL(value, 'https://localhost');
  return /^\/(?:api\/)?ship-images\//.test(url.pathname);
}

function resolveShipImage(value?: string | null) {
  // Older API caches may still contain mutable aliases. Use the ship's RSI
  // media below until the refreshed image list contains a versioned R2 object.
  return value && !isShipImageAlias(value) ? toApiAssetUrl(value) : '';
}

function getShipMediaUrl(
  value?: string | null,
  source?: 'citizenshub' | 'rsi',
) {
  return toApiAssetUrl(value, { source });
}

export function getShipThumbSmall(ship?: Ship | null) {
  if (!ship) return '';

  return resolveShipImage(ship.imageUrls?.thumbSmall)
    || getShipMediaUrl(ship.medias?.productThumbMediumAndSmall, ship.medias?.source)
    || getShipMediaUrl(ship.medias?.slideShow, ship.medias?.source);
}

export function getShipThumbLarge(ship?: Ship | null) {
  if (!ship) return '';

  return resolveShipImage(ship.imageUrls?.thumbLarge)
    || resolveShipImage(ship.imageUrls?.slideshow)
    || resolveShipImage(ship.imageUrls?.thumbSmall)
    || getShipMediaUrl(ship.medias?.productThumbMediumAndSmall, ship.medias?.source)
    || getShipMediaUrl(ship.medias?.slideShow, ship.medias?.source);
}

export function getShipSlideshowImage(ship?: Ship | null) {
  if (!ship) return '';

  return resolveShipImage(ship.imageUrls?.slideshow)
    || resolveShipImage(ship.imageUrls?.thumbLarge)
    || getShipMediaUrl(ship.medias?.slideShow, ship.medias?.source)
    || getShipMediaUrl(ship.medias?.productThumbMediumAndSmall, ship.medias?.source);
}

export function getShipBestImage(ship?: Ship | null) {
  return getShipThumbLarge(ship) || getShipThumbSmall(ship) || getShipSlideshowImage(ship);
}

export function getShipDetailImageUrl(
  ship?: Ship | null,
  entry?: ShipDetailImage | null,
  index = 0,
) {
  if (!entry?.url) return '';

  const sourceUrl = entry.sourceUrl || ship?.details?.imageComposer?.[index]?.sourceUrl;
  if (isShipImageAlias(entry.url) && sourceUrl) return toRsiAssetUrlIfRelative(sourceUrl);

  return toApiAssetUrl(entry.url, { source: entry.source });
}

export function getShipDetailThumbnailUrl(ship?: Ship | null) {
  const detailImages = ship?.details?.imageComposer;
  if (!detailImages?.length) {
    return '';
  }

  const detailThumbnailIndex = detailImages.findIndex((entry) => isDetailThumbnailSlot(entry.slot));
  if (detailThumbnailIndex >= 0) {
    return getShipDetailImageUrl(ship, detailImages[detailThumbnailIndex], detailThumbnailIndex);
  }

  return getShipDetailImageUrl(ship, detailImages[0], 0);
}

function toRsiAssetUrlIfRelative(value: string) {
  return isAbsoluteUrl(value) ? value : toRsiAssetUrl(value);
}

export interface ShipImageManifestEntry {
  id: string;
  url: string;
  sourceUrl?: string;
}

/** The API's current image URLs are the manifest; content hashes are versions. */
export function buildShipImageManifest(ships: Ship[]): ShipImageManifestEntry[] {
  return ships.flatMap((ship) => {
    const coverSource = ship.medias?.productThumbMediumAndSmall || ship.medias?.slideShow;
    const slideshowSource = ship.medias?.slideShow || coverSource;
    const entries: ShipImageManifestEntry[] = [
      { id: `${ship.id}:thumb-small`, url: getShipThumbSmall(ship), sourceUrl: coverSource },
      { id: `${ship.id}:thumb-large`, url: getShipThumbLarge(ship), sourceUrl: slideshowSource },
      { id: `${ship.id}:slideshow`, url: getShipSlideshowImage(ship), sourceUrl: slideshowSource },
      ...(ship.details?.imageComposer || []).map((entry, index) => ({
        id: `${ship.id}:detail:${index}`,
        url: getShipDetailImageUrl(ship, entry, index),
        sourceUrl: entry.sourceUrl || (entry.source === 'rsi' ? entry.url : undefined),
      })),
    ];
    return entries.filter((entry) => entry.url).map((entry) => ({
      ...entry,
      sourceUrl: entry.sourceUrl ? toRsiAssetUrlIfRelative(entry.sourceUrl) : undefined,
    }));
  });
}
