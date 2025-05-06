import { useState, useEffect } from 'react';
import { Ccu, Ship, CcusData, ShipsData } from '../../../types';

export default function useResourceData() {
  const [ccus, setCcus] = useState<Ccu[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewsModal, setShowNewsModal] = useState(false);

  useEffect(() => {
    const currentVersion = '1.0.0';
    const lastVisitVersion = localStorage.getItem('ccuPlannerLastVisit');
    
    if (!lastVisitVersion || lastVisitVersion !== currentVersion) {
      setShowNewsModal(true);
      localStorage.setItem('ccuPlannerLastVisit', currentVersion);
    }

    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        const ccusResponse = await fetch('/ccus.json', {
          signal: abortController.signal
        });
        if (!ccusResponse.ok) {
          throw new Error('Network response error');
        }
        const ccusData: CcusData[] = await ccusResponse.json();
        setCcus(ccusData[0].data.to.ships);

        const shipsResponse = await fetch('/ships.json', {
          signal: abortController.signal
        });
        if (!shipsResponse.ok) {
          throw new Error('Network response error');
        }
        const shipsData: ShipsData[] = await shipsResponse.json();
        setShips(shipsData[0].data.ships.sort((a, b) => a.msrp - b.msrp));
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

  return { ccus, ships, loading, error, showNewsModal, closeNewsModal };
} 