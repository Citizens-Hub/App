import { useApi } from '../useApi';
import { MarketReviewsResponse } from '@/types';

export function useMarketReviews(limit = 12, options?: { enabled?: boolean; page?: number; rating?: number | null }) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 24) : 12;
  const requestedPage = options?.page ?? 0;
  const requestedRating = options?.rating ?? null;
  const normalizedPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 0;
  const normalizedRating = typeof requestedRating === 'number' && Number.isInteger(requestedRating) && requestedRating >= 1 && requestedRating <= 5
    ? requestedRating
    : null;
  const enabled = options?.enabled !== false;
  const searchParams = new URLSearchParams({
    limit: String(normalizedLimit),
    page: String(normalizedPage),
  });

  if (normalizedRating) {
    searchParams.set('rating', String(normalizedRating));
  }

  return useApi<MarketReviewsResponse>(enabled ? `/api/market/reviews?${searchParams.toString()}` : null, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
}
