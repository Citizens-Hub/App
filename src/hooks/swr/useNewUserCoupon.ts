import { useAuthApi } from './useApi';
import { NewUserCouponPreview, NewUserCouponSettings } from '@/types';

export function useNewUserCoupon() {
  return useAuthApi<NewUserCouponPreview>('/api/user/new-user-coupon');
}

export function useAdminNewUserCouponSettings() {
  return useAuthApi<NewUserCouponSettings>('/api/admin/new-user-coupon-settings');
}
