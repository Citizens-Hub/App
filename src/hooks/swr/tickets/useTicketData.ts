import { useAuthApi } from '../useApi';
import { TicketDetailItem } from '@/types';

export default function useTicketData(ticketId?: string) {
  return useAuthApi<TicketDetailItem>(ticketId ? `/api/tickets/${ticketId}` : null, {
    revalidateOnFocus: true,
  });
}
