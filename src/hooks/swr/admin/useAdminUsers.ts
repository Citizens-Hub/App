import { useAuthApi } from '../useApi';
import { AdminUserListResponse, UserRole } from '@/types';

export interface AdminUserListParams {
  page?: number;
  limit?: number;
  query?: string;
  role?: 'all' | UserRole;
}

export function useAdminUsers(params: AdminUserListParams) {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page || 1));
  searchParams.set('limit', String(params.limit || 50));

  const query = params.query?.trim();
  if (query) {
    searchParams.set('query', query);
  }

  if (params.role !== undefined && params.role !== 'all') {
    searchParams.set('role', String(params.role));
  }

  return useAuthApi<AdminUserListResponse>(`/api/admin/users?${searchParams.toString()}`, {
    keepPreviousData: true,
  });
}
