import { useEffect, useMemo, useState } from 'react';
import { PriceHistoryData } from '@/types';
import { useApi } from '@/hooks';
import { decryptCcuHistoryPayload, type EncryptedCcuHistoryPayload } from '@eduarte/chc';
import wasmUrl from '@eduarte/chc/chc.wasm?url';
import wasmExecUrl from '@eduarte/chc/wasm_exec.js?url';

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

  const [resolvedPriceHistoryData, setResolvedPriceHistoryData] = useState<PriceHistoryData | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolvePriceHistoryData = async () => {
      if (!priceHistoryData) {
        setResolvedPriceHistoryData(null);
        setDecryptError(null);
        setIsDecrypting(false);
        return;
      }

      if (!priceHistoryData.encrypted) {
        setResolvedPriceHistoryData(priceHistoryData);
        setDecryptError(null);
        setIsDecrypting(false);
        return;
      }

      try {
        setIsDecrypting(true);
        setDecryptError(null);
        const payload = priceHistoryData as unknown as EncryptedCcuHistoryPayload;
        const history = await decryptCcuHistoryPayload<PriceHistoryData>(payload, {
          wasmUrl: wasmUrl,
          wasmExecUrl: wasmExecUrl
        });

        if (cancelled) return;
        setResolvedPriceHistoryData(history);
      } catch (decryptErr) {
        if (cancelled) return;
        console.error('Failed to decrypt price history payload', decryptErr);
        setResolvedPriceHistoryData(null);
        setDecryptError('Failed to decrypt price history data');
      } finally {
        if (!cancelled) {
          setIsDecrypting(false);
        }
      }
    };

    void resolvePriceHistoryData();

    return () => {
      cancelled = true;
    };
  }, [priceHistoryData]);

  // Process and cache price history data
  const { priceHistoryMap } = useMemo(() => {
    if (!resolvedPriceHistoryData || !resolvedPriceHistoryData.entities) {
      return { priceHistoryMap: {} };
    }

    // The data structure has entities directly
    const entities = resolvedPriceHistoryData.entities;
    
    // Create ID to PriceHistoryEntity mapping
    const mapping: Record<number, PriceHistoryData['entities'][string]> = {};
    Object.entries(entities).forEach(([id, entity]) => {
      mapping[Number(id)] = entity;
    });

    return { 
      priceHistoryMap: mapping
    };
  }, [resolvedPriceHistoryData]);

  /**
   * Get price history by ship ID
   */
  const getPriceHistoryById = (id: number): PriceHistoryData['entities'][string] | undefined => {
    return priceHistoryMap[id];
  };

  return { 
    priceHistoryMap,
    loading: loading || isDecrypting, 
    error: error ? 'Failed to load price history data' : decryptError, 
    getPriceHistoryById,
    updatedAt: resolvedPriceHistoryData?.updatedAt
  };
}
