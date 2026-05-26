import { useApi } from '../useApi';
import { MarketReviewsResponse } from '@/types';

export function useMarketReviews(limit = 12) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 24) : 12;

  return useApi<MarketReviewsResponse>(`/api/market/reviews?limit=${normalizedLimit}`, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
}

