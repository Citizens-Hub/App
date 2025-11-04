import { useApi } from '../useApi';
import { BlogCommentsResponse } from '@/types';

export function useBlogComments(postIdOrSlug: string | null) {
  const path = postIdOrSlug 
    ? `/api/blog/posts/${postIdOrSlug}/comments`
    : null;
  
  return useApi<BlogCommentsResponse>(path, {
    revalidateOnFocus: false,
    revalidateIfStale: true,
  });
}

