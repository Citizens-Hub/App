import { MarketHomeSettingsResponse } from '@/types';
import { useApi, useAuthApi } from '../useApi';

export function useMarketHomeSettings() {
  return useApi<MarketHomeSettingsResponse>('/api/market/home-settings', {
    revalidateOnFocus: false,
  });
}

export function useAdminMarketHomeSettings() {
  return useAuthApi<MarketHomeSettingsResponse>('/api/admin/market/home-settings', {
    revalidateOnFocus: false,
  });
}
