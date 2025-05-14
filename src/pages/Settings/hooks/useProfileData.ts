import { useState, useEffect } from 'react';
import { ProfileData } from '../../../types';

export default function useProfileData(userId: string) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      if (!userId) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/user/profile/${userId}`, {
          signal: abortController.signal
        });
        if (!response.ok) {
          throw new Error('网络响应错误');
        }

        const data: ProfileData = (await response.json()).user;

        setProfile(data);
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

    setLoading(true);

    fetchData();

    return () => {
      abortController.abort();
    };
  }, [userId]);

  return { profile, loading, error };
} 