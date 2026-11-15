import type { Order } from '@/types';

/** Match the safe UI scope; the API rechecks payment, settlement, and fulfillment atomically. */
export function canCloseAdminOrder(order: Pick<Order, 'status' | 'items'>) {
  return ['pending', 'paid', 'confirmed', 'canceled'].includes(order.status)
    && !order.items.some(item => item.shipped);
}

export async function closeAdminOrder(apiEndpoint: string, orderId: string, token: string) {
  const response = await fetch(`${apiEndpoint}/api/admin/orders/${encodeURIComponent(orderId)}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : null;
    throw new Error(typeof error === 'string' ? error : 'Failed to close order. Refresh its status before retrying.');
  }
  if (!payload || typeof payload !== 'object' || !('success' in payload) || payload.success !== true
    || !('status' in payload) || payload.status !== 'canceled') {
    throw new Error('Unable to confirm order closure. Refresh its status before retrying.');
  }
  return { manualRefundRequired: 'manualRefundRequired' in payload && payload.manualRefundRequired === true };
}
