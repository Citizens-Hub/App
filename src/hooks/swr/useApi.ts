import useSWR, { SWRConfiguration } from 'swr';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { fetcher, authFetcher } from './swr-config';
import { UserInfo } from '@/types';

// API基础URL
const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

// 用户配置类型
interface UserProfile {
  user: {
    sharedHangar?: string;
    [key: string]: unknown;
  }
}

/**
 * 基本数据获取hook，无需认证
 */
export function useApi<T>(path: string | null, options?: SWRConfiguration) {
  const fullUrl = path ? `${API_BASE_URL}${path}` : null;

  return useSWR<T>(
    fullUrl, 
    fetcher, 
    options
  );
}

/**
 * 需要认证的数据获取hook
 */
export function useAuthApi<T>(path: string | null, options?: SWRConfiguration) {
  const { user } = useSelector((state: RootState) => state.user);
  const fullUrl = path ? `${API_BASE_URL}${path}` : null;
  
  return useSWR<T>(
    fullUrl,
    authFetcher(user.token),
    options
  );
}

/**
 * 自定义获取用户配置hook
 */
export function useUserProfile(userId?: string) {
  const path = userId ? `/api/user/profile/${userId}` : null;
  return useApi<UserProfile>(path);
}

/**
 * 验证用户会话
 */
export function useUserSession() {
  const { user } = useSelector((state: RootState) => state.user);
  
  return useAuthApi<{success: boolean, user: UserInfo}>(
    user.token ? '/api/auth/user' : null,
    {
      refreshInterval: 5 * 60 * 1000, // 每5分钟检查一次会话
      revalidateOnFocus: true
    }
  );
}

export default useApi; 