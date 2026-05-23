import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export function useDeleteResellerMedia() {
  const { user } = useSelector((state: RootState) => state.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteAttachment = async (attachmentId: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/reseller/media/${encodeURIComponent(attachmentId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: user.token ? `Bearer ${user.token}` : '',
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to delete image');
      }
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { deleteAttachment, loading, error };
}
