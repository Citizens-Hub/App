import type { Ship } from '@/types';
import { getShipSlideshowImage, getShipThumbLarge, toApiAssetUrl } from '@/utils/shipImage';

const MARKET_IMAGE_URLS_PREFIX = 'citizenshub:images:v1:';
const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT.replace(/\/+$/, '');
const ATTACHMENTS_BASE_URL = import.meta.env.VITE_PUBLIC_ATTACHMENTS_ENDPOINT?.trim().replace(/\/+$/, '') || '';
const PUBLIC_IMAGES_BASE_URL = import.meta.env.VITE_PUBLIC_IMAGES_ENDPOINT?.trim().replace(/\/+$/, '') || '';
const PUBLIC_IMAGES_HOSTNAME = getHostname(PUBLIC_IMAGES_BASE_URL);

export type MarketImageDisplayVariant = 'thumbLarge' | 'slideshow';

function getHostname(value?: string | null) {
  if (!value) {
    return '';
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function normalizeMarketImageUrl(value?: string | null) {
  const normalizedValue = value?.trim() || '';
  return normalizedValue && normalizedValue !== 'https://robertsspaceindustries.com/undefined'
    ? normalizedValue
    : '';
}

export function parseMarketImageUrls(value?: string | null): string[] {
  const normalizedValue = normalizeMarketImageUrl(value);
  if (!normalizedValue) {
    return [];
  }

  if (!normalizedValue.startsWith(MARKET_IMAGE_URLS_PREFIX)) {
    return [normalizedValue];
  }

  try {
    const parsed = JSON.parse(normalizedValue.slice(MARKET_IMAGE_URLS_PREFIX.length));
    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(new Set(
      parsed
        .map((entry) => normalizeMarketImageUrl(typeof entry === 'string' ? entry : ''))
        .filter(Boolean),
    ));
  } catch {
    return [];
  }
}

export function encodeMarketImageUrls(values: string[]) {
  const imageUrls = Array.from(new Set(values.map(normalizeMarketImageUrl).filter(Boolean)));
  if (imageUrls.length === 0) {
    return '';
  }

  if (imageUrls.length === 1) {
    return imageUrls[0];
  }

  return `${MARKET_IMAGE_URLS_PREFIX}${JSON.stringify(imageUrls)}`;
}

export function resolveMarketImageUrls(value?: string | null, values?: string[] | null) {
  return values?.length ? values.map(normalizeMarketImageUrl).filter(Boolean) : parseMarketImageUrls(value);
}

export function getMarketImageAssetUrl(value?: string | null) {
  const normalizedValue = normalizeMarketImageUrl(value);
  if (!normalizedValue) {
    return '';
  }

  if (normalizedValue.startsWith('/imgs/') || normalizedValue.startsWith('imgs/')) {
    return normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`;
  }

  if (/^https?:\/\//i.test(normalizedValue)) {
    return normalizedValue;
  }

  if (normalizedValue.startsWith('/api/') || normalizedValue.startsWith('api/')) {
    return `${API_BASE_URL}${normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`}`;
  }

  if (ATTACHMENTS_BASE_URL && normalizedValue.startsWith('market/')) {
    return `${ATTACHMENTS_BASE_URL}/${normalizedValue}`;
  }

  return toApiAssetUrl(normalizedValue);
}

function normalizeShipImageRoutePath(pathname: string) {
  return pathname.replace(/^\/api\/ship-images\//, '/ship-images/');
}

function getComparableImageKeys(value?: string | null) {
  const normalizedValue = normalizeMarketImageUrl(value);
  if (!normalizedValue) {
    return [];
  }

  const candidateValues = Array.from(new Set([
    normalizedValue,
    getMarketImageAssetUrl(normalizedValue),
  ].filter(Boolean)));
  const keys = new Set<string>();

  candidateValues.forEach((candidateValue) => {
    try {
      const parsed = /^https?:\/\//i.test(candidateValue)
        ? new URL(candidateValue)
        : new URL(candidateValue.startsWith('/') ? candidateValue : `/${candidateValue}`, 'https://citizenshub.app');
      parsed.hash = '';
      parsed.search = '';

      const path = normalizeShipImageRoutePath(parsed.pathname.replace(/\/+$/, ''));
      keys.add(`${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}${path}`);
      keys.add(path);
    } catch {
      keys.add(candidateValue.replace(/[?#].*$/, '').replace(/\/+$/, ''));
    }
  });

  return [...keys];
}

function parseHostedShipImageId(value?: string | null) {
  const normalizedValue = normalizeMarketImageUrl(value);
  if (!normalizedValue) {
    return null;
  }

  try {
    const isAbsolute = /^https?:\/\//i.test(normalizedValue);
    const parsed = isAbsolute
      ? new URL(normalizedValue)
      : new URL(normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`, 'https://citizenshub.app');
    const pathname = normalizeShipImageRoutePath(parsed.pathname);
    const routeMatch = pathname.match(/^\/ship-images\/(\d+)\/(?:thumb-small|thumb-large|thumb_large|slideshow)(?:\/|$)/i);
    if (routeMatch) {
      return Number(routeMatch[1]);
    }

    const hostname = isAbsolute ? parsed.hostname.toLowerCase() : '';
    const isPublicImagesHost = !hostname
      || hostname === 'images.citizenshub.app'
      || (PUBLIC_IMAGES_HOSTNAME && hostname === PUBLIC_IMAGES_HOSTNAME);
    if (!isPublicImagesHost) {
      return null;
    }

    const r2PathMatch = pathname.match(/^\/ships\/(\d+)\//i);
    return r2PathMatch ? Number(r2PathMatch[1]) : null;
  } catch {
    return null;
  }
}

export function findShipByMarketImageUrl(value?: string | null, ships?: Ship[] | null) {
  if (!ships?.length) {
    return undefined;
  }

  const routeShipId = parseHostedShipImageId(value);
  if (routeShipId) {
    const routeShip = ships.find((ship) => ship.id === routeShipId);
    if (routeShip) {
      return routeShip;
    }
  }

  const valueKeys = new Set(getComparableImageKeys(value));
  if (valueKeys.size === 0) {
    return undefined;
  }

  return ships.find((ship) => {
    const shipImageKeys = [
      getShipThumbLarge(ship),
      getShipSlideshowImage(ship),
      ship.imageUrls?.thumbLarge ? toApiAssetUrl(ship.imageUrls.thumbLarge) : '',
      ship.imageUrls?.slideshow ? toApiAssetUrl(ship.imageUrls.slideshow) : '',
      ship.imageUrls?.thumbSmall ? toApiAssetUrl(ship.imageUrls.thumbSmall) : '',
    ].flatMap(getComparableImageKeys);

    return shipImageKeys.some((key) => valueKeys.has(key));
  });
}

function getShipImageForDisplayVariant(ship: Ship, variant: MarketImageDisplayVariant) {
  if (variant === 'slideshow') {
    return getShipSlideshowImage(ship) || getShipThumbLarge(ship);
  }

  return getShipThumbLarge(ship) || getShipSlideshowImage(ship);
}

export function getMarketImageDisplayUrl(
  value?: string | null,
  options?: {
    ships?: Ship[] | null;
    variant?: MarketImageDisplayVariant;
  },
) {
  const fallbackUrl = getMarketImageAssetUrl(value);
  if (!fallbackUrl) {
    return '';
  }

  const ship = findShipByMarketImageUrl(value, options?.ships)
    || findShipByMarketImageUrl(fallbackUrl, options?.ships);
  if (!ship) {
    return fallbackUrl;
  }

  return getShipImageForDisplayVariant(ship, options?.variant || 'thumbLarge') || fallbackUrl;
}
