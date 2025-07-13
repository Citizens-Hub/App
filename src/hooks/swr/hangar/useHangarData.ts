import { useMemo } from 'react';
import { useApi } from '../useApi';
import useSWR from 'swr';
import { Ship, ShipsData } from '../../../types';
import { fetcher } from '../swr-config';

// 汇率API响应类型
interface ExchangeRateResponse {
  usd: Record<string, number>;
  date: string;
}

export default function useHangarData() {
  // 使用SWR获取船只数据
  const { 
    data: shipsData,
    error: shipsError,
    isLoading: shipsLoading 
  } = useApi<ShipsData>('/api/ships');

  // 使用SWR获取汇率数据（外部API）
  const { 
    data: exchangeRateData,
    error: exchangeRateError,
    isLoading: exchangeRateLoading 
  } = useSWR<ExchangeRateResponse>(
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    fetcher
  );

  // 处理和排序船只数据
  const ships = useMemo(() => {
    if (!shipsData) return [];
    return [...shipsData.data.ships].sort((a: Ship, b: Ship) => a.msrp - b.msrp);
  }, [shipsData]);

  // 处理汇率数据
  const exchangeRates = exchangeRateData?.usd || {};

  // 加载状态和错误处理
  const loading = shipsLoading || exchangeRateLoading;
  const error = (shipsError || exchangeRateError) ? 'Failed to load data' : null;

  return { 
    ships, 
    exchangeRates, 
    loading, 
    error 
  };
} 