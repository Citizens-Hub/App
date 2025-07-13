import { SWRConfiguration } from 'swr';

// 创建默认的fetcher函数
export const fetcher = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, options);
  
  if (!res.ok) {
    const error = new Error('API request failed') as Error & {
      info?: unknown;
      status?: number;
    };
    error.info = await res.json();
    error.status = res.status;
    throw error;
  }
  
  return res.json();
};

// 带认证的fetcher
export const authFetcher = (token?: string) => async (url: string) => {
  return fetcher(url, {
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json'
    }
  });
};

// SWR默认配置
export const swrConfig: SWRConfiguration = {
  fetcher,
  refreshInterval: 0,
  revalidateOnFocus: false,
  shouldRetryOnError: false,
  // dedupingInterval: 5 * 60 * 1000, // Deduplicate requests with the same key in this time span (ms)
  // By default, SWR caches data based on the URL key. Non-authenticated requests with the same URL will use cached data.
};

export default swrConfig; 