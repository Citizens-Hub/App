import { useMemo } from 'react';
import { useApi, useAuthApi } from '../useApi';
import { Order, Ship, ShipsData, UserRole } from '@/types';

const EMPTY_ORDERS: Order[] = [];
const EMPTY_SHIPS: Ship[] = [];

// 用户信息类型
interface UserInfo {
  id: string;
  email: string;
  name: string;
  avatar: string;
  role: UserRole;
  emailVerified: boolean;
}

export default function useOrdersData() {
  // 使用SWR获取船只数据
  const { 
    data: shipsData,
    error: shipsError,
    isLoading: shipsLoading 
  } = useApi<ShipsData>('/api/ships');

  // 使用SWR获取订单数据（需要认证）
  const { 
    data: ordersData,
    error: ordersError,
    isLoading: ordersLoading,
    mutate
  } = useAuthApi<Order[]>('/api/orders');

  // 使用SWR获取用户信息（需要认证）
  const { 
    data: userInfoData,
    error: userInfoError,
    isLoading: userInfoLoading 
  } = useAuthApi<UserInfo>('/api/auth/user');

  // 处理和排序船只数据
  const ships = useMemo(() => {
    if (!shipsData) return EMPTY_SHIPS;
    return [...shipsData.data.ships].sort((a: Ship, b: Ship) => a.msrp - b.msrp);
  }, [shipsData]);

  // 加载状态和错误处理
  const loading = shipsLoading || ordersLoading || userInfoLoading;
  const error = (shipsError || ordersError || userInfoError) 
    ? 'Failed to load data' : null;

  return { 
    ships, 
    orders: ordersData ?? EMPTY_ORDERS,
    userInfo: userInfoData || null,
    loading, 
    error,
    mutate
  };
} 
