import assert from 'node:assert/strict';
import { canCloseAdminOrder, closeAdminOrder } from '../src/pages/Admin/services/closeAdminOrder';
import { hasRecordedOrderPayment } from '../src/utils/orderPayment';
import { OrderStatus, type Order } from '../src/types';

const order: Order = {
  id: 'ord_test', status: OrderStatus.Paid, price: 20, serviceFee: 1,
  createdAt: '2026-11-01T00:00:00Z',
  items: [{ id: 1, quantity: 2, price: 10, shipped: false,
    marketItem: { name: 'Test item', skuId: 'sku_test', itemType: 'ccu' } }],
};
for (const status of [OrderStatus.Pending, OrderStatus.Paid, OrderStatus.Confirmed, OrderStatus.Canceled]) {
  assert.equal(canCloseAdminOrder({ ...order, status }), true);
}
for (const status of [OrderStatus.Processing, OrderStatus.Finished, OrderStatus.PaymentReview]) {
  assert.equal(canCloseAdminOrder({ ...order, status }), false);
}
assert.equal(canCloseAdminOrder({ ...order, items: [{ ...order.items[0], shipped: true }] }), false);
assert.equal(canCloseAdminOrder({ ...order, items: [{ ...order.items[0], id: -1, shipped: true }] }), false);

assert.equal(hasRecordedOrderPayment(order), false);
assert.equal(hasRecordedOrderPayment({ ...order, paidAt: '2026-11-01T00:00:00Z' }), true);
assert.equal(hasRecordedOrderPayment({ ...order, paidFinalizedAt: '2026-11-01T00:00:00Z' }), true);

const originalFetch = globalThis.fetch;
try {
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.example.test/api/admin/orders/ord%2Ftest/close');
    assert.equal(options?.method, 'POST');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(String(options?.body)), {});
    return Response.json({ success: true, orderId: 'ord/test', status: 'canceled', manualRefundRequired: true });
  };
  assert.deepEqual(await closeAdminOrder('https://api.example.test', 'ord/test', 'test-token'), { manualRefundRequired: true });
  assert.equal(calls, 1);
  globalThis.fetch = async () => Response.json({ success: true, status: 'canceled', manualRefundRequired: false });
  assert.deepEqual(await closeAdminOrder('', 'ord_test', ''), { manualRefundRequired: false });
  globalThis.fetch = async () => Response.json({ error: 'Order already shipped' }, { status: 409 });
  await assert.rejects(closeAdminOrder('', 'ord_test', ''), /already shipped/);
  globalThis.fetch = async () => new Response('Bad gateway', { status: 502 });
  await assert.rejects(closeAdminOrder('', 'ord_test', ''), /Refresh its status/);
  globalThis.fetch = async () => Response.json({ success: false });
  await assert.rejects(closeAdminOrder('', 'ord_test', ''), /Unable to confirm/);
  globalThis.fetch = async () => { throw new TypeError('Network unavailable'); };
  await assert.rejects(closeAdminOrder('', 'ord_test', ''), /Network unavailable/);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('Admin order closure: eligibility, payment history, API contract and failure checks passed.');
