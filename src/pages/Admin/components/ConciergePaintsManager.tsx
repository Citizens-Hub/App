import { useEffect, useMemo, useRef, useState } from 'react';
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
  AdminConciergePaintSyncJobResponse,
  AdminManagedRsiStoreSyncJob,
  AdminManagedRsiStoreSyncResult,
  ConciergePaintSourceItem,
} from '@/types';
import type { RootState } from '@/store';
import { requestViaExtension } from '@/utils/extensionHttpRequest';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const RSI_GRAPHQL_URL = 'https://robertsspaceindustries.com/graphql';
const RSI_PAGE_LIMIT = 100;
const RSI_DETAIL_BATCH_LIMIT = 20;
const RESPONSE_TIMEOUT_MS = 20_000;
const SYNC_JOB_POLL_INTERVAL_MS = 10_000;
const CONCIERGE_PAINTS_API_PATH = '/api/admin/concierge-paints';
const SUBSCRIBER_STORE_API_PATH = '/api/admin/subscriber-store';
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

type ManagedRsiStoreCatalogKind = 'conciergePaints' | 'subscriberStore';

type ManagedRsiStoreSyncConfig = {
  kind: ManagedRsiStoreCatalogKind;
  apiPath: string;
  titleId: string;
  titleDefault: string;
  descriptionId: string;
  descriptionDefault: string;
  sourceRequestPrefix: string;
  detailRequestPrefix: string;
  graphqlOperationName: string;
  graphqlQuery: string;
  graphqlProducts: number[];
  graphqlFacetIdentifiers: string[];
  requireVipDetails: boolean;
  emptyId: string;
  emptyDefault: string;
  loadFailedId: string;
  loadFailedDefault: string;
  syncFailedId: string;
  syncFailedDefault: string;
  timeoutId: string;
  timeoutDefault: string;
  flashSuccessId: string;
  flashSuccessDefault: string;
  summaryPrimaryId: string;
  summaryPrimaryDefault: string;
  itemTypeBundleId: string;
  itemTypeBundleDefault: string;
  itemTypeSingleId: string;
  itemTypeSingleDefault: string;
};

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

const RSI_BROWSE_SKUS_QUERY = "query GetBrowseSkusByFilter($query: SearchQuery, $storeFront: String = \"pledge\") {\n  store(browse: true, name: $storeFront) {\n    listing: search(query: $query) {\n      resources {\n        ...TyItemBrowseFragment\n        __typename\n      }\n      count\n      totalCount\n      heapTagFiltersOptions {\n        ...StoreListingHeapTagFiltersOptionsFragment\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment TyItemBrowseFragment on TyItem {\n  id\n  slug\n  name\n  title\n  subtitle\n  url\n  body\n  excerpt\n  type\n  media {\n    thumbnail {\n      slideshow\n      storeSmall\n      __typename\n    }\n    list {\n      slideshow\n      __typename\n    }\n    __typename\n  }\n  nativePrice {\n    amount\n    discounted\n    discountDescription\n    __typename\n  }\n  price {\n    amount\n    discounted\n    taxDescription\n    discountDescription\n    __typename\n  }\n  stock {\n    ...TyStockFragment\n    __typename\n  }\n  tags {\n    ...TyHeapTagFragment\n    __typename\n  }\n  ... on TySku {\n    imageComposer {\n      ...ImageComposerFragment\n      __typename\n    }\n    ...TySkuBrowseFragment\n    __typename\n  }\n  ... on TyProduct {\n    imageComposer {\n      ...ImageComposerFragment\n      __typename\n    }\n    ...TyProductBrowseFragment\n    __typename\n  }\n  __typename\n}\n\nfragment TySkuBrowseFragment on TySku {\n  label\n  customizable\n  isWarbond\n  isPackage\n  isVip\n  isDirectCheckout\n  __typename\n}\n\nfragment TyProductBrowseFragment on TyProduct {\n  skus {\n    id\n    title\n    isDirectCheckout\n    __typename\n  }\n  isVip\n  __typename\n}\n\nfragment TyStockFragment on TyStock {\n  unlimited\n  show\n  available\n  backOrder\n  qty\n  backOrderQty\n  level\n  __typename\n}\n\nfragment TyHeapTagFragment on HeapTag {\n  name\n  __typename\n}\n\nfragment ImageComposerFragment on ImageComposer {\n  name\n  slot\n  url\n  __typename\n}\n\nfragment StoreListingHeapTagFiltersOptionsFragment on HeapTagGroup {\n  groupIdentifier\n  facets {\n    facet\n    tagIdentifiers {\n      identifier\n      name\n      __typename\n    }\n    __typename\n  }\n  __typename\n}"

const RSI_PAINT_DETAIL_QUERY = "query GetSkus($query: SearchQuery!, $storeFront: String = \"pledge\") {\n  store(name: $storeFront, browse: true) {\n    search(query: $query) {\n      count\n      resources {\n        __typename\n        ... on TySku {\n          id\n          slug\n          productId\n          title\n          subtitle\n          label\n          name\n          body\n          excerpt\n          url\n          type\n          isDirectCheckout\n          isVip\n          isWarbond\n          isPackage\n          hasShips\n          customizable\n          ships {\n            id\n            title\n            name\n            __typename\n          }\n          gameItems {\n            name\n            kind\n            code\n            imageComposer {\n              slot\n              name\n              url\n              __typename\n            }\n            media {\n              thumbnail {\n                storeSmall\n                slideshow\n                __typename\n              }\n              __typename\n            }\n            __typename\n          }\n          stock {\n            unlimited\n            show\n            available\n            backOrder\n            qty\n            backOrderQty\n            level\n            __typename\n          }\n          nativePrice {\n            amount\n            discounted\n            __typename\n          }\n          price {\n            amount\n            discounted\n            __typename\n          }\n          imageComposer {\n            slot\n            name\n            url\n            __typename\n          }\n          media {\n            thumbnail {\n              storeSmall\n              slideshow\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n      }\n      __typename\n    }\n    __typename\n  }\n}";

const CONCIERGE_PAINTS_SYNC_CONFIG: ManagedRsiStoreSyncConfig = {
  kind: 'conciergePaints',
  apiPath: CONCIERGE_PAINTS_API_PATH,
  titleId: 'admin.conciergePaints.title',
  titleDefault: 'Concierge Paints',
  descriptionId: 'admin.conciergePaints.description',
  descriptionDefault: 'Use the browser extension to read RSI paint listings, filter concierge items by isVip, then batch list, replace changed versions, or delist the managed paint catalog.',
  sourceRequestPrefix: 'admin-concierge-paints',
  detailRequestPrefix: 'admin-concierge-paints',
  graphqlOperationName: 'GetBrowseSkusByFilter',
  graphqlQuery: RSI_BROWSE_SKUS_QUERY,
  graphqlProducts: [268],
  graphqlFacetIdentifiers: ['paints'],
  requireVipDetails: true,
  emptyId: 'admin.conciergePaints.empty',
  emptyDefault: 'No managed concierge paints yet.',
  loadFailedId: 'admin.conciergePaints.error.loadFailed',
  loadFailedDefault: 'Failed to load managed concierge paint listings.',
  syncFailedId: 'admin.conciergePaints.error.syncFailed',
  syncFailedDefault: 'Failed to sync concierge paints.',
  timeoutId: 'admin.conciergePaints.error.timeout',
  timeoutDefault: "The extension request timed out. Make sure the Citizens' Hub extension is installed, enabled, and logged into RSI.",
  flashSuccessId: 'admin.conciergePaints.flash.syncSuccess',
  flashSuccessDefault: 'Sync complete: fetched {sourceCount} paints, {primaryCount} concierge items; created {created}, replaced {updated}, delisted {removed}.',
  summaryPrimaryId: 'admin.conciergePaints.summary.vipCount',
  summaryPrimaryDefault: 'VIP {count}',
  itemTypeBundleId: 'admin.conciergePaints.itemType.bundle',
  itemTypeBundleDefault: 'Paint Pack',
  itemTypeSingleId: 'admin.conciergePaints.itemType.paint',
  itemTypeSingleDefault: 'Paint',
};

const SUBSCRIBER_STORE_SYNC_CONFIG: ManagedRsiStoreSyncConfig = {
  kind: 'subscriberStore',
  apiPath: SUBSCRIBER_STORE_API_PATH,
  titleId: 'admin.subscriberStore.title',
  titleDefault: 'Subscriber Store',
  descriptionId: 'admin.subscriberStore.description',
  descriptionDefault: 'Use the browser extension to read the RSI subscriber store, then batch list, replace changed versions, or delist the managed subscriber-store catalog.',
  sourceRequestPrefix: 'admin-subscriber-store',
  detailRequestPrefix: 'admin-subscriber-store',
  graphqlOperationName: 'GetBrowseSkusByFilter',
  graphqlQuery: RSI_BROWSE_SKUS_QUERY,
  graphqlProducts: [65],
  graphqlFacetIdentifiers: ['extras-subscribers-store'],
  requireVipDetails: false,
  emptyId: 'admin.subscriberStore.empty',
  emptyDefault: 'No managed subscriber store items yet.',
  loadFailedId: 'admin.subscriberStore.error.loadFailed',
  loadFailedDefault: 'Failed to load managed subscriber store listings.',
  syncFailedId: 'admin.subscriberStore.error.syncFailed',
  syncFailedDefault: 'Failed to sync subscriber store items.',
  timeoutId: 'admin.subscriberStore.error.timeout',
  timeoutDefault: "The extension request timed out. Make sure the Citizens' Hub extension is installed, enabled, and logged into RSI with subscriber-store access.",
  flashSuccessId: 'admin.subscriberStore.flash.syncSuccess',
  flashSuccessDefault: 'Sync complete: fetched {sourceCount} subscriber store items, synced {primaryCount}; created {created}, replaced {updated}, delisted {removed}.',
  summaryPrimaryId: 'admin.subscriberStore.summary.syncCount',
  summaryPrimaryDefault: 'Synced {count}',
  itemTypeBundleId: 'admin.subscriberStore.itemType.bundle',
  itemTypeBundleDefault: 'Bundle',
  itemTypeSingleId: 'admin.subscriberStore.itemType.item',
  itemTypeSingleDefault: 'Item',
};

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

function isManagedSyncJobActive(job?: AdminManagedRsiStoreSyncJob | null) {
  return job?.status === 'queued' || job?.status === 'running';
}

function getManagedTypeLabel(
  item: AdminConciergePaintListingItem,
  intl: ReturnType<typeof useIntl>,
  config: ManagedRsiStoreSyncConfig,
): string {
  if (item.listing.itemType === 'package') {
    return intl.formatMessage({ id: config.itemTypeBundleId, defaultMessage: config.itemTypeBundleDefault });
  }

  return intl.formatMessage({ id: config.itemTypeSingleId, defaultMessage: config.itemTypeSingleDefault });
}

function extractGraphqlBatchEntries(value: unknown): GraphqlBatchEntry[] {
  const responseData = isRecord(value) && 'data' in value ? value.data : value;
  if (!Array.isArray(responseData)) {
    throw new Error('扩展返回的数据格式不正确');
  }

  return responseData as GraphqlBatchEntry[];
}

function parseManagedCatalogPage(value: unknown): { items: ConciergePaintSourceItem[]; totalCount: number } {
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

function parseManagedDetailBatch(value: unknown): ConciergePaintSourceItem[] {
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

async function fetchManagedCatalogPage(page: number, intl: ReturnType<typeof useIntl>, config: ManagedRsiStoreSyncConfig) {
  return requestViaExtension({
    url: RSI_GRAPHQL_URL,
    responseType: 'json',
    method: 'post',
    data: [
      {
        operationName: config.graphqlOperationName,
        variables: {
          "storeFront": "pledge",
          "query": {
            "page": page,
            "limit": RSI_PAGE_LIMIT,
            "skus": {
              "filtersFromTags": {
                "tagIdentifiers": [],
                "facetIdentifiers": config.graphqlFacetIdentifiers
              },
              "products": config.graphqlProducts
            },
            "sort": {
              "field": "weight",
              "direction": "desc"
            }
          }
        },
        query: config.graphqlQuery,
      },
    ],
  }, {
    timeoutMs: RESPONSE_TIMEOUT_MS,
    timeoutMessage: intl.formatMessage({
      id: config.timeoutId,
      defaultMessage: config.timeoutDefault,
    }),
    requestIdPrefix: `${config.sourceRequestPrefix}-page-${page}`,
  });
}

async function fetchManagedDetailBatch(slugs: string[], intl: ReturnType<typeof useIntl>, config: ManagedRsiStoreSyncConfig) {
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
      id: config.timeoutId,
      defaultMessage: config.timeoutDefault,
    }),
    requestIdPrefix: `${config.detailRequestPrefix}-detail-${slugs[0] || 'batch'}`,
  });
}

async function fetchAllManagedCatalog(intl: ReturnType<typeof useIntl>, config: ManagedRsiStoreSyncConfig) {
  const deduped = new Map<number, ConciergePaintSourceItem>();
  let page = 1;
  let totalCount = 0;

  while (true) {
    const response = await fetchManagedCatalogPage(page, intl, config);
    const parsed = parseManagedCatalogPage(response);
    totalCount = parsed.totalCount;

    parsed.items.forEach((item) => {
      deduped.set(item.officialSkuId, item);
    });

    if (parsed.items.length === 0 || page * RSI_PAGE_LIMIT >= totalCount) {
      break;
    }

    page += 1;
  }

  const detailSlugs = [...deduped.values()]
    .filter((item) => !config.requireVipDetails || item.isVip)
    .map((item) => item.slug)
    .filter((slug, index, values) => values.indexOf(slug) === index);

  for (let index = 0; index < detailSlugs.length; index += RSI_DETAIL_BATCH_LIMIT) {
    const batch = detailSlugs.slice(index, index + RSI_DETAIL_BATCH_LIMIT);
    const response = await fetchManagedDetailBatch(batch, intl, config);
    const detailItems = parseManagedDetailBatch(response);

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

function ManagedRsiStoreManager({ config }: { config: ManagedRsiStoreSyncConfig }) {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const [markupPercentInput, setMarkupPercentInput] = useState('15');
  const [syncing, setSyncing] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const [currentSyncJob, setCurrentSyncJob] = useState<AdminManagedRsiStoreSyncJob | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<AdminManagedRsiStoreSyncResult | null>(null);
  const hasAnnouncedCompletionRef = useRef<string | null>(null);

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useAuthApi<AdminConciergePaintListResponse>(config.apiPath, {
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
  const currentSyncJobId = currentSyncJob?.jobId || '';
  const currentSyncJobActive = currentSyncJob ? isManagedSyncJobActive(currentSyncJob) : false;

  useEffect(() => {
    const latestSyncJob = data?.data.latestSyncJob || null;
    if (!latestSyncJob) {
      return;
    }

    setCurrentSyncJob((currentJob) => currentJob?.jobId === latestSyncJob.jobId ? currentJob : latestSyncJob);
    if (latestSyncJob.result) {
      setLastSyncResult(latestSyncJob.result);
    }
  }, [data?.data.latestSyncJob]);

  useEffect(() => {
    if (!currentSyncJobId || !currentSyncJobActive) {
      setSyncing(false);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}${config.apiPath}/sync/${encodeURIComponent(currentSyncJobId)}`, {
          headers: {
            Authorization: user.token ? `Bearer ${user.token}` : '',
          },
        });
        const payload = await response.json() as AdminConciergePaintSyncJobResponse;
        if (cancelled || !response.ok || !payload.success) {
          return;
        }

        const job = payload.data.job;
        setCurrentSyncJob(job);
        setSyncing(isManagedSyncJobActive(job));

        if (job.result) {
          setLastSyncResult(job.result);
        }

        if (job.status === 'completed' && hasAnnouncedCompletionRef.current !== job.jobId && job.result) {
          hasAnnouncedCompletionRef.current = job.jobId;
          const primaryCount = config.kind === 'subscriberStore'
            ? (job.result.syncCount ?? job.result.vipCount)
            : job.result.vipCount;
          setFlash({
            severity: 'success',
            text: intl.formatMessage(
              {
                id: config.flashSuccessId,
                defaultMessage: config.flashSuccessDefault,
              },
              {
                sourceCount: job.result.sourceCount,
                vipCount: job.result.vipCount,
                primaryCount,
                created: job.result.createdCount,
                updated: job.result.updatedCount,
                removed: job.result.removedCount,
              },
            ),
          });
          await mutate();
        }

        if (job.status === 'failed' && hasAnnouncedCompletionRef.current !== job.jobId) {
          hasAnnouncedCompletionRef.current = job.jobId;
          setFlash({
            severity: 'error',
            text: job.errorMessage || intl.formatMessage({
              id: config.syncFailedId,
              defaultMessage: config.syncFailedDefault,
            }),
          });
        }
      } catch {
        if (!cancelled) {
          setSyncing(false);
        }
      }
    };

    setSyncing(true);
    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, SYNC_JOB_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    config.apiPath,
    config.flashSuccessDefault,
    config.flashSuccessId,
    config.kind,
    config.syncFailedDefault,
    config.syncFailedId,
    currentSyncJobActive,
    currentSyncJobId,
    intl,
    mutate,
    user.token,
  ]);

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
      const catalog = await fetchAllManagedCatalog(intl, config);
      const response = await fetch(`${API_BASE_URL}${config.apiPath}/sync`, {
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
          id: config.syncFailedId,
          defaultMessage: config.syncFailedDefault,
        }));
      }

      const job = payload.data.job;
      hasAnnouncedCompletionRef.current = null;
      setCurrentSyncJob(job);
      setLastSyncResult(job.result || null);
      setSyncing(isManagedSyncJobActive(job));
      setFlash({
        severity: 'success',
        text: intl.formatMessage(
          { id: 'admin.conciergePaints.flash.syncQueued', defaultMessage: 'Sync job queued. You can keep this page open while it runs in the background.' },
        ),
      });
    } catch (syncError) {
      setFlash({
        severity: 'error',
        text: syncError instanceof Error
          ? syncError.message
          : intl.formatMessage({
            id: config.syncFailedId,
            defaultMessage: config.syncFailedDefault,
          }),
      });
      setSyncing(false);
    } finally {
      // Active jobs are tracked by the polling effect; failed submission should stop immediately.
    }
  };

  const activeSyncJob = currentSyncJob && isManagedSyncJobActive(currentSyncJob) ? currentSyncJob : null;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom>
          {intl.formatMessage({ id: config.titleId, defaultMessage: config.titleDefault })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: config.descriptionId,
            defaultMessage: config.descriptionDefault,
          })}
        </Typography>
      </Box>

      {flash && (
        <Alert severity={flash.severity}>
          {flash.text}
        </Alert>
      )}

      {activeSyncJob && (
        <Alert severity="info">
          {intl.formatMessage(
            { id: 'admin.conciergePaints.syncJobRunning', defaultMessage: 'Sync job {jobId} is {status}. The catalog will refresh automatically after completion.' },
            {
              jobId: activeSyncJob.jobId.slice(0, 8),
              status: intl.formatMessage({
                id: activeSyncJob.status === 'queued'
                  ? 'admin.conciergePaints.syncStatus.queued'
                  : 'admin.conciergePaints.syncStatus.running',
                defaultMessage: activeSyncJob.status === 'queued' ? 'queued' : 'running',
              }),
            },
          )}
        </Alert>
      )}

      {error && (
        <Alert severity="error">
          {intl.formatMessage({
            id: config.loadFailedId,
            defaultMessage: config.loadFailedDefault,
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
              { id: config.summaryPrimaryId, defaultMessage: config.summaryPrimaryDefault },
              { count: config.kind === 'subscriberStore' ? (lastSyncResult.syncCount ?? lastSyncResult.vipCount) : lastSyncResult.vipCount },
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
                      id: config.emptyId,
                      defaultMessage: config.emptyDefault,
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
                  <TableCell>{getManagedTypeLabel(item, intl, config)}</TableCell>
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

export function SubscriberStoreManager() {
  return <ManagedRsiStoreManager config={SUBSCRIBER_STORE_SYNC_CONFIG} />;
}

export default function ConciergePaintsManager() {
  return <ManagedRsiStoreManager config={CONCIERGE_PAINTS_SYNC_CONFIG} />;
}
