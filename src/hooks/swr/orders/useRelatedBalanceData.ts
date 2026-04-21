import { useState } from 'react';
import { useAuthApi } from '../useApi';
import { ResellerBalanceResponse } from '@/types';

export default function useRelatedBalanceData(page: number = 1, pageSize: number = 10) {
  const [currentPage, setCurrentPage] = useState(page);

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useAuthApi<ResellerBalanceResponse>(`/api/orders/related/balance?page=${currentPage}&pageSize=${pageSize}`);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  return {
    summary: data?.summary || {
      currency: 'USD',
      availableBalance: 0,
      pendingBalance: 0,
      totalRevenue: 0,
      orderCount: 0,
      transactionCount: 0,
      availableCount: 0,
      pendingCount: 0,
      pendingWithdrawalAmount: 0,
      paidWithdrawalAmount: 0,
      withdrawableBalance: 0,
      lastSaleAt: null,
    },
    transactions: data?.transactions || [],
    pagination: data?.pagination || {
      total: 0,
      page: currentPage,
      pageSize,
      totalPages: 0,
    },
    loading: isLoading,
    error: error ? 'Failed to load reseller balance' : null,
    handlePageChange,
    refresh: mutate,
  };
}
