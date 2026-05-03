import { useAuthApi } from '../useApi';
import { TicketOrderOptionsResponse } from '@/types';

export default function useTicketOrderOptions() {
  return useAuthApi<TicketOrderOptionsResponse>('/api/tickets/orders', {
    revalidateOnFocus: false,
  });
}
