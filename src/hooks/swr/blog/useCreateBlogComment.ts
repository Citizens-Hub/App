import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { CreateBlogCommentRequest, CreateBlogCommentResponse } from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export function useCreateBlogComment() {
  const { user } = useSelector((state: RootState) => state.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createComment = async (postId: string, data: CreateBlogCommentRequest): Promise<CreateBlogCommentResponse> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/blog/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': user.token ? `Bearer ${user.token}` : '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create comment');
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

  return { createComment, loading, error };
}

