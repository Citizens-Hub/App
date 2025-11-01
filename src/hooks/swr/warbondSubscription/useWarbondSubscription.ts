import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useAuthApi } from '../useApi';

interface WarbondSubscriptionStatus {
  success: boolean;
  data: {
    wbNotificationEnabled: boolean;
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

  const isEnabled = subscriptionResponse?.data?.wbNotificationEnabled ?? false;

  return {
    isEnabled,
    loading: subscriptionLoading,
    error: subscriptionError,
    mutate: mutateSubscription
  };
}

