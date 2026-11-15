import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

// Exercise the actual browser utilities with both Vite deployment configurations.
const source = fs.readFileSync(new URL('../src/utils/shipImage.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '__env');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function loadImages(imagesEndpoint = 'https://images.citizenshub.app') {
  const context = { exports: {}, URL, __env: { VITE_PUBLIC_API_ENDPOINT: 'https://worker.citizenshub.app', VITE_PUBLIC_IMAGES_ENDPOINT: imagesEndpoint } };
  vm.runInNewContext(code, context);
  return context.exports;
}

for (const variant of ['thumbSmall', 'thumbLarge', 'slideshow']) {
  test(`${variant}: missing images use the Worker instead of the image domain`, () => {
    const images = loadImages();
    const route = { thumbSmall: 'thumb-small', thumbLarge: 'thumb-large', slideshow: 'slideshow' }[variant];
    const get = { thumbSmall: images.getShipThumbSmall, thumbLarge: images.getShipThumbLarge, slideshow: images.getShipSlideshowImage }[variant];
    assert.equal(get({ id: 87, imageUrls: { [variant]: `/ship-images/87/${route}` } }), `https://worker.citizenshub.app/ship-images/87/${route}?v=2`);
  });
}

test('versioned R2 images still use the public image domain', () => {
  assert.equal(loadImages().getShipThumbSmall({ id: 87, imageUrls: { thumbSmall: '/ships/87/urlhash-contenthash.webp' } }),
    'https://images.citizenshub.app/ships/87/urlhash-contenthash.webp');
});
test('detail aliases also go to the Worker and do not duplicate version parameters', () => {
  const result = loadImages().getShipDetailImageUrl({ id: 87 }, { url: '/ship-images/87/detail/thumbnail/1?v=2' });
  assert.equal(result, 'https://worker.citizenshub.app/ship-images/87/detail/thumbnail/1?v=2');
});
test('legacy /api aliases and additional query parameters remain valid', () => {
  const result = loadImages().toApiAssetUrl('/api/ship-images/87/thumb-small?x=1');
  assert.equal(result, 'https://worker.citizenshub.app/api/ship-images/87/thumb-small?x=1&v=2');
});
test('deployments without an image domain bypass old immutable alias URLs', () => {
  assert.equal(loadImages('').getShipThumbSmall({ id: 87 }), 'https://worker.citizenshub.app/ship-images/87/thumb-small?v=2');
  assert.equal(loadImages('').getShipDetailImageUrl({ id: 87 }, { url: '/any', slot: 'thumbnail' }), 'https://worker.citizenshub.app/ship-images/87/detail/thumbnail/1?v=2');
});
test('external image URLs and RSI relative assets retain their destinations', () => {
  const images = loadImages();
  assert.equal(images.toApiAssetUrl('https://example.com/image.webp'), 'https://example.com/image.webp');
  assert.equal(images.toApiAssetUrl('/image.webp', { source: 'rsi' }), 'https://robertsspaceindustries.com/image.webp');
});

const serviceWorker = fs.readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
function loadWorker(overrides = {}) {
  const listeners = {};
  const context = { URL, Request, Response, Headers, console,
    self: { addEventListener: (name, callback) => { listeners[name] = callback; }, location: new URL('https://citizenshub.app/'), clients: { claim() {} } },
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(serviceWorker, context);
  return { context, listeners };
}

test('mutable aliases bypass CacheStorage and old HTTP cache entries', async () => {
  let requested;
  const { context } = loadWorker({
    caches: { open() { throw new Error('Mutable alias must not open CacheStorage'); } },
    fetch: async (request) => { requested = request; return new Response('fresh image'); },
  });
  const request = new Request('https://images.citizenshub.app/ship-images/87/thumb-small?v=2');
  const result = await context.handleOwnedImageRequest({}, request, new URL(request.url));
  assert.equal(await result.text(), 'fresh image');
  assert.equal(requested.cache, 'no-cache');
});
test('versioned objects can still be served from CacheStorage without a download', async () => {
  const { context } = loadWorker({
    caches: { open: async () => ({ match: async () => new Response('immutable image') }) },
    fetch: async () => { throw new Error('Unexpected network download'); },
  });
  const request = new Request('https://images.citizenshub.app/ships/87/urlhash-contenthash.webp');
  const result = await context.handleOwnedImageRequest({}, request, new URL(request.url));
  assert.equal(await result.text(), 'immutable image');
});
test('activation removes the previous image cache so stale aliases do not survive', async () => {
  const deleted = [];
  const { listeners } = loadWorker({ caches: { keys: async () => ['citizens-hub-image-cache-v1', 'citizens-hub-image-cache-v2'], delete: async (key) => deleted.push(key) } });
  let completion;
  listeners.activate({ waitUntil: (promise) => { completion = promise; } });
  await completion;
  assert.deepEqual(deleted, ['citizens-hub-image-cache-v1']);
});
