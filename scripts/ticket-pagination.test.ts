import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTicketListPath, initialTicketListState, ticketListReducer, lastTicketPage } from '../src/pages/Admin/components/ticketPagination';

const params = (state = initialTicketListState) => new URL(buildTicketListPath(state), 'http://localhost').searchParams;

test('first page requests ten records; next/previous pages preserve filters', () => {
  assert.equal(params().get('page'), '1');
  assert.equal(params().get('limit'), '10');
  let state = { ...initialTicketListState, statusFilter: 'open' as const, query: ' 中文 & order ' };
  state = ticketListReducer(state, { type: 'page', page: 1, total: 21 }) as typeof state;
  assert.deepEqual(Object.fromEntries(params(state)), { page: '2', limit: '10', status: 'open', query: '中文 & order' });
  assert.equal(params(ticketListReducer(state, { type: 'page', page: 0, total: 21 })).get('page'), '1');
});

test('changing either filter resets the page while preserving the other filter', () => {
  const state = { page: 4, statusFilter: 'open' as const, query: 'order' };
  assert.deepEqual(ticketListReducer(state, { type: 'status', value: 'closed' }), { ...state, statusFilter: 'closed', page: 0 });
  assert.deepEqual(ticketListReducer(state, { type: 'query', value: 'new' }), { ...state, query: 'new', page: 0 });
  assert.deepEqual(Object.fromEntries(params({ ...state, statusFilter: 'all', query: '  ' })), { page: '5', limit: '10' });
});

test('empty, exact-full and partial last pages cannot navigate outside bounds', () => {
  for (const [total, last] of [[0, 0], [1, 0], [10, 0], [11, 1], [20, 1], [21, 2]]) {
    assert.equal(lastTicketPage(total), last);
    assert.equal(ticketListReducer(initialTicketListState, { type: 'page', page: 99, total }).page, last);
    assert.equal(ticketListReducer(initialTicketListState, { type: 'page', page: -1, total }).page, 0);
  }
});

test('shrinking totals return to the last valid page and retain filters', () => {
  const state = { page: 2, statusFilter: 'closed' as const, query: 'order' };
  const reduced = ticketListReducer(state, { type: 'total', total: 20 });
  assert.deepEqual(reduced, { ...state, page: 1 });
  assert.equal(params(reduced).get('page'), '2');
  assert.equal(ticketListReducer(state, { type: 'total', total: 0 }).page, 0);
  assert.equal(ticketListReducer(state, { type: 'total', total: 21 }), state);
});
