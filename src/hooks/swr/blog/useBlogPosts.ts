import { useApi } from '../useApi';
import { BlogPostsResponse } from '@/types';
import { useLocale } from '@/contexts/LocaleContext';

export function useBlogPosts(page = 1, limit = 10) {
  const { locale } = useLocale();
  // Convert locale format (zh-CN -> zh, en -> en)
  const lang = locale.startsWith('zh') ? 'zh' : 'en';
  const path = `/api/blog/posts?lang=${lang}&page=${page}&limit=${limit}`;
  
  return useApi<BlogPostsResponse>(path, {
    revalidateOnFocus: false,
    revalidateIfStale: true,
  });
}

