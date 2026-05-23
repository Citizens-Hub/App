import { useMemo } from 'react';
import { useApi } from '../useApi';
import { AccountListingItem, AccountMarketListResponse, ShipsData, Ship } from '@/types';

export interface UseAccountMarketDataParams {
  search?: string;
  page?: number;
  limit?: number;
}

function buildAccountMarketSearchPath(params: UseAccountMarketDataParams = {}) {
  const searchParams = new URLSearchParams();

  const search = params.search?.trim();
  if (search) {
    searchParams.set('search', search);
  }

  if (typeof params.page === 'number') {
    searchParams.set('page', String(params.page));
  }

  if (typeof params.limit === 'number') {
    searchParams.set('limit', String(params.limit));
  }

  const query = searchParams.toString();
  return query ? `/api/account-market/search?${query}` : '/api/account-market/search';
}

export default function useAccountMarketData(params: UseAccountMarketDataParams = {}) {
  const accountMarketPath = useMemo(() => buildAccountMarketSearchPath(params), [
    params.limit,
    params.page,
    params.search,
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
  } = useApi<AccountMarketListResponse>(accountMarketPath, {
    keepPreviousData: true,
  });

  const ships = useMemo(() => {
    if (!shipsData) return [];
    return [...shipsData.data.ships].sort((a: Ship, b: Ship) => a.msrp - b.msrp);
  }, [shipsData]);

  const hasInitialData = Boolean(shipsData) && Boolean(marketResponse);
  const loading = !hasInitialData && (shipsLoading || marketLoading);
  const refreshing = hasInitialData && (shipsValidating || marketValidating);
  const error = shipsError || marketError ? 'Failed to load account market data' : null;

  return {
    ships,
    listingItems: marketResponse?.items || ([] as AccountListingItem[]),
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
