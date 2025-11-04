import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { UpdateBlogPostRequest, BlogPostResponse } from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export function useUpdateBlogPost() {
  const { user } = useSelector((state: RootState) => state.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updatePost = async (slug: string, data: UpdateBlogPostRequest): Promise<BlogPostResponse> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/blog/posts/${slug}`, {
        method: 'PUT',
        headers: {
          'Authorization': user.token ? `Bearer ${user.token}` : '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update blog post');
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

  return { updatePost, loading, error };
}

