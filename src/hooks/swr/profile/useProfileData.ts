import { ProfileData } from '@/types';
import { useApi } from '../useApi';

// API响应类型
interface ProfileResponse {
  user: ProfileData;
}

export default function useProfileData(userId: string) {
  // 只有当userId存在时才发起请求
  const { 
    data: profileData,
    error: profileError,
    isLoading: loading 
  } = useApi<ProfileResponse>(
    userId ? `/api/user/profile/${userId}` : null
  );

  // 处理数据
  const profile = profileData?.user || null;
  
  // 处理错误
  const error = profileError ? '加载数据失败' : null;

  return { profile, loading, error };
} 