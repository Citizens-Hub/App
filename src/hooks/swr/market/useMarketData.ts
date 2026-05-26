import { useMemo } from 'react';
import { useApi } from '../useApi';
import {
  MarketBrowseCategory,
  ListingItem,
  MarketListResponse,
  MarketPackageKind,
  MarketShipFocusFilter,
  MarketShipTraitFilter,
  MarketSortMode,
  MarketItemType,
  Ship,
  ShipsData,
} from '@/types';

export interface UseMarketDataParams {
  search?: string;
  inStockOnly?: boolean;
  groupCcus?: boolean;
  itemTypes?: MarketItemType[];
  packageKinds?: MarketPackageKind[];
  packageItems?: string[];
  browseCategories?: MarketBrowseCategory[];
  tags?: string[];
  shipTraits?: MarketShipTraitFilter[];
  shipFocuses?: MarketShipFocusFilter[];
  manufacturerIds?: number[];
  sortBy?: MarketSortMode;
  page?: number;
  limit?: number;
}

function buildMarketSearchPath(params: UseMarketDataParams = {}) {
  const searchParams = new URLSearchParams();

  const search = params.search?.trim();
  if (search) {
    searchParams.set('search', search);
  }

  if (params.inStockOnly) {
    searchParams.set('inStockOnly', 'true');
  }

  if (params.groupCcus === false) {
    searchParams.set('groupCcus', 'false');
  }

  (params.itemTypes || []).forEach((itemType) => {
    searchParams.append('itemType', itemType);
  });

  (params.packageKinds || []).forEach((packageKind) => {
    searchParams.append('packageKind', packageKind);
  });

  (params.packageItems || []).forEach((packageItem) => {
    const trimmed = packageItem.trim();
    if (trimmed) {
      searchParams.append('packageItem', trimmed);
    }
  });

  (params.browseCategories || []).forEach((browseCategory) => {
    searchParams.append('browseCategory', browseCategory);
  });

  (params.tags || []).forEach((tag) => {
    searchParams.append('tag', tag);
  });

  (params.shipTraits || []).forEach((shipTrait) => {
    searchParams.append('shipTrait', shipTrait);
  });

  (params.shipFocuses || []).forEach((shipFocus) => {
    const trimmed = shipFocus.trim();
    if (trimmed) {
      searchParams.append('shipFocus', trimmed);
    }
  });

  (params.manufacturerIds || []).forEach((manufacturerId) => {
    if (Number.isInteger(manufacturerId) && manufacturerId > 0) {
      searchParams.append('manufacturerId', String(manufacturerId));
    }
  });

  if (params.sortBy) {
    searchParams.set('sortBy', params.sortBy);
  }

  if (typeof params.page === 'number') {
    searchParams.set('page', String(params.page));
  }

  if (typeof params.limit === 'number') {
    searchParams.set('limit', String(params.limit));
  }

  const query = searchParams.toString();
  return query ? `/api/market/search?${query}` : '/api/market/search';
}

export default function useMarketData(params: UseMarketDataParams = {}) {
  const itemTypesKey = (params.itemTypes || []).join(',');
  const packageKindsKey = (params.packageKinds || []).join(',');
  const packageItemsKey = (params.packageItems || []).join(',');
  const browseCategoriesKey = (params.browseCategories || []).join(',');
  const tagsKey = (params.tags || []).join(',');
  const shipTraitsKey = (params.shipTraits || []).join(',');
  const shipFocusesKey = (params.shipFocuses || []).join(',');
  const manufacturerIdsKey = (params.manufacturerIds || []).join(',');
  const marketPath = useMemo(() => buildMarketSearchPath(params), [
    browseCategoriesKey,
    itemTypesKey,
    packageKindsKey,
    packageItemsKey,
    manufacturerIdsKey,
    params.inStockOnly,
    params.groupCcus,
    params.limit,
    params.page,
    params.search,
    params.sortBy,
    shipFocusesKey,
    shipTraitsKey,
    tagsKey,
  ]);

  const {
    data: shipsData,
    error: shipsError,
    isLoading: shipsLoading,
    isValidating: shipsValidating,
  } = useApi<ShipsData>('/api/ships');

  const {
    data: marketResponse,
    error: marketError,
    isLoading: marketLoading,
    isValidating: marketValidating,
  } = useApi<MarketListResponse>(marketPath, {
    keepPreviousData: true,
  });

  const ships = useMemo(() => {
    if (!shipsData) return [];
    return [...shipsData.data.ships].sort((a: Ship, b: Ship) => a.msrp - b.msrp);
  }, [shipsData]);

  const hasInitialData = Boolean(shipsData) && Boolean(marketResponse);
  const loading = !hasInitialData && (shipsLoading || marketLoading);
  const refreshing = hasInitialData && (shipsValidating || marketValidating);
  const error = shipsError || marketError ? 'Failed to load data' : null;

  return {
    ships,
    listingItems: marketResponse?.items || ([] as ListingItem[]),
    pagination: marketResponse?.pagination || {
      total: 0,
      page: params.page || 0,
      limit: params.limit || 12,
      totalPages: 0,
    },
    loading,
    refreshing,
    error,
  };
}
