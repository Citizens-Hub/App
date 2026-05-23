import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { ResellerMediaAttachment } from './useResellerMedia';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export interface UploadResellerMediaResponse {
  success: boolean;
  message: string;
  attachment: ResellerMediaAttachment;
}

export function useUploadResellerMedia() {
  const { user } = useSelector((state: RootState) => state.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const uploadFile = async (file: File): Promise<UploadResellerMediaResponse> => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/api/reseller/media`, {
        method: 'POST',
        headers: {
          Authorization: user.token ? `Bearer ${user.token}` : '',
        },
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to upload image');
      }

      return payload;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { uploadFile, loading, error };
}
