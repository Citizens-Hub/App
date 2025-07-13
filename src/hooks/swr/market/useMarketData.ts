import { useMemo } from 'react';
import { useApi } from '../useApi';
import { ListingItem, Ship, ShipsData } from '../../../types';

export default function useMarketData() {
  // 使用SWR获取船只数据
  const { 
    data: shipsData, 
    error: shipsError,
    isLoading: shipsLoading 
  } = useApi<ShipsData>('/api/ships');
  
  // 使用SWR获取市场列表数据
  const { 
    data: listingItemsData, 
    error: listingError,
    isLoading: listingLoading 
  } = useApi<ListingItem[]>('/api/market/list');

  // 处理和排序船只数据
  const ships = useMemo(() => {
    if (!shipsData) return [];
    return [...shipsData.data.ships].sort((a: Ship, b: Ship) => a.msrp - b.msrp);
  }, [shipsData]);

  // 加载状态和错误处理
  const loading = shipsLoading || listingLoading;
  const error = shipsError || listingError ? 'Failed to load data' : null;

  return { 
    ships, 
    listingItems: listingItemsData || [], 
    loading, 
    error 
  };
} 