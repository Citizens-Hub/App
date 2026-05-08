export function getMarketDetailPath(skuId: string) {
  return `/market/${encodeURIComponent(skuId)}`;
}

export function getMarketDetailUrl(skuId: string) {
  const detailPath = getMarketDetailPath(skuId);
  const origin = window.location.origin;

  if (import.meta.env.VITE_PUBLIC_CN_MIRROR === 'true') {
    return `${origin}/#${detailPath}`;
  }

  return `${origin}${detailPath}`;
}
