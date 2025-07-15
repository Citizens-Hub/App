import useSWR from 'swr';
import { useApi } from '../useApi';
import { ProfileData } from '@/types';
import { fetcher } from '../swr-config';

// Shared hangar item interface
export interface SharedHangarItem {
  name: string;
  from: number;
  to: number;
  price: number;
  owners: number[];
}

// Shared hangar data interface
export interface SharedHangarData {
  items: SharedHangarItem[];
  currency: string;
}

// Profile response type
interface ProfileResponse {
  user: ProfileData;
}

// Hook return type
export interface UseSharedDataResult {
  profile: ProfileData | null;
  hangarData: SharedHangarData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Custom hook to fetch user profile and shared hangar data
 */
export default function useSharedData(userId: string): UseSharedDataResult {
  // 只有当userId存在时才发起请求
  const profilePath = userId ? `/api/user/profile/${userId}` : null;
  
  // 使用SWR获取用户资料
  const { 
    data: profileData, 
    error: profileError,
    isLoading: profileLoading
  } = useApi<ProfileResponse>(profilePath);

  // 获取共享机库路径
  const sharedHangarPath = profileData?.user?.sharedHangar;
  const hangarUrl = profileData && sharedHangarPath
    ? `${import.meta.env.VITE_PUBLIC_API_ENDPOINT}${sharedHangarPath}`
    : null;

  // 只有当用户资料获取成功且存在共享机库路径时才获取机库数据
  const { 
    data: hangarData,
    error: hangarError, 
    isLoading: hangarLoading 
  } = useSWR<SharedHangarData>(
    hangarUrl,
    fetcher,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false
    }
  );

  // 计算loading状态
  const loading = (profileLoading || hangarLoading) && !!userId;
  
  // 处理错误
  const error = profileError ? 'Failed to fetch user profile' : 
                hangarError ? 'Failed to fetch shared hangar data' : null;

  return { 
    profile: profileData?.user || null, 
    hangarData: hangarData || null, 
    loading, 
    error 
  };
} 