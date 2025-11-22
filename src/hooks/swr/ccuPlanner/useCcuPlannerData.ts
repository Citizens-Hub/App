import { useState, useEffect, useMemo } from 'react';
import { Ccu, Ship, WbHistoryData } from '@/types';
import { useApi } from '../useApi';

// API响应类型
interface CcusResponse {
  data: {
    to: {
      ships: Ccu[];
    };
  };
}

interface ShipsResponse {
  data: {
    ships: Ship[];
  };
}

// interface WbHistoryResponse {
//   data: WbHistoryData[];
// }

interface CurrencyResponse {
  usd: Record<string, number>;
}

export default function useCcuPlannerData() {
  // 版本提示状态
  const [showNewsModal, setShowNewsModal] = useState(false);
  
  // 使用SWR获取CCU数据
  const { 
    data: ccusData,
    error: ccusError,
    isLoading: ccusLoading 
  } = useApi<CcusResponse>('/api/ccus');

  // 使用SWR获取船只数据
  const { 
    data: shipsData,
    error: shipsError,
    isLoading: shipsLoading 
  } = useApi<ShipsResponse>('/api/ships');

  // // 使用SWR获取WB历史数据
  // const { 
  //   data: wbHistoryData,
  //   error: wbHistoryError,
  //   isLoading: wbHistoryLoading 
  // } = useApi<WbHistoryResponse>('/api/wbs/history');

  // 使用SWR获取汇率数据
  const { 
    data: exchangeRateData,
    error: exchangeRateError,
    isLoading: exchangeRateLoading 
  } = useApi<CurrencyResponse>('/api/currency');

  // 版本检查
  useEffect(() => {
    const currentVersion = '1.0.2';
    const lastVisitVersion = localStorage.getItem('ccuPlannerLastVisit');
    
    if (!lastVisitVersion || lastVisitVersion !== currentVersion) {
      setShowNewsModal(true);
      localStorage.setItem('ccuPlannerLastVisit', currentVersion);
    }
  }, []);

  // 处理CCU数据
  const ccus = ccusData?.data?.to?.ships || [];

  // 处理和排序船只数据
  const ships = useMemo(() => {
    if (!shipsData?.data?.ships) return [];
    return [...shipsData.data.ships].sort((a: Ship, b: Ship) => a.msrp - b.msrp);
  }, [shipsData]);

  // 处理WB历史数据
  const wbHistory: WbHistoryData[] = [];

  // 处理汇率数据
  const exchangeRates = exchangeRateData?.usd || {};

  // 加载状态和错误处理
  const loading = ccusLoading || shipsLoading || exchangeRateLoading;
  const error = (ccusError || shipsError || exchangeRateError) 
    ? 'Failed to load data' : null;

  const closeNewsModal = () => {
    setShowNewsModal(false);
  };

  return { 
    ccus, 
    ships, 
    wbHistory, 
    exchangeRates, 
    loading, 
    error, 
    showNewsModal, 
    closeNewsModal 
  };
} 