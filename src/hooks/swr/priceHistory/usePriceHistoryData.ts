import { useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '../swr-config';
import { PriceHistoryData } from '@/types';

/**
 * Hook to fetch and manage price history data
 */
export default function usePriceHistoryData() {
  // Use SWR to fetch price history data
  const { 
    data: priceHistoryData, 
    error, 
    isLoading: loading 
  } = useSWR<PriceHistoryData[]>('/data/price_history.json', fetcher);

  // Process and cache price history data
  const { priceHistoryMap } = useMemo(() => {
    if (!priceHistoryData || !Array.isArray(priceHistoryData) || priceHistoryData.length === 0) {
      return { priceHistoryMap: {} };
    }

    // The data structure is an array with entities
    const entities = priceHistoryData[0]?.entities || {};
    
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
    getPriceHistoryById
  };
}
