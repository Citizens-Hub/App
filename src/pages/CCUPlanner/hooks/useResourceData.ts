import { useState, useEffect } from 'react';
import { Ccu, Ship, CcusData, ShipsData, WbHistoryData } from '../../../types';

export default function useResourceData() {
  const [ccus, setCcus] = useState<Ccu[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [wbHistory, setWbHistory] = useState<WbHistoryData[]>([]);

  useEffect(() => {
    const currentVersion = '1.0.1';
    const lastVisitVersion = localStorage.getItem('ccuPlannerLastVisit');
    
    if (!lastVisitVersion || lastVisitVersion !== currentVersion) {
      setShowNewsModal(true);
      localStorage.setItem('ccuPlannerLastVisit', currentVersion);
    }

    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        const ccusResponse = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/ccus`, {
          signal: abortController.signal
        });
        if (!ccusResponse.ok) {
          throw new Error('Network response error');
        }
        const ccusData: CcusData = await ccusResponse.json();
        setCcus(ccusData.data.to.ships);

        const shipsResponse = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/ships`, {
          signal: abortController.signal
        });
        if (!shipsResponse.ok) {
          throw new Error('Network response error');
        }
        const shipsData: ShipsData = await shipsResponse.json();
        setShips(shipsData.data.ships.sort((a, b) => a.msrp - b.msrp));

        const wbHistoryResponse = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/wbs/history`, {
          signal: abortController.signal
        });
        if (!wbHistoryResponse.ok) {
          throw new Error('Network response error');
        }
        const wbHistoryData: WbHistoryData[] = (await wbHistoryResponse.json()).data;
        setWbHistory(wbHistoryData);
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

  const closeNewsModal = () => {
    setShowNewsModal(false);
  };

  return { ccus, ships, wbHistory, loading, error, showNewsModal, closeNewsModal };
} 