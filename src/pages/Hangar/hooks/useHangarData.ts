import { useState, useEffect } from 'react';
import { Ship, ShipsData } from '../../../types';

export default function useHangarData() {
  const [ships, setShips] = useState<Ship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exchangeRates, setExchangeRates] = useState({});

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        // 并发发送请求
        const [shipsResponse, exchangeRatesResponse] = await Promise.all([
          fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/ships`, {
            signal: abortController.signal
          }),
          fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", {
            signal: abortController.signal
          })
        ]);

        if (!shipsResponse.ok || !exchangeRatesResponse.ok) {
          throw new Error('Network response error');
        }

        // 并发处理响应数据
        const [shipsData, exchangeRateData] = await Promise.all([
          shipsResponse.json() as Promise<ShipsData>,
          exchangeRatesResponse.json()
        ]);

        setShips(shipsData.data.ships.sort((a: Ship, b: Ship) => a.msrp - b.msrp));
        setExchangeRates(exchangeRateData.usd);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError('Failed to load data');
        console.error('Error fetching data:', err);
      } finally {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));

        setLoading(false);
      }
    };

    fetchData();

    return () => {
      abortController.abort();
    };
  }, []);

  return { ships, exchangeRates, loading, error };
} 