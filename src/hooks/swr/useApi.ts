import useSWR, { SWRConfiguration } from 'swr';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { fetcher, authFetcher } from './swr-config';
import { ShipsData, UserInfo } from '@/types';
import { useLocale } from '@/contexts/LocaleContext';
import { appendShipLocaleToPath } from './shipLocale';

// API基础URL
const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

// 用户配置类型
interface UserProfile {
  user: {
    sharedHangar?: string;
    [key: string]: unknown;
  }
}

function isShipsDataResponse(value: unknown): value is ShipsData {
  return Boolean(
    value
      && typeof value === 'object'
      && 'data' in value
      && typeof (value as { data?: unknown }).data === 'object'
      && (value as { data?: { ships?: unknown } }).data?.ships instanceof Array,
  );
}

function mergeShipLocalizations(baseShipsData: ShipsData, localizedShipsData: ShipsData) {
  const localizedShipMap = new Map(
    localizedShipsData.data.ships.map((ship) => [ship.id, ship]),
  );

  return {
    ...baseShipsData,
    data: {
      ...baseShipsData.data,
      ships: baseShipsData.data.ships.map((ship) => {
        const localizedShip = localizedShipMap.get(ship.id);

        return {
        ...ship,
          localizedName: localizedShip?.name || ship.localizedName,
          manufacturer: {
            ...ship.manufacturer,
            localizedName: localizedShip?.manufacturer?.name || ship.manufacturer.localizedName,
          },
        };
      }),
    },
  };
}

/**
 * 基本数据获取hook，无需认证
 */
export function useApi<T>(path: string | null, options?: SWRConfiguration) {
  const { locale, shipNameTranslationEnabled } = useLocale();
  const localizedPath = appendShipLocaleToPath(path, locale);
  const fullUrl = localizedPath ? `${API_BASE_URL}${localizedPath}` : null;
  const requestUrl = localizedPath ? new URL(localizedPath, 'http://localhost') : null;
  const isShipListRequest = requestUrl?.pathname === '/api/ships';
  const hasExplicitShipLocale = Boolean(requestUrl?.searchParams.has('locale'));
  const shouldMergeShipLocalizations = locale !== 'en' && shipNameTranslationEnabled && !hasExplicitShipLocale;
  const swrKey = fullUrl
    ? (isShipListRequest
      ? `${fullUrl}#locale=${locale}#ship-localization=${shouldMergeShipLocalizations ? 'on' : 'off'}`
      : fullUrl)
    : null;
  const swrFetcher = async (url: string) => {
    const [requestUrlString] = url.split('#');
    const data = await fetcher(requestUrlString);

    if (!shouldMergeShipLocalizations) {
      return data as T;
    }

    const requestUrl = new URL(requestUrlString);
    if (requestUrl.pathname !== '/api/ships' || !isShipsDataResponse(data)) {
      return data as T;
    }

    try {
      const localizedShipsData = await fetcher(
        `${API_BASE_URL}/api/ships?locale=${encodeURIComponent(locale)}`,
      ) as ShipsData;

      if (!isShipsDataResponse(localizedShipsData)) {
        return data as T;
      }

      return mergeShipLocalizations(data, localizedShipsData) as T;
    } catch (error) {
      console.warn('Failed to load localized ship metadata, falling back to source ship list.', error);
      return data as T;
    }
  };

  return useSWR<T>(
    swrKey,
    swrFetcher,
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
