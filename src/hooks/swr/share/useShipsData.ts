import { useMemo } from 'react';
import { useApi } from '../useApi';
import { Ship, ShipsData } from '@/types';

/**
 * Hook to fetch and manage ships data
 */
export default function useShipsData() {
  // 使用SWR获取船只数据
  const { 
    data: shipsData, 
    error, 
    isLoading: loading 
  } = useApi<ShipsData>('/api/ships');

  // 处理和缓存船只数据
  const { ships, shipsMap } = useMemo(() => {
    if (!shipsData) {
      return { ships: [], shipsMap: {} };
    }

    // 按价格排序船只
    const sortedShips = [...shipsData.data.ships].sort(
      (a: Ship, b: Ship) => a.msrp - b.msrp
    );
    
    // 创建ID到Ship的映射，方便查找
    const shipsMapping: Record<number, Ship> = {};
    sortedShips.forEach(ship => {
      shipsMapping[ship.id] = ship;
    });

    return { 
      ships: sortedShips, 
      shipsMap: shipsMapping 
    };
  }, [shipsData]);

  /**
   * 通过ID获取船只信息
   */
  const getShipById = (id: number): Ship | undefined => {
    return shipsMap[id];
  };

  /**
   * 通过ID获取船只名称，如果不存在则返回ID字符串
   */
  const getShipNameById = (id: number): string => {
    return shipsMap[id]?.name || `Ship #${id}`;
  };

  /**
   * 获取船只图片
   */
  const getShipImageById = (id: number): string | undefined => {
    return shipsMap[id]?.medias?.productThumbMediumAndSmall;
  };

  return { 
    ships, 
    loading, 
    error: error ? 'Failed to load ships data' : null, 
    getShipById, 
    getShipNameById,
    getShipImageById
  };
} 