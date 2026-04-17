import useSWR, { SWRConfiguration } from 'swr';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { fetcher, authFetcher } from './swr-config';
import { ShipNameTranslationsResponse, ShipsData, UserInfo } from '@/types';
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

function mergeShipNameTranslations(shipsData: ShipsData, translationsResponse: ShipNameTranslationsResponse) {
  const translationMap = new Map(
    translationsResponse.translations.map((translation) => [translation.shipId, translation.shipName]),
  );

  return {
    ...shipsData,
    data: {
      ...shipsData.data,
      ships: shipsData.data.ships.map((ship) => ({
        ...ship,
        localizedName: translationMap.get(ship.id),
      })),
    },
  };
}

/**
 * 基本数据获取hook，无需认证
 */
export function useApi<T>(path: string | null, options?: SWRConfiguration) {
  const { locale } = useLocale();
  const localizedPath = appendShipLocaleToPath(path, locale);
  const fullUrl = localizedPath ? `${API_BASE_URL}${localizedPath}` : null;
  const requestPathname = localizedPath ? new URL(localizedPath, 'http://localhost').pathname : null;
  const isShipListRequest = requestPathname === '/api/ships';
  const swrKey = fullUrl ? (isShipListRequest ? `${fullUrl}#locale=${locale}` : fullUrl) : null;
  const swrFetcher = async (url: string) => {
    const [requestUrlString] = url.split('#');
    const data = await fetcher(requestUrlString);

    if (locale === 'en') {
      return data as T;
    }

    const requestUrl = new URL(requestUrlString);
    if (requestUrl.pathname !== '/api/ships' || !isShipsDataResponse(data)) {
      return data as T;
    }

    try {
      const translationsResponse = await fetcher(
        `${API_BASE_URL}/api/ships/translations?locale=${encodeURIComponent(locale)}`,
      ) as ShipNameTranslationsResponse;

      if (!translationsResponse.success) {
        return data as T;
      }

      return mergeShipNameTranslations(data, translationsResponse) as T;
    } catch (error) {
      console.warn('Failed to load ship name translations, falling back to source ship list.', error);
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
