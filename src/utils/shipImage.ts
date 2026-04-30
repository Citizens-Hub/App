import type { Ship, ShipDetailImage } from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT.replace(/\/+$/, '');
const PUBLIC_IMAGES_BASE_URL = import.meta.env.VITE_PUBLIC_IMAGES_ENDPOINT?.trim().replace(/\/+$/, '') || '';
const HAS_PUBLIC_IMAGES_ENDPOINT = Boolean(PUBLIC_IMAGES_BASE_URL);
const IMAGE_BASE_URL = HAS_PUBLIC_IMAGES_ENDPOINT ? PUBLIC_IMAGES_BASE_URL : API_BASE_URL;
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
  return `${IMAGE_BASE_URL}${value.startsWith('/') ? value : `/${value}`}`;
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
  return toImageBaseUrl(value);
}

function getWorkerShipImageUrl(
  shipId: number,
  variant: 'thumb-small' | 'thumb-large' | 'slideshow',
) {
  return `${API_BASE_URL}/ship-images/${shipId}/${variant}`;
}

function getWorkerShipDetailImageUrl(
  shipId: number,
  entry: Pick<ShipDetailImage, 'slot'> | null | undefined,
  index: number,
) {
  return `${API_BASE_URL}/ship-images/${shipId}/detail/${normalizeShipImageSlot(entry?.slot)}/${index + 1}`;
}

function getShipMediaUrl(
  value?: string | null,
  source?: 'citizenshub' | 'rsi',
) {
  return toApiAssetUrl(value, { source });
}

export function getShipThumbSmall(ship?: Ship | null) {
  if (!ship) return '';
  if (!HAS_PUBLIC_IMAGES_ENDPOINT && ship.id > 0) {
    return getWorkerShipImageUrl(ship.id, 'thumb-small');
  }

  return (
    ship?.imageUrls?.thumbSmall
    ? toApiAssetUrl(ship.imageUrls.thumbSmall)
    : getShipMediaUrl(
      ship?.medias?.productThumbMediumAndSmall,
      ship?.medias?.source,
    )
  );
}

export function getShipThumbLarge(ship?: Ship | null) {
  if (!ship) return '';
  if (!HAS_PUBLIC_IMAGES_ENDPOINT && ship.id > 0) {
    return getWorkerShipImageUrl(ship.id, 'thumb-large');
  }

  return (
    ship?.imageUrls?.thumbLarge
    ? toApiAssetUrl(ship.imageUrls.thumbLarge)
    : ship?.imageUrls?.slideshow
      ? toApiAssetUrl(ship.imageUrls.slideshow)
      : ship?.imageUrls?.thumbSmall
        ? toApiAssetUrl(ship.imageUrls.thumbSmall)
        : getShipMediaUrl(
          ship?.medias?.productThumbMediumAndSmall,
          ship?.medias?.source,
        ) || getShipMediaUrl(
          ship?.medias?.slideShow,
          ship?.medias?.source,
        )
  );
}

export function getShipSlideshowImage(ship?: Ship | null) {
  if (!ship) return '';
  if (!HAS_PUBLIC_IMAGES_ENDPOINT && ship.id > 0) {
    return getWorkerShipImageUrl(ship.id, 'slideshow');
  }

  return (
    ship?.imageUrls?.slideshow
    ? toApiAssetUrl(ship.imageUrls.slideshow)
    : ship?.imageUrls?.thumbLarge
      ? toApiAssetUrl(ship.imageUrls.thumbLarge)
      : getShipMediaUrl(
        ship?.medias?.slideShow,
        ship?.medias?.source,
      ) || getShipMediaUrl(
        ship?.medias?.productThumbMediumAndSmall,
        ship?.medias?.source,
      )
  );
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

  const shipId = ship?.id;
  if (!HAS_PUBLIC_IMAGES_ENDPOINT && typeof shipId === 'number' && shipId > 0) {
    return getWorkerShipDetailImageUrl(shipId, entry, index);
  }

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
