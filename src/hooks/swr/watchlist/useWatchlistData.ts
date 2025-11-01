import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useAuthApi } from '../useApi';
import { WatchlistResponse, WatchlistItem } from '@/types';

export default function useWatchlistData() {
  const { user } = useSelector((state: RootState) => state.user);
  
  // Fetch watchlist data (requires authentication)
  const { 
    data: watchlistResponse,
    error: watchlistError,
    isLoading: watchlistLoading,
    mutate: mutateWatchlist
  } = useAuthApi<WatchlistResponse>(
    user.token ? '/api/watchlist' : null
  );

  // Extract watchlist items
  const watchlistItems = useMemo(() => {
    if (!watchlistResponse?.data?.items) return [];
    return watchlistResponse.data.items;
  }, [watchlistResponse]);

  // Extract ship IDs for quick lookup
  const shipIds = useMemo(() => {
    return watchlistItems.map((item: WatchlistItem) => item.shipId);
  }, [watchlistItems]);

  // Check if a ship is in watchlist
  const isInWatchlist = (shipId: number): boolean => {
    return shipIds.includes(shipId);
  };

  // Get watchlist item by ship ID
  const getWatchlistItem = (shipId: number): WatchlistItem | undefined => {
    return watchlistItems.find((item: WatchlistItem) => item.shipId === shipId);
  };

  return {
    watchlistItems,
    shipIds,
    count: watchlistResponse?.data?.count ?? 0,
    isInWatchlist,
    getWatchlistItem,
    loading: watchlistLoading,
    error: watchlistError,
    mutate: mutateWatchlist
  };
}

