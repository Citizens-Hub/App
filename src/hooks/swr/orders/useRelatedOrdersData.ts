import { useState } from 'react';
import { useAuthApi } from '../useApi';
import { Order, UserInfo } from '@/types';

// 分页信息类型
interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// API响应类型
interface RelatedOrdersResponse {
  orders: Order[];
  pagination: Pagination;
}

interface UserInfoResponse {
  success: boolean;
  user: UserInfo;
}

/**
 * 获取分页相关订单数据的hook
 * @param page 当前页码
 * @param pageSize 每页条数
 */
export default function useRelatedOrdersData(page: number = 1, pageSize: number = 10) {
  const [currentPage, setCurrentPage] = useState(page);

  // 使用SWR获取订单数据（需要认证）
  const {
    data,
    error,
    isLoading,
    mutate
  } = useAuthApi<RelatedOrdersResponse>(`/api/orders/related/${currentPage}?pageSize=${pageSize}`);

  const {
    data: userInfoData,
    error: userInfoError,
    isLoading: userInfoLoading,
  } = useAuthApi<UserInfoResponse>('/api/auth/user');

  // 页面变更处理函数
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  return {
    orders: data?.orders || [],
    userInfo: userInfoData?.user || null,
    pagination: data?.pagination || { total: 0, page: currentPage, pageSize, totalPages: 0 },
    loading: isLoading || userInfoLoading,
    error: (error || userInfoError) ? 'Failed to load related orders' : null,
    handlePageChange,
    refresh: mutate
  };
} 
