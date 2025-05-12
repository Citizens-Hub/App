import { useState, useEffect } from 'react';
import { Ship, ShipsData } from '../../../types';

export default function useResourceData() {
  const [ships, setShips] = useState<Ship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        const shipsResponse = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/ships`, {
          signal: abortController.signal
        });
        if (!shipsResponse.ok) {
          throw new Error('Network response error');
        }
        const shipsData: ShipsData = await shipsResponse.json();
        setShips(shipsData.data.ships.sort((a, b) => a.msrp - b.msrp));
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

  return { ships, loading, error };
} 