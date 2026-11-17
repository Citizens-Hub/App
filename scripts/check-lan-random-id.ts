import assert from 'node:assert/strict';
import { randomId } from '../src/utils/randomId';
const insecureContext = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
const ids = Array.from({ length: 1000 }, () => randomId(insecureContext));
assert(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));
assert.equal(new Set(ids).size, ids.length);
assert.match(randomId(), /^[0-9a-f-]{36}$/);
console.log('LAN UUID fallback and native UUID checks passed');
