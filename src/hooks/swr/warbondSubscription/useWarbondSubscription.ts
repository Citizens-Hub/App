import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useAuthApi } from '../useApi';

interface WarbondSubscriptionStatus {
  success: boolean;
  data: {
    wbNotificationEnabled?: boolean;
    wbChanges?: boolean;
    standardSkuShipIds?: number[];
    settings?: {
      wbChanges?: boolean;
      standardSkuShipIds?: number[];
      wbNotificationEnabled?: boolean;
    };
  };
}

export default function useWarbondSubscription() {
  const { user } = useSelector((state: RootState) => state.user);
  
  // Fetch subscription status (requires authentication)
  const { 
    data: subscriptionResponse,
    error: subscriptionError,
    isLoading: subscriptionLoading,
    mutate: mutateSubscription
  } = useAuthApi<WarbondSubscriptionStatus>(
    user.token ? '/api/wb-subscription/status' : null
  );

  const settings = subscriptionResponse?.data?.settings;
  const isEnabled = settings?.wbChanges
    ?? subscriptionResponse?.data?.wbChanges
    ?? subscriptionResponse?.data?.wbNotificationEnabled
    ?? settings?.wbNotificationEnabled
    ?? false;

  const standardSkuShipIdsRaw = settings?.standardSkuShipIds ?? subscriptionResponse?.data?.standardSkuShipIds;
  const standardSkuShipIds = Array.isArray(standardSkuShipIdsRaw)
    ? standardSkuShipIdsRaw.filter((id): id is number => typeof id === 'number')
    : [];

  return {
    isEnabled,
    standardSkuShipIds,
    loading: subscriptionLoading,
    error: subscriptionError,
    mutate: mutateSubscription
  };
}
