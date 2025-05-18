import { useState, useEffect } from 'react';
import { Ccu, Ship, WbHistoryData } from '../../../types';

export default function useResourceData() {
  const [ccus, setCcus] = useState<Ccu[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [wbHistory, setWbHistory] = useState<WbHistoryData[]>([]);
  const [exchangeRates, setExchangeRates] = useState({});

  useEffect(() => {
    const currentVersion = '1.0.2';
    const lastVisitVersion = localStorage.getItem('ccuPlannerLastVisit');
    
    if (!lastVisitVersion || lastVisitVersion !== currentVersion) {
      setShowNewsModal(true);
      localStorage.setItem('ccuPlannerLastVisit', currentVersion);
    }

    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        const [ccusResponse, shipsResponse, wbHistoryResponse, exchangeRateResponse] = await Promise.all([
          fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/ccus`, {
            signal: abortController.signal
          }),
          fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/ships`, {
            signal: abortController.signal
          }),
          fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/wbs/history`, {
            signal: abortController.signal
          }),
          fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', {
            signal: abortController.signal
          })
        ]);

        if (!ccusResponse.ok || !shipsResponse.ok || !wbHistoryResponse.ok || !exchangeRateResponse.ok) {
          throw new Error('Network response error');
        }

        const [ccusData, shipsData, wbHistoryData, exchangeRateData] = await Promise.all([
          ccusResponse.json(),
          shipsResponse.json(),
          wbHistoryResponse.json(),
          exchangeRateResponse.json()
        ]);

        setCcus(ccusData.data.to.ships);
        setShips(shipsData.data.ships.sort((a: Ship, b: Ship) => a.msrp - b.msrp));
        setWbHistory(wbHistoryData.data);
        setExchangeRates(exchangeRateData.usd);
        
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError('Failed to load data');
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

  const closeNewsModal = () => {
    setShowNewsModal(false);
  };

  return { ccus, ships, wbHistory, exchangeRates, loading, error, showNewsModal, closeNewsModal };
} 