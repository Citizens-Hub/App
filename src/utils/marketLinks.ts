function getOrigin() {
  return window.location.origin;
}

export function getSiteUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const origin = getOrigin();

  if (import.meta.env.VITE_PUBLIC_CN_MIRROR === 'true') {
    return `${origin}/#${normalizedPath}`;
  }

  return `${origin}${normalizedPath}`;
}

export function getAbsoluteAssetUrl(path?: string | null) {
  const normalizedPath = path?.trim();
  if (!normalizedPath) {
    return '';
  }

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  return `${getOrigin()}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

export function getMarketListPath() {
  return '/market';
}

export function getMarketListUrl() {
  return getSiteUrl(getMarketListPath());
}

export function getMarketDetailPath(skuId: string) {
  return `/market/${encodeURIComponent(skuId)}`;
}

export function getMarketDetailUrl(skuId: string) {
  return getSiteUrl(getMarketDetailPath(skuId));
}
