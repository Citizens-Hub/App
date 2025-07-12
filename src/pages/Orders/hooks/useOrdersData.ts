import { useState, useEffect } from 'react';
import { Order, Ship, ShipsData, ListingItem } from '../../../types';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';

export default function useOrdersData() {
  const [ships, setShips] = useState<Ship[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [listingItems, setListingItems] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { user } = useSelector((state: RootState) => state.user);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        // 并发发送请求
        const [shipsResponse, ordersResponse, listingItemsResponse] = await Promise.all([
          fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/ships`, {
            signal: abortController.signal
          }),
          fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders`, {
            signal: abortController.signal,
            headers: {
              'Authorization': `Bearer ${user?.token}`
            }
          }),
          fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/list`, {
            signal: abortController.signal
          })
        ]);

        if (!shipsResponse.ok || !ordersResponse.ok || !listingItemsResponse.ok) {
          throw new Error('Network response error');
        }

        // 并发处理响应数据
        const [shipsData, ordersData, listingItemsData] = await Promise.all([
          shipsResponse.json() as Promise<ShipsData>,
          ordersResponse.json(),
          listingItemsResponse.json()
        ]);

        setShips(shipsData.data.ships.sort((a: Ship, b: Ship) => a.msrp - b.msrp));
        setOrders(ordersData);
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
  }, [user]);

  return { ships, orders, listingItems, loading, error };
} 