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

export function getAccountMarketListPath() {
  return '/account-market';
}

export function getAccountMarketListUrl() {
  return getSiteUrl(getAccountMarketListPath());
}

export function getAccountMarketDetailPath(skuId: string) {
  return `/account-market/${encodeURIComponent(skuId)}`;
}

export function getAccountMarketDetailUrl(skuId: string) {
  return getSiteUrl(getAccountMarketDetailPath(skuId));
}

export function getAccountMarketCheckoutPath(skuId?: string) {
  if (!skuId) {
    return '/account-market/checkout';
  }

  return `/account-market/checkout?skuId=${encodeURIComponent(skuId)}`;
}

export function getAccountMarketCheckoutUrl(skuId?: string) {
  return getSiteUrl(getAccountMarketCheckoutPath(skuId));
}
