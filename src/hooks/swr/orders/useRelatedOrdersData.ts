import { useState } from 'react';
import { useAuthApi } from '../useApi';

// 订单项类型
interface OrderItem {
  id: number;
  quantity: number;
  cancelledQuantity: number | null;
  price: number;
  shipped: boolean;
  createdAt: string;
  updatedAt: string;
  marketItem: {
    name: string;
    skuId: string;
    itemType: string;
    fromShipId: number | null;
    toShipId: number | null;
    shipId: number | null;
    belongsTo: string;
  };
}

// 订单类型
interface Order {
  id: number;
  belongsTo: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

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

  // 页面变更处理函数
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  return {
    orders: data?.orders || [],
    pagination: data?.pagination || { total: 0, page: currentPage, pageSize, totalPages: 0 },
    loading: isLoading,
    error: error ? 'Failed to load related orders' : null,
    handlePageChange,
    refresh: mutate
  };
} 