import { useState, useEffect } from 'react';
import { ListingItem, Ship, ShipsData } from '../../../types';

export default function useMarketData() {
  const [ships, setShips] = useState<Ship[]>([]);
  const [listingItems, setListingItems] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        // 并发发送请求
        const [shipsResponse, listingItemsResponse] = await Promise.all([
          fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/ships`, {
            signal: abortController.signal
          }),
          fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/list`, {
            signal: abortController.signal
          })
        ]);

        if (!shipsResponse.ok || !listingItemsResponse.ok) {
          throw new Error('Network response error');
        }

        // 并发处理响应数据
        const [shipsData, listingItemsData] = await Promise.all([
          shipsResponse.json() as Promise<ShipsData>,
          listingItemsResponse.json()
        ]);

        setShips(shipsData.data.ships.sort((a: Ship, b: Ship) => a.msrp - b.msrp));
        setListingItems(listingItemsData);
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

  return { ships, listingItems, loading, error };
} 