import useSWR from 'swr';
import { ResourcesData } from '@/types';
import { fetcher } from '../swr-config';
import { useApi } from '../useApi';

// 汇率API响应类型
interface CurrencyResponse {
  usd: {
    cny: number;
    [key: string]: number;
  };
}

export default function useResourceData() {
  // 使用SWR获取资源数据
  const { 
    data: resourcesData,
    error: resourcesError,
    isLoading: resourcesLoading 
  } = useSWR<ResourcesData[]>('/data.json', fetcher);

  // 使用API钩子获取汇率数据
  const { 
    data: exchangeRateData,
    error: exchangeRateError,
    isLoading: exchangeRateLoading 
  } = useApi<CurrencyResponse>('/api/currency');

  // 处理资源数据
  const resources = resourcesData?.[0]?.data?.store?.listing?.resources || [];

  // 处理汇率数据
  const exchangeRate = exchangeRateData?.usd?.cny || 0;

  // 加载状态和错误处理
  const loading = resourcesLoading || exchangeRateLoading;
  const error = resourcesError 
    ? '加载数据失败' 
    : exchangeRateError 
      ? '汇率获取失败' 
      : null;

  return { 
    resources, 
    loading, 
    error, 
    exchangeRate 
  };
} 