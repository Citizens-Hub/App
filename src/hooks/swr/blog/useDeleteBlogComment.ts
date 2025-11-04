import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { DeleteBlogCommentResponse } from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export function useDeleteBlogComment() {
  const { user } = useSelector((state: RootState) => state.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteComment = async (commentId: string): Promise<DeleteBlogCommentResponse> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/blog/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': user.token ? `Bearer ${user.token}` : '',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete comment');
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

  return { deleteComment, loading, error };
}

