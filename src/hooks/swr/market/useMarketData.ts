import { useMemo } from 'react';
import { useApi } from '../useApi';
import {
  ListingItem,
  MarketListResponse,
  MarketPackageKind,
  MarketSortMode,
  MarketItemType,
  Ship,
  ShipsData,
} from '@/types';

export interface UseMarketDataParams {
  search?: string;
  inStockOnly?: boolean;
  itemTypes?: MarketItemType[];
  packageKinds?: MarketPackageKind[];
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

  (params.itemTypes || []).forEach((itemType) => {
    searchParams.append('itemType', itemType);
  });

  (params.packageKinds || []).forEach((packageKind) => {
    searchParams.append('packageKind', packageKind);
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
  const marketPath = useMemo(() => buildMarketSearchPath(params), [
    itemTypesKey,
    packageKindsKey,
    params.inStockOnly,
    params.limit,
    params.page,
    params.search,
    params.sortBy,
  ]);

  const {
    data: shipsData,
    error: shipsError,
    isLoading: shipsLoading,
  } = useApi<ShipsData>('/api/ships');

  const {
    data: marketResponse,
    error: marketError,
    isLoading: marketLoading,
  } = useApi<MarketListResponse>(marketPath, {
    keepPreviousData: true,
  });

  const ships = useMemo(() => {
    if (!shipsData) return [];
    return [...shipsData.data.ships].sort((a: Ship, b: Ship) => a.msrp - b.msrp);
  }, [shipsData]);

  const loading = shipsLoading || marketLoading;
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
    error,
  };
}
