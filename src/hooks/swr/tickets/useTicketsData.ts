import { useAuthApi } from '../useApi';
import { TicketListResponse } from '@/types';

export default function useTicketsData() {
  return useAuthApi<TicketListResponse>('/api/tickets', {
    revalidateOnFocus: true,
  });
}
