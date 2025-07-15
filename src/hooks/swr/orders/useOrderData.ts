import { useMemo } from 'react';
import { useApi, useAuthApi } from '../useApi';
import { DetailedOrder, Ship, ShipsData, UserRole } from '@/types';

// 用户信息类型
interface UserInfo {
  id: string;
  email: string;
  name: string;
  avatar: string;
  role: UserRole;
  emailVerified: boolean;
}

export default function useOrderData(orderId: string) {
  // 使用SWR获取船只数据
  const { 
    data: shipsData,
    error: shipsError,
    isLoading: shipsLoading 
  } = useApi<ShipsData>('/api/ships');

  // 使用SWR获取订单数据（需要认证）
  const { 
    data: orderData,
    error: orderError,
    isLoading: orderLoading 
  } = useAuthApi<DetailedOrder>(`/api/orders/${orderId}`);

  // 使用SWR获取用户信息（需要认证）
  const { 
    data: userInfoData,
    error: userInfoError,
    isLoading: userInfoLoading 
  } = useAuthApi<UserInfo>('/api/auth/user');

  // 处理和排序船只数据
  const ships = useMemo(() => {
    if (!shipsData) return [];
    return [...shipsData.data.ships].sort((a: Ship, b: Ship) => a.msrp - b.msrp);
  }, [shipsData]);

  // 加载状态和错误处理
  const loading = shipsLoading || orderLoading || userInfoLoading;
  const error = (shipsError || orderError || userInfoError) 
    ? 'Failed to load data' : null;

  return { 
    ships, 
    order: orderData || null,
    userInfo: userInfoData || null,
    loading, 
    error 
  };
} 