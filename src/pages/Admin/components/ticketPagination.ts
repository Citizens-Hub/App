import type { TicketStatus } from '@/types';

export const TICKETS_PAGE_SIZE = 10;

export type TicketListState = {
  page: number; // MUI uses zero-based pages; the API uses one-based pages.
  statusFilter: 'all' | TicketStatus;
  query: string;
};

export const initialTicketListState: TicketListState = { page: 0, statusFilter: 'all', query: '' };

export function lastTicketPage(total: number) {
  return Math.max(0, Math.ceil(total / TICKETS_PAGE_SIZE) - 1);
}

type Action =
  | { type: 'page'; page: number; total: number }
  | { type: 'status'; value: TicketListState['statusFilter'] }
  | { type: 'query'; value: string }
  | { type: 'total'; total: number };

export function ticketListReducer(state: TicketListState, action: Action): TicketListState {
  switch (action.type) {
    case 'status': return { ...state, statusFilter: action.value, page: 0 };
    case 'query': return { ...state, query: action.value, page: 0 };
    case 'page': return { ...state, page: Math.max(0, Math.min(action.page, lastTicketPage(action.total))) };
    case 'total': {
      const page = Math.min(state.page, lastTicketPage(action.total));
      return page === state.page ? state : { ...state, page };
    }
  }
}

export function buildTicketListPath(state: TicketListState) {
  const search = new URLSearchParams({ page: String(state.page + 1), limit: String(TICKETS_PAGE_SIZE) });
  if (state.statusFilter !== 'all') search.set('status', state.statusFilter);
  if (state.query.trim()) search.set('query', state.query.trim());
  return `/api/admin/tickets?${search.toString()}`;
}
