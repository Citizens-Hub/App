import { toApiAssetUrl } from '@/utils/shipImage';

const MARKET_IMAGE_URLS_PREFIX = 'citizenshub:images:v1:';
const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT.replace(/\/+$/, '');
const ATTACHMENTS_BASE_URL = import.meta.env.VITE_PUBLIC_ATTACHMENTS_ENDPOINT?.trim().replace(/\/+$/, '') || '';

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
