import { useApi } from '../useApi';
import { MarketReviewsResponse } from '@/types';

export function useMarketReviews(limit = 12, options?: { enabled?: boolean }) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 24) : 12;
  const enabled = options?.enabled !== false;

  return useApi<MarketReviewsResponse>(enabled ? `/api/market/reviews?limit=${normalizedLimit}` : null, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
}
