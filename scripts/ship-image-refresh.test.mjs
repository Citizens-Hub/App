import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/utils/shipImage.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '__env');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function loadImages(imagesEndpoint = 'https://images.citizenshub.app') {
  const context = { exports: {}, URL, __env: { VITE_PUBLIC_API_ENDPOINT: 'https://worker.citizenshub.app', VITE_PUBLIC_IMAGES_ENDPOINT: imagesEndpoint } };
  vm.runInNewContext(code, context);
  return context.exports;
}
const rsiUrl = 'https://robertsspaceindustries.com/current.webp';
const oldUrl = 'https://images.citizenshub.app/ships/87/urlhash-old.webp';
const newUrl = 'https://images.citizenshub.app/ships/87/urlhash-new.webp';
const oldManifest = [{ id: '87:thumb-small', url: oldUrl, sourceUrl: rsiUrl }];
const newManifest = [{ id: '87:thumb-small', url: newUrl, sourceUrl: rsiUrl }];

for (const variant of ['thumbSmall', 'thumbLarge', 'slideshow']) {
  test(`${variant}: legacy aliases fall back directly to RSI`, () => {
    const images = loadImages();
    const get = { thumbSmall: images.getShipThumbSmall, thumbLarge: images.getShipThumbLarge, slideshow: images.getShipSlideshowImage }[variant];
    assert.equal(get({ id: 87, imageUrls: { [variant]: '/ship-images/87/thumb-small?v=2' },
      medias: { productThumbMediumAndSmall: rsiUrl, slideShow: rsiUrl, source: 'rsi' } }), rsiUrl);
  });
}
test('R2 URLs use the configured image domain, or the default public domain', () => {
  for (const endpoint of ['', 'https://images.citizenshub.app']) {
    assert.equal(loadImages(endpoint).getShipThumbSmall({ id: 87, imageUrls: { thumbSmall: '/ships/87/urlhash-new.webp' } }), newUrl);
    assert.equal(loadImages(endpoint).getShipThumbSmall({ id: 87, imageUrls: { thumbSmall: rsiUrl } }), rsiUrl);
  }
  assert.equal(loadImages('https://images.example.com').getShipThumbSmall({ id: 87, imageUrls: { thumbSmall: '/ships/87/new.webp' } }), 'https://images.example.com/ships/87/new.webp');
});
test('unsynced detail images and legacy aliases with source URLs go directly to RSI', () => {
  const images = loadImages();
  assert.equal(images.getShipDetailImageUrl({ id: 87 }, { url: rsiUrl, source: 'rsi' }), rsiUrl);
  assert.equal(images.getShipDetailImageUrl({ id: 87 }, { url: '/ship-images/87/detail/thumbnail/1?v=2', sourceUrl: rsiUrl }), rsiUrl);
});
test('legacy detail aliases without source metadata remain usable without duplicate version parameters', () => {
  assert.equal(loadImages().getShipDetailImageUrl({ id: 87 }, { url: '/ship-images/87/detail/thumbnail/1?v=2' }),
    'https://worker.citizenshub.app/ship-images/87/detail/thumbnail/1?v=2');
});
test('external image URLs and RSI relative assets retain their destinations', () => {
  const images = loadImages();
  assert.equal(images.toApiAssetUrl('https://example.com/image.webp'), 'https://example.com/image.webp');
  assert.equal(images.toApiAssetUrl('/image.webp', { source: 'rsi' }), 'https://robertsspaceindustries.com/image.webp');
  assert.equal(loadImages('').toApiAssetUrl('/other/image.webp'), 'https://worker.citizenshub.app/other/image.webp');
});
test('the ship list produces stable manifest IDs with R2 versions and direct RSI fallbacks', () => {
  const entries = loadImages().buildShipImageManifest([{ id: 87, imageUrls: { thumbSmall: oldUrl, slideshow: newUrl },
    medias: { productThumbMediumAndSmall: rsiUrl, slideShow: rsiUrl },
    details: { imageComposer: [{ url: newUrl, sourceUrl: rsiUrl }, { url: rsiUrl, source: 'rsi' }] } }]);
  assert.equal(entries.find(entry => entry.id === '87:thumb-small').url, oldUrl);
  assert.equal(entries.find(entry => entry.id === '87:detail:0').sourceUrl, rsiUrl);
  assert.equal(entries.find(entry => entry.id === '87:detail:1').url, rsiUrl);
});

test('both list and single-ship API refreshes publish manifests and periodically revalidate', async () => {
  const apiSource = fs.readFileSync(new URL('../src/hooks/swr/useApi.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '__env');
  const apiCode = ts.transpileModule(apiSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const ship = { id: 87, name: 'Aurora', manufacturer: { name: 'RSI' } };
  const published = [];
  const modules = {
    swr: { default: (key, fetcher, options) => ({ key, fetcher, options }) },
    'react-redux': {},
    './swr-config': { fetcher: async url => url.includes('/api/ships') ? { data: { ships: [ship] } } : { data: { ship } } },
    '@/contexts/LocaleContext': { useLocale: () => ({ locale: 'en', shipNameTranslationEnabled: false }) },
    './shipLocale': { appendShipLocaleToPath: path => path },
    '@/utils/modelCache': { updateShipImageManifest: ships => published.push(ships) },
  };
  const context = { exports: {}, URL, console, __env: { VITE_PUBLIC_API_ENDPOINT: 'https://worker.citizenshub.app' }, require: name => modules[name] };
  vm.runInNewContext(apiCode, context);
  for (const path of ['/api/ships', '/api/ship?id=87']) {
    const request = context.exports.useApi(path);
    assert.equal(request.options.refreshInterval, 300_000);
    assert.equal(request.options.revalidateOnFocus, true);
    await request.fetcher(request.key);
  }
  assert.equal(published.length, 2);
  assert.ok(published.every(ships => ships[0] === ship));
  const other = context.exports.useApi('/api/market');
  await other.fetcher(other.key);
  assert.equal(published.length, 2);
  // Development deployments use relative API URLs, including localization.
  modules['@/contexts/LocaleContext'].useLocale = () => ({ locale: 'zh-CN', shipNameTranslationEnabled: true });
  const relativeContext = { ...context, exports: {}, __env: { VITE_PUBLIC_API_ENDPOINT: '' } };
  vm.runInNewContext(apiCode, relativeContext);
  const relativeRequest = relativeContext.exports.useApi('/api/ships');
  const relativeResult = await relativeRequest.fetcher(relativeRequest.key);
  assert.equal(relativeResult.data.ships[0].id, 87);
});

const serviceWorker = fs.readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
const imageCacheName = 'citizens-hub-image-cache-v2';
function memoryCaches() {
  const stores = new Map();
  const key = request => typeof request === 'string' ? request : request.url;
  return {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        match: async request => entries.get(key(request))?.clone(),
        put: async (request, response) => entries.set(key(request), response.clone()),
        delete: async request => entries.delete(key(request)),
        keys: async () => [...entries.keys()].map(url => new Request(url)),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
  };
}
function loadWorker(overrides = {}) {
  const listeners = {};
  const context = { URL, Request, Response, Headers, console,
    self: { addEventListener: (name, callback) => { listeners[name] = callback; }, location: new URL('https://citizenshub.app/'), clients: { claim() {} } },
    caches: memoryCaches(), ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(serviceWorker, context);
  return { context, listeners };
}
async function imageRequest(worker, url) {
  const request = new Request(url);
  Object.defineProperty(request, 'destination', { value: 'image' });
  let response;
  const pending = [];
  worker.listeners.fetch({ request, respondWith: value => { response = value; }, waitUntil: value => pending.push(value) });
  const result = await response;
  await Promise.all(pending);
  return result;
}
async function manifest(worker, entries) {
  let completion;
  let response;
  worker.listeners.message({ data: { type: 'CH_IMAGE_CACHE_MANIFEST', payload: { entries } },
    ports: [{ postMessage: value => { response = value; } }], waitUntil: value => { completion = value; } });
  assert.equal(response.ok, true);
  await completion;
}
function imageResponse(body = 'image') {
  return new Response(body, { headers: { 'Content-Type': 'image/webp' } });
}

test('actual fetch routing bypasses alias caches on Worker, image domain and same-origin deployments', async () => {
  const requested = [];
  const worker = loadWorker({ caches: { open() { throw new Error('Aliases must not open CacheStorage'); } },
    fetch: async request => { requested.push(request); return imageResponse(); } });
  for (const host of ['worker.citizenshub.app', 'images.citizenshub.app', 'citizenshub.app']) {
    const response = await imageRequest(worker, `https://${host}/ship-images/87/thumb-small?v=2`);
    assert.equal(response.status, 200);
  }
  assert.equal(requested.length, 3);
  assert.ok(requested.every(request => request.cache === 'no-cache'));
});
test('RSI requests are not intercepted or stored by the service worker', async () => {
  const worker = loadWorker({ caches: { open() { throw new Error('Unexpected cache access'); } },
    fetch: async () => { throw new Error('Unexpected SW fetch'); } });
  assert.equal(await imageRequest(worker, rsiUrl), undefined);
});
test('first or unchanged manifests do not download images and versioned objects stay cache-first', async () => {
  const worker = loadWorker({ fetch: async () => { throw new Error('Unexpected download'); } });
  await manifest(worker, oldManifest);
  const cache = await worker.context.caches.open(imageCacheName);
  await cache.put(oldUrl, imageResponse('cached'));
  await manifest(worker, oldManifest);
  assert.equal(await (await imageRequest(worker, oldUrl)).text(), 'cached');
});
test('a changed manifest refreshes cached pictures once, keeps unseen images lazy, and removes the replaced version', async () => {
  const downloads = [];
  const worker = loadWorker({ fetch: async url => { downloads.push(String(url)); return imageResponse('new'); } });
  await manifest(worker, [...oldManifest, { ...oldManifest[0], id: '87:slideshow' }]);
  const cache = await worker.context.caches.open(imageCacheName);
  await cache.put(oldUrl, imageResponse('old'));
  const next = [...newManifest, { ...newManifest[0], id: '87:slideshow' }, { id: '88:thumb-small', url: 'https://images.citizenshub.app/ships/88/unseen.webp' }];
  await manifest(worker, next);
  await manifest(worker, next);
  assert.deepEqual(downloads, [newUrl]);
  assert.equal(await cache.match(oldUrl), undefined);
  assert.equal(await (await imageRequest(worker, newUrl)).text(), 'new');
});
test('manifest state survives service worker restarts', async () => {
  const caches = memoryCaches();
  const first = loadWorker({ caches });
  await manifest(first, oldManifest);
  await (await caches.open(imageCacheName)).put(oldUrl, imageResponse('old'));
  let downloads = 0;
  const second = loadWorker({ caches, fetch: async () => { downloads++; return imageResponse('new'); } });
  await manifest(second, newManifest);
  assert.equal(downloads, 1);
});
test('failed refresh retains old bytes, falls back to uncached RSI, and retries the same manifest', async () => {
  let available = false;
  const requests = [];
  const worker = loadWorker({ fetch: async (url, options) => {
    requests.push({ url: String(url), cache: options?.cache });
    return String(url) === rsiUrl ? imageResponse('rsi') : available ? imageResponse('new') : new Response('missing', { status: 404 });
  } });
  await manifest(worker, oldManifest);
  const cache = await worker.context.caches.open(imageCacheName);
  await cache.put(oldUrl, imageResponse('old'));
  await manifest(worker, newManifest);
  assert.equal(await (await cache.match(oldUrl)).text(), 'old');
  assert.equal(await (await imageRequest(worker, newUrl)).text(), 'rsi');
  assert.equal(await cache.match(newUrl), undefined);
  assert.equal(await cache.match(rsiUrl), undefined);
  assert.ok(requests.some(request => request.url === rsiUrl && request.cache === 'no-store'));
  available = true;
  await manifest(worker, newManifest);
  assert.equal(await (await cache.match(newUrl)).text(), 'new');
  assert.equal(await cache.match(oldUrl), undefined);
});
test('an old version shared by an unchanged slot is retained', async () => {
  const worker = loadWorker({ fetch: async () => imageResponse('new') });
  const shared = { ...oldManifest[0], id: '87:detail:0' };
  await manifest(worker, [...oldManifest, shared]);
  const cache = await worker.context.caches.open(imageCacheName);
  await cache.put(oldUrl, imageResponse('old'));
  await manifest(worker, [...newManifest, shared]);
  assert.ok(await cache.match(oldUrl));
  assert.ok(await cache.match(newUrl));
});
test('a temporary RSI fallback keeps the last R2 version until a replacement is ready', async () => {
  const worker = loadWorker({ fetch: async () => { throw new Error('RSI should not be prefetched'); } });
  await manifest(worker, oldManifest);
  const cache = await worker.context.caches.open(imageCacheName);
  await cache.put(oldUrl, imageResponse('old'));
  await manifest(worker, [{ id: oldManifest[0].id, url: rsiUrl }]);
  assert.ok(await cache.match(oldUrl));
});
test('activation removes the previous image cache so stale aliases do not survive', async () => {
  const deleted = [];
  const { listeners } = loadWorker({ caches: { keys: async () => ['citizens-hub-image-cache-v1', imageCacheName], delete: async key => deleted.push(key) } });
  let completion;
  listeners.activate({ waitUntil: promise => { completion = promise; } });
  await completion;
  assert.deepEqual(deleted, ['citizens-hub-image-cache-v1']);
});

test('opaque R2 errors fall back to RSI instead of hiding a missing image', async () => {
  const opaque = new Response(null);
  Object.defineProperties(opaque, { type: { value: 'opaque' }, ok: { value: false }, status: { value: 0 } });
  const calls = [];
  const worker = loadWorker({ fetch: async (request, options) => {
    const url = typeof request === 'string' ? request : request.url;
    calls.push(url);
    if (url === rsiUrl) return imageResponse('RSI fallback');
    if (options?.mode === 'cors') throw new TypeError('CORS denied');
    return opaque;
  } });
  await manifest(worker, oldManifest);
  assert.equal(await (await imageRequest(worker, oldUrl)).text(), 'RSI fallback');
  assert.ok(calls.includes(rsiUrl));
  const cache = await worker.context.caches.open(imageCacheName);
  assert.equal(await cache.match(oldUrl), undefined);
});

test('a configured image origin participates in manifest updates and real request routing', async () => {
  const url = 'https://custom-images.example.com/ships/87/versioned.webp';
  const worker = loadWorker({
    self: { addEventListener() {}, location: new URL('https://citizenshub.app/service-worker.js?images_origin=https%3A%2F%2Fcustom-images.example.com') },
    fetch: async () => imageResponse('custom CDN'),
  });
  await worker.context.updateShipImageManifest({ entries: [{ id: '87:thumb-small', url, sourceUrl: rsiUrl }] });
  assert.equal(worker.context.isOwnedImageRequest({ destination: 'image' }, new URL(url)), true);
  assert.equal(worker.context.isOwnedImageRequest({ destination: 'image' }, new URL('https://custom-images.example.com/avatar.png')), false);
  assert.equal((await worker.context.readShipImageManifest())[0].url, url);
  const pending = [];
  const response = await worker.context.handleOwnedImageRequest({ waitUntil: value => pending.push(value) }, new Request(url), new URL(url));
  await Promise.all(pending);
  assert.equal(await response.text(), 'custom CDN');
  assert.ok(await (await worker.context.caches.open(imageCacheName)).match(url));
});
