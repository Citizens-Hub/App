import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export interface UploadAttachmentResponse {
  success: boolean;
  message: string;
  attachment: {
    id: string;
    fileName: string;
    fileSize: number;
    contentType: string;
    url: string;
    createdAt: string;
    uploader: {
      id: string;
      name: string;
      email: string;
    };
  };
}

export function useUploadAttachment() {
  const { user } = useSelector((state: RootState) => state.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const uploadFile = async (file: File): Promise<UploadAttachmentResponse> => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/api/blog/attachments`, {
        method: 'POST',
        headers: {
          'Authorization': user.token ? `Bearer ${user.token}` : '',
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload file');
      }

      const result = await response.json();
      setLoading(false);
      return result;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      throw error;
    }
  };

  return { uploadFile, loading, error };
}

