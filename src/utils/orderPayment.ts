import type { Order } from '@/types';

/** Cancellation does not erase an earlier payment and does not prove a refund. */
export function hasRecordedOrderPayment(order: Pick<Order, 'paidAt' | 'paidFinalizedAt'>) {
  return Boolean(order.paidAt || order.paidFinalizedAt);
}
