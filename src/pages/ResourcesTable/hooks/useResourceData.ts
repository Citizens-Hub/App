import { useState, useEffect } from 'react';
import { Resource, ResourcesData } from '../../../types';

export default function useResourceData() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        const response = await fetch('/data.json', {
          signal: abortController.signal
        });
        if (!response.ok) {
          throw new Error('网络响应错误');
        }
        const data: ResourcesData[] = await response.json();
        setResources(data[0].data.store.listing.resources);

        const exchangeRateResponse = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', {
          signal: abortController.signal
        });
        if (!exchangeRateResponse.ok) {
          throw new Error('汇率获取失败');
        }
        const exchangeRateData = await exchangeRateResponse.json();
        setExchangeRate(exchangeRateData.usd.cny);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError('加载数据失败');
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      abortController.abort();
    };
  }, []);

  return { resources, loading, error, exchangeRate };
} 