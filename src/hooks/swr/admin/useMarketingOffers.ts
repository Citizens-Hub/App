import { useAuthApi } from '../useApi';
import {
  AdminMarketingEmailCampaignListResponse,
  AdminMarketingOfferListResponse,
  AdminPromotionListResponse,
  AdminResellerSearchResponse,
  AdminUserSearchResponse,
  MarketBrowseCategory,
  MarketItemType,
  MarketListResponse,
  MarketPackageKind,
  MarketShipTraitFilter,
  MarketSortMode,
} from '@/types';

export interface AdminMarketSearchParams {
  search?: string;
  inStockOnly?: boolean;
  groupCcus?: boolean;
  itemTypes?: MarketItemType[];
  packageKinds?: MarketPackageKind[];
  browseCategories?: MarketBrowseCategory[];
  tags?: string[];
  shipTraits?: MarketShipTraitFilter[];
  manufacturerIds?: number[];
  sortBy?: MarketSortMode;
  page?: number;
  limit?: number;
}

function buildAdminMarketSearchPath(params: AdminMarketSearchParams = {}) {
  const searchParams = new URLSearchParams();
  const search = params.search?.trim();

  if (search) searchParams.set('search', search);
  if (params.inStockOnly) searchParams.set('inStockOnly', 'true');
  if (params.groupCcus === false) searchParams.set('groupCcus', 'false');
  (params.itemTypes || []).forEach((itemType) => searchParams.append('itemType', itemType));
  (params.packageKinds || []).forEach((packageKind) => searchParams.append('packageKind', packageKind));
  (params.browseCategories || []).forEach((browseCategory) => searchParams.append('browseCategory', browseCategory));
  (params.tags || []).forEach((tag) => searchParams.append('tag', tag));
  (params.shipTraits || []).forEach((shipTrait) => searchParams.append('shipTrait', shipTrait));
  (params.manufacturerIds || []).forEach((manufacturerId) => {
    if (Number.isInteger(manufacturerId) && manufacturerId > 0) {
      searchParams.append('manufacturerId', String(manufacturerId));
    }
  });
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (typeof params.page === 'number') searchParams.set('page', String(params.page));
  if (typeof params.limit === 'number') searchParams.set('limit', String(params.limit));

  const query = searchParams.toString();
  return `/api/admin/market/search${query ? `?${query}` : ''}`;
}

export function useAdminMarketingOffers(params?: { page?: number; limit?: number; search?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.search?.trim()) searchParams.set('search', params.search.trim());

  const query = searchParams.toString();
  return useAuthApi<AdminMarketingOfferListResponse>(`/api/admin/marketing-offers${query ? `?${query}` : ''}`);
}

export function useAdminMarketingEmailCampaigns(params?: { page?: number; limit?: number; search?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.search?.trim()) searchParams.set('search', params.search.trim());

  const query = searchParams.toString();
  return useAuthApi<AdminMarketingEmailCampaignListResponse>(`/api/admin/marketing-email-campaigns${query ? `?${query}` : ''}`);
}

export function useAdminPromotions(params?: { page?: number; limit?: number; search?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.search?.trim()) searchParams.set('search', params.search.trim());

  const query = searchParams.toString();
  return useAuthApi<AdminPromotionListResponse>(`/api/admin/promotions${query ? `?${query}` : ''}`);
}

export function useAdminUserSearch(query: string) {
  const trimmedQuery = query.trim();
  return useAuthApi<AdminUserSearchResponse>(
    trimmedQuery ? `/api/admin/users/search?q=${encodeURIComponent(trimmedQuery)}` : null,
    {
      keepPreviousData: true,
    },
  );
}

export function useAdminResellerSearch(query: string) {
  const trimmedQuery = query.trim();
  const searchParams = new URLSearchParams();
  if (trimmedQuery) {
    searchParams.set('q', trimmedQuery);
  }
  searchParams.set('limit', '50');

  return useAuthApi<AdminResellerSearchResponse>(
    `/api/admin/accounting/resellers?${searchParams.toString()}`,
    {
      keepPreviousData: true,
    },
  );
}

export function useAdminMarketSearch(params?: AdminMarketSearchParams) {
  return useAuthApi<MarketListResponse>(buildAdminMarketSearchPath(params), {
    keepPreviousData: true,
  });
}
