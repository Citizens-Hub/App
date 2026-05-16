import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { OrderReviewAttachment } from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

interface UploadOrderReviewAttachmentResponse {
  success: boolean;
  attachment: OrderReviewAttachment;
}

export function useUploadOrderReviewAttachment() {
  const { user } = useSelector((state: RootState) => state.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const uploadFile = async (orderId: string, file: File): Promise<UploadOrderReviewAttachmentResponse> => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/review-attachments`, {
        method: 'POST',
        headers: {
          Authorization: user.token ? `Bearer ${user.token}` : '',
        },
        body: formData,
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to upload review image');
      }

      return result as UploadOrderReviewAttachmentResponse;
    } catch (uploadError) {
      const nextError = uploadError as Error;
      setError(nextError);
      throw nextError;
    } finally {
      setLoading(false);
    }
  };

  return { uploadFile, loading, error };
}
