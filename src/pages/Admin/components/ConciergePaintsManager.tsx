import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { CloudSync, OpenInNew, Refresh } from '@mui/icons-material';

import { useAuthApi } from '@/hooks';
import type {
  AdminConciergePaintListResponse,
  AdminConciergePaintListingItem,
  AdminConciergePaintSyncResponse,
  ConciergePaintSourceItem,
} from '@/types';
import type { RootState } from '@/store';
import { requestViaExtension } from '@/utils/extensionHttpRequest';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const RSI_GRAPHQL_URL = 'https://robertsspaceindustries.com/graphql';
const RSI_PAGE_LIMIT = 100;
const RSI_DETAIL_BATCH_LIMIT = 20;
const RESPONSE_TIMEOUT_MS = 20_000;
const RSI_IMAGE_COMPOSER_CONFIG = [
  {
    name: '1024',
    size: 'SIZE_900',
    ratio: 'RATIO_16_9',
    extension: 'WEBP',
  },
  {
    name: '1440',
    size: 'SIZE_1000',
    ratio: 'RATIO_16_9',
    extension: 'WEBP',
  },
  {
    name: '2048',
    size: 'SIZE_1100',
    ratio: 'RATIO_16_9',
    extension: 'WEBP',
  },
] as const;

type FlashState = {
  severity: 'success' | 'error';
  text: string;
} | null;

type GraphqlBatchEntry = {
  data?: {
    store?: {
      listing?: {
        resources?: GraphqlPaintResource[];
        count?: number;
        totalCount?: number;
      };
      search?: {
        resources?: GraphqlPaintDetailResource[];
        count?: number;
      };
    };
  };
  errors?: Array<{
    message?: string;
  }>;
};

type GraphqlPaintResource = {
  __typename?: string;
  id?: string;
  slug?: string | null;
  name?: string | null;
  title?: string | null;
  subtitle?: string | null;
  url?: string | null;
  excerpt?: string | null;
  media?: {
    thumbnail?: {
      slideshow?: string | null;
      storeSmall?: string | null;
    } | null;
    list?: Array<{
      slideshow?: string | null;
    }> | null;
  } | null;
  nativePrice?: {
    amount?: number | null;
    discounted?: number | null;
  } | null;
  price?: {
    amount?: number | null;
    discounted?: number | null;
  } | null;
  stock?: {
    available?: boolean | null;
  } | null;
  isPackage?: boolean | null;
  isVip?: boolean | null;
  isWarbond?: boolean | null;
  isDirectCheckout?: boolean | null;
};

type GraphqlImageComposerEntry = {
  slot?: string | null;
  name?: string | null;
  url?: string | null;
  __typename?: string;
};

type GraphqlGameItem = {
  name?: string | null;
  kind?: string | null;
  code?: string | null;
  imageComposer?: GraphqlImageComposerEntry[] | null;
  media?: {
    thumbnail?: {
      storeSmall?: string | null;
      slideshow?: string | null;
    } | null;
  } | null;
};

type GraphqlPaintShip = {
  id?: string | null;
  title?: string | null;
  name?: string | null;
};

type GraphqlPaintDetailResource = {
  __typename?: string;
  id?: string | number | null;
  slug?: string | null;
  productId?: string | null;
  title?: string | null;
  subtitle?: string | null;
  label?: string | null;
  name?: string | null;
  body?: string | null;
  excerpt?: string | null;
  url?: string | null;
  type?: string | null;
  isDirectCheckout?: boolean | null;
  isVip?: boolean | null;
  isWarbond?: boolean | null;
  isPackage?: boolean | null;
  hasShips?: boolean | null;
  customizable?: boolean | null;
  ships?: GraphqlPaintShip[] | null;
  gameItems?: GraphqlGameItem[] | null;
  stock?: {
    available?: boolean | null;
  } | null;
  nativePrice?: {
    amount?: number | null;
    discounted?: number | null;
  } | null;
  price?: {
    amount?: number | null;
    discounted?: number | null;
  } | null;
  imageComposer?: GraphqlImageComposerEntry[] | null;
  media?: {
    thumbnail?: {
      storeSmall?: string | null;
      slideshow?: string | null;
    } | null;
  } | null;
};

const RSI_PAINTS_QUERY = "query GetBrowseSkusPaintsByFilter($query: SearchQuery, $storeFront: String = \"pledge\") {\n  store(browse: true, name: $storeFront) {\n    listing: search(query: $query) {\n      resources {\n        ...TyItemBrowseFragment\n        __typename\n      }\n      count\n      totalCount\n      heapTagFiltersOptions {\n        ...StoreListingHeapTagFiltersOptionsFragment\n        __typename\n      }\n      paintFiltersOptions {\n        ...StoreListingPaintFiltersOptions\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment TyItemBrowseFragment on TyItem {\n  id\n  slug\n  name\n  title\n  subtitle\n  url\n  body\n  excerpt\n  type\n  media {\n    thumbnail {\n      slideshow\n      storeSmall\n      __typename\n    }\n    list {\n      slideshow\n      __typename\n    }\n    __typename\n  }\n  nativePrice {\n    amount\n    discounted\n    discountDescription\n    __typename\n  }\n  price {\n    amount\n    discounted\n    taxDescription\n    discountDescription\n    __typename\n  }\n  stock {\n    ...TyStockFragment\n    __typename\n  }\n  tags {\n    ...TyHeapTagFragment\n    __typename\n  }\n  ... on TySku {\n    imageComposer {\n      ...ImageComposerFragment\n      __typename\n    }\n    ...TySkuBrowseFragment\n    __typename\n  }\n  ... on TyProduct {\n    imageComposer {\n      ...ImageComposerFragment\n      __typename\n    }\n    ...TyProductBrowseFragment\n    __typename\n  }\n  __typename\n}\n\nfragment TySkuBrowseFragment on TySku {\n  label\n  customizable\n  isWarbond\n  isPackage\n  isVip\n  isDirectCheckout\n  __typename\n}\n\nfragment TyProductBrowseFragment on TyProduct {\n  skus {\n    id\n    title\n    isDirectCheckout\n    __typename\n  }\n  isVip\n  __typename\n}\n\nfragment TyStockFragment on TyStock {\n  unlimited\n  show\n  available\n  backOrder\n  qty\n  backOrderQty\n  level\n  __typename\n}\n\nfragment TyHeapTagFragment on HeapTag {\n  name\n  __typename\n}\n\nfragment ImageComposerFragment on ImageComposer {\n  name\n  slot\n  url\n  __typename\n}\n\nfragment StoreListingHeapTagFiltersOptionsFragment on HeapTagGroup {\n  groupIdentifier\n  facets {\n    facet\n    tagIdentifiers {\n      identifier\n      name\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n\nfragment StoreListingPaintFiltersOptions on PaintFilters {\n  standalonePaint {\n    label\n    value\n    __typename\n  }\n  paintPack {\n    label\n    value\n    __typename\n  }\n  __typename\n}"

const RSI_PAINT_DETAIL_QUERY = "query GetSkus($query: SearchQuery!, $storeFront: String = \"pledge\") {\n  store(name: $storeFront, browse: true) {\n    search(query: $query) {\n      count\n      resources {\n        __typename\n        ... on TySku {\n          id\n          slug\n          productId\n          title\n          subtitle\n          label\n          name\n          body\n          excerpt\n          url\n          type\n          isDirectCheckout\n          isVip\n          isWarbond\n          isPackage\n          hasShips\n          customizable\n          ships {\n            id\n            title\n            name\n            __typename\n          }\n          gameItems {\n            name\n            kind\n            code\n            imageComposer {\n              slot\n              name\n              url\n              __typename\n            }\n            media {\n              thumbnail {\n                storeSmall\n                slideshow\n                __typename\n              }\n              __typename\n            }\n            __typename\n          }\n          stock {\n            unlimited\n            show\n            available\n            backOrder\n            qty\n            backOrderQty\n            level\n            __typename\n          }\n          nativePrice {\n            amount\n            discounted\n            __typename\n          }\n          price {\n            amount\n            discounted\n            __typename\n          }\n          imageComposer {\n            slot\n            name\n            url\n            __typename\n          }\n          media {\n            thumbnail {\n              storeSmall\n              slideshow\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n      }\n      __typename\n    }\n    __typename\n  }\n}";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeRsiUrl(value: string | null | undefined): string | null {
  const raw = normalizeOptionalString(value);
  if (!raw) {
    return null;
  }

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return new URL(raw).toString();
    }

    return new URL(raw, 'https://robertsspaceindustries.com').toString();
  } catch {
    return null;
  }
}

function getComposerImageUrl(entries: GraphqlImageComposerEntry[] | null | undefined): string | null {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const preferred = entries.find((entry) => entry.slot === 'thumbnail' && normalizeOptionalString(entry.url))
    || entries.find((entry) => normalizeOptionalString(entry.url));

  return normalizeRsiUrl(preferred?.url);
}

function getResourceImageUrl(resource: {
  media?: {
    thumbnail?: {
      storeSmall?: string | null;
      slideshow?: string | null;
    } | null;
  } | null;
  imageComposer?: GraphqlImageComposerEntry[] | null;
}): string | null {
  return normalizeRsiUrl(
    getComposerImageUrl(resource.imageComposer)
    || resource.media?.thumbnail?.slideshow
    || resource.media?.thumbnail?.storeSmall
    || null,
  );
}

function parseNullableNumberString(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTimestamp(value: string | null | undefined, locale: string): string {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(locale);
}

function formatUsd(locale: string, value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return value.toLocaleString(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getManagedStatusColor(isActive: boolean): 'success' | 'default' {
  return isActive ? 'success' : 'default';
}

function getManagedTypeLabel(item: AdminConciergePaintListingItem, intl: ReturnType<typeof useIntl>): string {
  if (item.listing.itemType === 'package') {
    return intl.formatMessage({ id: 'admin.conciergePaints.itemType.bundle', defaultMessage: 'Paint Pack' });
  }

  return intl.formatMessage({ id: 'admin.conciergePaints.itemType.paint', defaultMessage: 'Paint' });
}

function extractGraphqlBatchEntries(value: unknown): GraphqlBatchEntry[] {
  const responseData = isRecord(value) && 'data' in value ? value.data : value;
  if (!Array.isArray(responseData)) {
    throw new Error('扩展返回的数据格式不正确');
  }

  return responseData as GraphqlBatchEntry[];
}

function parsePaintCatalogPage(value: unknown): { items: ConciergePaintSourceItem[]; totalCount: number } {
  const entries = extractGraphqlBatchEntries(value);
  const firstEntry = entries[0];

  if (!firstEntry) {
    throw new Error('RSI GraphQL 响应为空');
  }

  if (firstEntry.errors?.length) {
    throw new Error(firstEntry.errors.map((entry) => entry.message || 'Unknown GraphQL error').join('; '));
  }

  const listing = firstEntry.data?.store?.listing;
  const resources = Array.isArray(listing?.resources) ? listing.resources : [];
  const totalCount = typeof listing?.totalCount === 'number'
    ? listing.totalCount
    : typeof listing?.count === 'number'
      ? listing.count
      : resources.length;

  const items = resources.reduce<ConciergePaintSourceItem[]>((acc, resource) => {
    if (resource.__typename !== 'TySku') {
      return acc;
    }

    const officialSkuId = Number(resource.id);
    const slug = normalizeOptionalString(resource.slug);
    const name = normalizeOptionalString(resource.name);
    const title = normalizeOptionalString(resource.title) || name;
    const url = normalizeRsiUrl(resource.url);
    const imageUrl = getResourceImageUrl({
      media: {
        thumbnail: {
          storeSmall: resource.media?.thumbnail?.storeSmall || null,
          slideshow: resource.media?.thumbnail?.slideshow || resource.media?.list?.[0]?.slideshow || null,
        },
      },
    });

    if (!Number.isInteger(officialSkuId) || officialSkuId <= 0 || !slug || !name || !title || !url) {
      return acc;
    }

    if (resource.stock?.available === false) {
      return acc;
    }

    acc.push({
      officialSkuId,
      slug,
      name,
      title,
      subtitle: normalizeOptionalString(resource.subtitle),
      url,
      excerpt: normalizeOptionalString(resource.excerpt),
      imageUrl,
      isPackage: Boolean(resource.isPackage),
      isVip: Boolean(resource.isVip),
      isWarbond: Boolean(resource.isWarbond),
      isDirectCheckout: Boolean(resource.isDirectCheckout),
      priceAmount: typeof resource.nativePrice?.amount === 'number'
        ? resource.nativePrice.amount
        : typeof resource.price?.amount === 'number'
          ? resource.price.amount
          : null,
      priceDiscounted: typeof resource.nativePrice?.discounted === 'number'
        ? resource.nativePrice.discounted
        : typeof resource.price?.discounted === 'number'
          ? resource.price.discounted
          : null,
    });

    return acc;
  }, []);

  return {
    items,
    totalCount,
  };
}

function parsePaintDetailBatch(value: unknown): ConciergePaintSourceItem[] {
  const entries = extractGraphqlBatchEntries(value);
  const firstEntry = entries[0];

  if (!firstEntry) {
    throw new Error('RSI GraphQL 详情响应为空');
  }

  if (firstEntry.errors?.length) {
    throw new Error(firstEntry.errors.map((entry) => entry.message || 'Unknown GraphQL error').join('; '));
  }

  const resources = Array.isArray(firstEntry.data?.store?.search?.resources)
    ? firstEntry.data?.store?.search?.resources
    : [];

  return resources.reduce<ConciergePaintSourceItem[]>((acc, resource) => {
    if (resource.__typename !== 'TySku') {
      return acc;
    }

    const officialSkuId = parseNullableNumberString(resource.id);
    const slug = normalizeOptionalString(resource.slug);
    const name = normalizeOptionalString(resource.name);
    const title = normalizeOptionalString(resource.title) || normalizeOptionalString(resource.label) || name;
    const url = normalizeRsiUrl(resource.url);

    if (!officialSkuId || !slug || !name || !title || !url) {
      return acc;
    }

    if (resource.stock?.available === false) {
      return acc;
    }

    acc.push({
      officialSkuId,
      slug,
      name,
      title,
      officialProductId: normalizeOptionalString(resource.productId),
      subtitle: normalizeOptionalString(resource.subtitle),
      body: normalizeOptionalString(resource.body),
      url,
      excerpt: normalizeOptionalString(resource.excerpt),
      imageUrl: getResourceImageUrl(resource),
      isPackage: Boolean(resource.isPackage),
      isVip: Boolean(resource.isVip),
      isWarbond: Boolean(resource.isWarbond),
      isDirectCheckout: Boolean(resource.isDirectCheckout),
      priceAmount: typeof resource.nativePrice?.amount === 'number'
        ? resource.nativePrice.amount
        : typeof resource.price?.amount === 'number'
          ? resource.price.amount
          : null,
      priceDiscounted: typeof resource.nativePrice?.discounted === 'number'
        ? resource.nativePrice.discounted
        : typeof resource.price?.discounted === 'number'
          ? resource.price.discounted
          : null,
      packageShips: Array.isArray(resource.ships)
        ? resource.ships.reduce<Array<{ shipId?: number | null; shipName: string }>>((ships, ship) => {
            const shipName = normalizeOptionalString(ship.title) || normalizeOptionalString(ship.name);
            if (!shipName) {
              return ships;
            }

            ships.push({
              shipId: parseNullableNumberString(ship.id),
              shipName,
            });

            return ships;
          }, [])
        : [],
      packageItems: Array.isArray(resource.gameItems)
        ? resource.gameItems.reduce<Array<{ itemName: string; itemKind?: string | null; imageUrl?: string | null }>>((items, item) => {
            const itemName = normalizeOptionalString(item.name);
            if (!itemName) {
              return items;
            }

            items.push({
              itemName,
              itemKind: normalizeOptionalString(item.kind),
              imageUrl: getResourceImageUrl(item),
            });

            return items;
          }, [])
        : [],
    });

    return acc;
  }, []);
}

async function fetchPaintCatalogPage(page: number, intl: ReturnType<typeof useIntl>) {
  return requestViaExtension({
    url: RSI_GRAPHQL_URL,
    responseType: 'json',
    method: 'post',
    data: [
      {
        operationName: 'GetBrowseSkusPaintsByFilter',
        variables: {
          "storeFront": "pledge",
          "query": {
            "page": page,
            "limit": RSI_PAGE_LIMIT,
            "skus": {
              "filtersFromTags": {
                "tagIdentifiers": [],
                "facetIdentifiers": [
                  "paints"
                ]
              },
              "products": [
                268
              ]
            },
            "sort": {
              "field": "weight",
              "direction": "desc"
            }
          }
        },
        query: RSI_PAINTS_QUERY,
      },
    ],
  }, {
    timeoutMs: RESPONSE_TIMEOUT_MS,
    timeoutMessage: intl.formatMessage({
      id: 'admin.conciergePaints.error.timeout',
      defaultMessage: '扩展请求超时，请确认 Citizens Hub 扩展已安装、启用，并且已登录 RSI。',
    }),
    requestIdPrefix: `admin-concierge-paints-page-${page}`,
  });
}

async function fetchPaintDetailBatch(slugs: string[], intl: ReturnType<typeof useIntl>) {
  return requestViaExtension({
    url: RSI_GRAPHQL_URL,
    responseType: 'json',
    method: 'post',
    data: [
      {
        operationName: 'GetSkus',
        variables: {
          storeFront: 'pledge',
          query: {
            skus: {
              slugs,
              imageComposer: RSI_IMAGE_COMPOSER_CONFIG,
              unslottedMedia: true,
              items: {
                imageComposer: RSI_IMAGE_COMPOSER_CONFIG,
              },
            },
          },
        },
        query: RSI_PAINT_DETAIL_QUERY,
      },
    ],
  }, {
    timeoutMs: RESPONSE_TIMEOUT_MS,
    timeoutMessage: intl.formatMessage({
      id: 'admin.conciergePaints.error.timeout',
      defaultMessage: '扩展请求超时，请确认 Citizens Hub 扩展已安装、启用，并且已登录 RSI。',
    }),
    requestIdPrefix: `admin-concierge-paints-detail-${slugs[0] || 'batch'}`,
  });
}

async function fetchAllPaintCatalog(intl: ReturnType<typeof useIntl>) {
  const deduped = new Map<number, ConciergePaintSourceItem>();
  let page = 1;
  let totalCount = 0;

  while (true) {
    const response = await fetchPaintCatalogPage(page, intl);
    const parsed = parsePaintCatalogPage(response);
    totalCount = parsed.totalCount;

    parsed.items.forEach((item) => {
      deduped.set(item.officialSkuId, item);
    });

    if (parsed.items.length === 0 || page * RSI_PAGE_LIMIT >= totalCount) {
      break;
    }

    page += 1;
  }

  const vipSlugs = [...deduped.values()]
    .filter((item) => item.isVip)
    .map((item) => item.slug)
    .filter((slug, index, values) => values.indexOf(slug) === index);

  for (let index = 0; index < vipSlugs.length; index += RSI_DETAIL_BATCH_LIMIT) {
    const batch = vipSlugs.slice(index, index + RSI_DETAIL_BATCH_LIMIT);
    const response = await fetchPaintDetailBatch(batch, intl);
    const detailItems = parsePaintDetailBatch(response);

    detailItems.forEach((item) => {
      const existing = deduped.get(item.officialSkuId);
      deduped.set(item.officialSkuId, existing ? {
        ...existing,
        ...item,
        packageShips: item.packageShips || existing.packageShips,
        packageItems: item.packageItems || existing.packageItems,
      } : item);
    });
  }

  return {
    totalCount,
    items: [...deduped.values()],
  };
}

export default function ConciergePaintsManager() {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const [markupPercentInput, setMarkupPercentInput] = useState('15');
  const [syncing, setSyncing] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const [lastSyncResult, setLastSyncResult] = useState<AdminConciergePaintSyncResponse['data'] | null>(null);

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useAuthApi<AdminConciergePaintListResponse>('/api/admin/concierge-paints', {
    revalidateOnFocus: false,
  });

  const sortedItems = useMemo(() => {
    const items = data?.data.items || [];
    return [...items].sort((left, right) => {
      const leftActive = left.listing.deletedAt ? 0 : 1;
      const rightActive = right.listing.deletedAt ? 0 : 1;
      if (leftActive !== rightActive) {
        return rightActive - leftActive;
      }

      return left.listing.name.localeCompare(right.listing.name);
    });
  }, [data?.data.items]);

  const handleRefresh = async () => {
    await mutate();
  };

  const handleSync = async () => {
    const markupPercent = Number(markupPercentInput.trim());

    if (!Number.isFinite(markupPercent) || markupPercent < 0) {
      setFlash({
        severity: 'error',
        text: intl.formatMessage({
          id: 'admin.conciergePaints.error.invalidMarkup',
          defaultMessage: '加价百分比必须是大于等于 0 的数字。',
        }),
      });
      return;
    }

    setSyncing(true);
    setFlash(null);

    try {
      const catalog = await fetchAllPaintCatalog(intl);
      const response = await fetch(`${API_BASE_URL}/api/admin/concierge-paints/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: user.token ? `Bearer ${user.token}` : '',
        },
        body: JSON.stringify({
          markupPercent,
          items: catalog.items,
        }),
      });

      const payload = await response.json() as AdminConciergePaintSyncResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || intl.formatMessage({
          id: 'admin.conciergePaints.error.syncFailed',
          defaultMessage: '礼宾涂装同步失败。',
        }));
      }

      setLastSyncResult(payload.data);
      setFlash({
        severity: 'success',
        text: intl.formatMessage(
          {
            id: 'admin.conciergePaints.flash.syncSuccess',
            defaultMessage: '同步完成：抓取 {sourceCount} 个涂装，礼宾 {vipCount} 个；新建 {created}，替换版本 {updated}，下架 {removed}。',
          },
          {
            sourceCount: payload.data.sourceCount,
            vipCount: payload.data.vipCount,
            created: payload.data.createdCount,
            updated: payload.data.updatedCount,
            removed: payload.data.removedCount,
          },
        ),
      });

      await mutate();
    } catch (syncError) {
      setFlash({
        severity: 'error',
        text: syncError instanceof Error
          ? syncError.message
          : intl.formatMessage({
            id: 'admin.conciergePaints.error.syncFailed',
            defaultMessage: '礼宾涂装同步失败。',
          }),
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom>
          {intl.formatMessage({ id: 'admin.conciergePaints.title', defaultMessage: 'Concierge Paints' })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'admin.conciergePaints.description',
            defaultMessage: 'Use the browser extension to read RSI paint listings, filter concierge items by isVip, then batch list, replace changed versions, or delist the managed paint catalog.',
          })}
        </Typography>
      </Box>

      {flash && (
        <Alert severity={flash.severity}>
          {flash.text}
        </Alert>
      )}

      {error && (
        <Alert severity="error">
          {intl.formatMessage({
            id: 'admin.conciergePaints.error.loadFailed',
            defaultMessage: 'Failed to load managed concierge paint listings.',
          })}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
        <TextField
          label={intl.formatMessage({
            id: 'admin.conciergePaints.markupPercent',
            defaultMessage: 'Markup %',
          })}
          value={markupPercentInput}
          onChange={(event) => setMarkupPercentInput(event.target.value)}
          size="small"
          sx={{ maxWidth: 220 }}
          helperText={intl.formatMessage({
            id: 'admin.conciergePaints.markupPercentHelp',
            defaultMessage: 'Applied on top of the current RSI sale price.',
          })}
        />
        <Button
          variant="contained"
          startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <CloudSync />}
          disabled={syncing}
          onClick={handleSync}
        >
          {syncing
            ? intl.formatMessage({ id: 'admin.conciergePaints.syncing', defaultMessage: 'Syncing...' })
            : intl.formatMessage({ id: 'admin.conciergePaints.sync', defaultMessage: 'Sync via Extension' })}
        </Button>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={handleRefresh}
          disabled={syncing}
        >
          {intl.formatMessage({ id: 'admin.conciergePaints.refresh', defaultMessage: 'Refresh' })}
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          label={intl.formatMessage(
            { id: 'admin.conciergePaints.activeCount', defaultMessage: 'Active {count}' },
            { count: data?.data.activeCount || 0 },
          )}
          color="success"
          size="small"
        />
        <Chip
          label={intl.formatMessage(
            { id: 'admin.conciergePaints.inactiveCount', defaultMessage: 'Inactive {count}' },
            { count: data?.data.inactiveCount || 0 },
          )}
          size="small"
        />
        <Chip
          label={intl.formatMessage(
            { id: 'admin.conciergePaints.defaultStock', defaultMessage: 'Default new stock {count}' },
            { count: data?.data.defaultStock || 0 },
          )}
          size="small"
        />
      </Stack>

      {lastSyncResult && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            label={intl.formatMessage(
              { id: 'admin.conciergePaints.summary.sourceCount', defaultMessage: 'Fetched {count}' },
              { count: lastSyncResult.sourceCount },
            )}
            size="small"
          />
          <Chip
            label={intl.formatMessage(
              { id: 'admin.conciergePaints.summary.vipCount', defaultMessage: 'VIP {count}' },
              { count: lastSyncResult.vipCount },
            )}
            size="small"
            color="success"
          />
          <Chip
            label={intl.formatMessage(
              { id: 'admin.conciergePaints.summary.created', defaultMessage: 'Created {count}' },
              { count: lastSyncResult.createdCount },
            )}
            size="small"
            color="success"
          />
          <Chip
            label={intl.formatMessage(
              { id: 'admin.conciergePaints.summary.updated', defaultMessage: 'Replaced {count}' },
              { count: lastSyncResult.updatedCount },
            )}
            size="small"
            color="warning"
          />
          <Chip
            label={intl.formatMessage(
              { id: 'admin.conciergePaints.summary.removed', defaultMessage: 'Delisted {count}' },
              { count: lastSyncResult.removedCount },
            )}
            size="small"
          />
          <Chip
            label={intl.formatMessage(
              { id: 'admin.conciergePaints.summary.unchanged', defaultMessage: 'Unchanged {count}' },
              { count: lastSyncResult.unchangedCount },
            )}
            size="small"
          />
        </Stack>
      )}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{intl.formatMessage({ id: 'admin.conciergePaints.column.officialSkuId', defaultMessage: 'Official SKU' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.conciergePaints.column.name', defaultMessage: 'Name' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.conciergePaints.column.type', defaultMessage: 'Type' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.conciergePaints.column.price', defaultMessage: 'Price' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.conciergePaints.column.cost', defaultMessage: 'Cost' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.conciergePaints.column.stock', defaultMessage: 'Stock' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.conciergePaints.column.status', defaultMessage: 'Status' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.conciergePaints.column.updatedAt', defaultMessage: 'Updated' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.conciergePaints.column.source', defaultMessage: 'Source' })}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!isLoading && sortedItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>
                  <Typography variant="body2" color="text.secondary">
                    {intl.formatMessage({
                      id: 'admin.conciergePaints.empty',
                      defaultMessage: 'No managed concierge paints yet.',
                    })}
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {sortedItems.map((item) => {
              const isActive = !item.listing.deletedAt;

              return (
                <TableRow key={`${item.officialSkuId || item.listing.skuId}-${item.listing.skuId}`}>
                  <TableCell>{item.officialSkuId || '-'}</TableCell>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body2">{item.listing.name}</Typography>
                      {item.listing.description && (
                        <Typography variant="caption" color="text.secondary">
                          {item.listing.description}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>{getManagedTypeLabel(item, intl)}</TableCell>
                  <TableCell>{formatUsd(intl.locale, item.listing.price)}</TableCell>
                  <TableCell>{formatUsd(intl.locale, item.listing.cost)}</TableCell>
                  <TableCell>{item.listing.stock}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={getManagedStatusColor(isActive)}
                      label={isActive
                        ? intl.formatMessage({ id: 'admin.conciergePaints.status.active', defaultMessage: 'Active' })
                        : intl.formatMessage({ id: 'admin.conciergePaints.status.delisted', defaultMessage: 'Delisted' })}
                    />
                  </TableCell>
                  <TableCell>{formatTimestamp(item.listing.updatedAt, intl.locale)}</TableCell>
                  <TableCell>
                    {item.sourceUrl ? (
                      <Link
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        underline="hover"
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                      >
                        <span>{intl.formatMessage({ id: 'admin.conciergePaints.openSource', defaultMessage: 'Open' })}</span>
                        <OpenInNew fontSize="inherit" />
                      </Link>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
