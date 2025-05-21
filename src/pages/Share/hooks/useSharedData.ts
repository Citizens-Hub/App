import { useState, useEffect } from 'react';
import { ProfileData } from '../../../types';

// Shared hangar item interface
export interface SharedHangarItem {
  name: string;
  from: number;
  to: number;
  price: number;
  owners: number[];
}

// Shared hangar data interface
export interface SharedHangarData {
  items: SharedHangarItem[];
  currency: string;
}

// Hook return type
export interface UseSharedDataResult {
  profile: ProfileData | null;
  hangarData: SharedHangarData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Custom hook to fetch user profile and shared hangar data
 */
export default function useSharedData(userId: string): UseSharedDataResult {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [hangarData, setHangarData] = useState<SharedHangarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        // Step 1: Fetch user profile
        const profileResponse = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/user/profile/${userId}`, {
          signal: abortController.signal
        });
        
        if (!profileResponse.ok) {
          throw new Error('Failed to fetch user profile');
        }

        const profileData = await profileResponse.json();
        const userProfile = profileData.user as ProfileData;
        setProfile(userProfile);

        // Step 2: If shared hangar link exists, fetch shared hangar data
        if (userProfile.sharedHangar) {
          const hangarResponse = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}${userProfile.sharedHangar}`, {
            signal: abortController.signal
          });

          if (!hangarResponse.ok) {
            throw new Error('Failed to fetch shared hangar data');
          }

          const sharedData = await hangarResponse.json() as SharedHangarData;
          setHangarData(sharedData);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching shared data:', err);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    fetchData();

    return () => {
      abortController.abort();
    };
  }, [userId]);

  return { profile, hangarData, loading, error };
} 