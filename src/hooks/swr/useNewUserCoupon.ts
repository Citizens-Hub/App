import { useAuthApi } from './useApi';
import {
  AdminReferralListResponse,
  NewUserCouponPreview,
  NewUserCouponSettings,
  ReferralProgramOverview,
  UserCouponsOverview,
} from '@/types';

export interface AdminReferralListParams {
  page?: number;
  limit?: number;
  query?: string;
}

export function useNewUserCoupon() {
  return useAuthApi<NewUserCouponPreview>('/api/user/new-user-coupon');
}

export function useAdminNewUserCouponSettings() {
  return useAuthApi<NewUserCouponSettings>('/api/admin/new-user-coupon-settings');
}

export function useReferralProgram() {
  return useAuthApi<ReferralProgramOverview>('/api/user/referral-program');
}

export function useMyCoupons() {
  return useAuthApi<UserCouponsOverview>('/api/user/coupons');
}

export function useAdminReferrals(params: AdminReferralListParams) {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page || 1));
  searchParams.set('limit', String(params.limit || 50));

  const query = params.query?.trim();
  if (query) {
    searchParams.set('query', query);
  }

  return useAuthApi<AdminReferralListResponse>(`/api/admin/referrals?${searchParams.toString()}`, {
    keepPreviousData: true,
  });
}
