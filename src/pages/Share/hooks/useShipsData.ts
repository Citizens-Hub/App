import { useState, useEffect } from 'react';
import { Ship, ShipsData } from '../../../types';

/**
 * Hook to fetch and manage ships data
 */
export default function useShipsData() {
  const [ships, setShips] = useState<Ship[]>([]);
  const [shipsMap, setShipsMap] = useState<Record<number, Ship>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/ships`, {
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error('Network response error');
        }

        const shipsData = await response.json() as ShipsData;
        const sortedShips = shipsData.data.ships.sort((a: Ship, b: Ship) => a.msrp - b.msrp);
        
        // Create mapping from ID to Ship for easy lookup
        const shipsMapping: Record<number, Ship> = {};
        sortedShips.forEach(ship => {
          shipsMapping[ship.id] = ship;
        });

        setShips(sortedShips);
        setShipsMap(shipsMapping);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError('Failed to load ships data');
        console.error('Error fetching ships data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      abortController.abort();
    };
  }, []);

  /**
   * Get ship information by ID
   */
  const getShipById = (id: number): Ship | undefined => {
    return shipsMap[id];
  };

  /**
   * Get ship name by ID, return ID string if not exist
   */
  const getShipNameById = (id: number): string => {
    return shipsMap[id]?.name || `Ship #${id}`;
  };

  /**
   * Get ship image
   */
  const getShipImageById = (id: number): string | undefined => {
    return shipsMap[id]?.medias?.productThumbMediumAndSmall;
  };

  return { 
    ships, 
    loading, 
    error, 
    getShipById, 
    getShipNameById,
    getShipImageById
  };
} 