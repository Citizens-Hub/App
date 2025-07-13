import useSWR from 'swr';
import { useDispatch } from 'react-redux';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { setImportItems } from '../../store/importStore';
import { fetcher } from './swr-config';
import { useUserProfile } from './useApi';
import { SharedHangarData } from './share/useSharedData';

/**
 * 获取并自动同步共享机库数据
 */
export function useSharedHangar() {
  const dispatch = useDispatch();
  const { userId, sharedHangarPath } = useSelector((state: RootState) => state.import);

  // 获取用户配置以检查共享机库路径是否更新
  const { data: profileData } = useUserProfile(userId || undefined);
  const currentSharedHangar = profileData?.user?.sharedHangar;

  // 确定要使用的路径 - 优先使用最新的用户配置中的路径
  const hangarPath = currentSharedHangar || sharedHangarPath;
  const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
  
  // 获取共享机库数据
  const { data: hangarData, error } = useSWR<SharedHangarData>(
    userId && hangarPath ? `${API_BASE_URL}${hangarPath}` : null,
    fetcher
  );

  // 当获取到数据时更新store
  if (hangarData && currentSharedHangar && currentSharedHangar !== sharedHangarPath) {
    dispatch(setImportItems({
      items: hangarData.items,
      currency: hangarData.currency,
      userId: userId || undefined,
      sharedHangarPath: currentSharedHangar
    }));
  }

  return {
    hangarData,
    isLoading: !error && !hangarData && !!userId,
    isError: !!error,
    isPathUpdated: currentSharedHangar !== sharedHangarPath && !!currentSharedHangar,
  };
}

export default useSharedHangar; 