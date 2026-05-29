import { MarketHomeSettingsResponse } from '@/types';
import { useApi, useAuthApi } from '../useApi';

export function useMarketHomeSettings(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;

  return useApi<MarketHomeSettingsResponse>(enabled ? '/api/market/home-settings' : null, {
    revalidateOnFocus: false,
  });
}

export function useAdminMarketHomeSettings() {
  return useAuthApi<MarketHomeSettingsResponse>('/api/admin/market/home-settings', {
    revalidateOnFocus: false,
  });
}
