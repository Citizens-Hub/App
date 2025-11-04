import { useApi } from '../useApi';
import { BlogPostResponse } from '@/types';

export function useBlogPost(slug: string | null) {
  const path = slug ? `/api/blog/posts/${slug}` : null;
  
  return useApi<BlogPostResponse>(path, {
    revalidateOnFocus: false,
    revalidateIfStale: true,
  });
}

