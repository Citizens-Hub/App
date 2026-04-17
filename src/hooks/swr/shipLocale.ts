import type { Locale } from '@/contexts/LocaleContext';

const LOCALIZED_SHIP_API_PATHS = new Set(['/api/ship']);

export function appendShipLocaleToPath(path: string | null, locale: Locale) {
  if (!path || locale === 'en') {
    return path;
  }

  const url = new URL(path, 'http://localhost');
  if (!LOCALIZED_SHIP_API_PATHS.has(url.pathname) || url.searchParams.has('locale')) {
    return path;
  }

  url.searchParams.set('locale', locale);

  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}
