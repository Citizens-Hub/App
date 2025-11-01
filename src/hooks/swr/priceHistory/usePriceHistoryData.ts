import { useMemo } from 'react';
import { PriceHistoryData } from '@/types';
import { useApi } from '@/hooks';

/**
 * Hook to fetch and manage price history data
 */
export default function usePriceHistoryData() {
  // Use API to fetch price history data
  const { 
    data: priceHistoryData, 
    error, 
    isLoading: loading
  } = useApi<PriceHistoryData>('/api/ccus/history');

  // Process and cache price history data
  const { priceHistoryMap } = useMemo(() => {
    if (!priceHistoryData || !priceHistoryData.entities) {
      return { priceHistoryMap: {} };
    }

    // The data structure has entities directly
    const entities = priceHistoryData.entities;
    
    // Create ID to PriceHistoryEntity mapping
    const mapping: Record<number, PriceHistoryData['entities'][string]> = {};
    Object.entries(entities).forEach(([id, entity]) => {
      mapping[Number(id)] = entity;
    });

    return { 
      priceHistoryMap: mapping
    };
  }, [priceHistoryData]);

  /**
   * Get price history by ship ID
   */
  const getPriceHistoryById = (id: number): PriceHistoryData['entities'][string] | undefined => {
    return priceHistoryMap[id];
  };

  return { 
    priceHistoryMap,
    loading, 
    error: error ? 'Failed to load price history data' : null, 
    getPriceHistoryById,
    updatedAt: priceHistoryData?.updatedAt
  };
}
