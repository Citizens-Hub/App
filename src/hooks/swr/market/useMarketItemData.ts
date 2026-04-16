import { useMemo } from 'react';
import { useApi } from '../useApi';
import { ListingItem, Ship, ShipsData } from '@/types';

type FetchError = Error & {
  status?: number;
};

export default function useMarketItemData(skuId?: string) {
  const itemPath = skuId ? `/api/market/item/${encodeURIComponent(skuId)}` : null;

  const {
    data: item,
    error: itemError,
    isLoading: itemLoading,
  } = useApi<ListingItem>(itemPath);

  const {
    data: shipsData,
    error: shipsError,
    isLoading: shipsLoading,
  } = useApi<ShipsData>('/api/ships');

  const ships = useMemo(() => {
    if (!shipsData) return [];
    return [...shipsData.data.ships].sort((a: Ship, b: Ship) => a.msrp - b.msrp);
  }, [shipsData]);

  const loading = itemLoading || shipsLoading;
  const notFound = (itemError as FetchError | undefined)?.status === 404;
  const error = shipsError || (itemError && !notFound) ? 'Failed to load data' : null;

  return {
    item: notFound ? null : item || null,
    ships,
    loading,
    error,
    notFound,
  };
}
