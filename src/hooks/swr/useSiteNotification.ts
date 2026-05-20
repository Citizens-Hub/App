import { useApi, useAuthApi } from './useApi';
import { SiteNotificationResponse } from '@/types';

export function useSiteNotification() {
  return useApi<SiteNotificationResponse>('/api/site-notification', {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });
}

export function useAdminSiteNotification() {
  return useAuthApi<SiteNotificationResponse>('/api/admin/site-notification', {
    revalidateOnFocus: true,
  });
}
