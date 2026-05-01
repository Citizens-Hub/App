const DB_NAME = 'citizens-hub-model-cache';
const DB_VERSION = 1;
const MODEL_STORE = 'models';
const IMAGE_CACHE_NAME = 'citizens-hub-image-cache-v1';
const IMAGE_CACHE_NAME_PREFIX = 'citizens-hub-image-cache-';

const MODEL_CACHE_PARAMS = {
  enabled: 'ch_model_cache',
  type: 'ch_model_type',
  shipId: 'ch_ship_id',
  key: 'ch_model_key',
};

const MODEL_CACHE_MESSAGE_TYPES = {
  list: 'CH_MODEL_CACHE_LIST',
  clear: 'CH_MODEL_CACHE_CLEAR',
};

const IMAGE_CACHE_MESSAGE_TYPES = {
  list: 'CH_IMAGE_CACHE_LIST',
  clear: 'CH_IMAGE_CACHE_CLEAR',
};

const IMAGE_CACHE_METADATA_HEADERS = {
  cachedAt: 'X-Citizens-Hub-Cache-Cached-At',
  source: 'X-Citizens-Hub-Cache-Source',
  size: 'X-Citizens-Hub-Cache-Size',
};

const IMAGE_CACHE_SOURCES = {
  app: 'app',
  worker: 'worker',
  workerShipImage: 'workerShipImage',
  r2: 'r2',
  unknown: 'unknown',
};

function openModelCacheDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(MODEL_STORE)) {
        const store = db.createObjectStore(MODEL_STORE, { keyPath: 'id' });
        store.createIndex('by_ship_id', 'shipId', { unique: false });
        store.createIndex('by_type', 'type', { unique: false });
        store.createIndex('by_updated_at', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function createModelCacheId(metadata) {
  return `ship:${metadata.shipId}:${metadata.type}:${metadata.modelKey}`;
}

function getModelRequestMetadata(url) {
  if (url.searchParams.get(MODEL_CACHE_PARAMS.enabled) !== '1') {
    return null;
  }

  const type = url.searchParams.get(MODEL_CACHE_PARAMS.type);
  const shipId = Number(url.searchParams.get(MODEL_CACHE_PARAMS.shipId));
  const modelKey = url.searchParams.get(MODEL_CACHE_PARAMS.key);

  if ((type !== 'glb' && type !== 'sog') || !Number.isInteger(shipId) || shipId <= 0 || !modelKey) {
    return null;
  }

  return {
    type,
    shipId,
    modelKey,
  };
}

function stripModelCacheParams(url) {
  const cleanUrl = new URL(url.toString());

  Object.values(MODEL_CACHE_PARAMS).forEach((paramName) => {
    cleanUrl.searchParams.delete(paramName);
  });

  return cleanUrl.toString();
}

function responseFromCacheEntry(entry) {
  const headers = new Headers();

  if (entry.contentType) {
    headers.set('Content-Type', entry.contentType);
  }

  headers.set('X-Citizens-Hub-Model-Cache', 'HIT');
  headers.set('X-Citizens-Hub-Model-Cache-Size', String(entry.size || 0));

  return new Response(entry.body.slice(0), {
    status: entry.status || 200,
    statusText: entry.statusText || 'OK',
    headers,
  });
}

async function getCachedModel(db, cacheId) {
  const transaction = db.transaction(MODEL_STORE, 'readonly');
  return await idbRequest(transaction.objectStore(MODEL_STORE).get(cacheId));
}

async function putCachedModel(entry) {
  const db = await openModelCacheDb();
  const transaction = db.transaction(MODEL_STORE, 'readwrite');
  transaction.objectStore(MODEL_STORE).put(entry);
  await transactionDone(transaction);
  db.close();
}

async function deleteStaleSogModels(db, metadata, currentCacheId) {
  if (metadata.type !== 'sog') {
    return 0;
  }

  let deletedCount = 0;
  const transaction = db.transaction(MODEL_STORE, 'readwrite');
  const store = transaction.objectStore(MODEL_STORE);
  const request = store.openCursor();

  await new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve();
        return;
      }

      const entry = cursor.value;
      if (entry.shipId === metadata.shipId && entry.type === 'sog' && entry.id !== currentCacheId) {
        cursor.delete();
        deletedCount += 1;
      }

      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });

  await transactionDone(transaction);
  return deletedCount;
}

async function cacheNetworkModelResponse(response, requestUrl, sourceUrl, metadata, cacheId) {
  if (!response.ok || response.type === 'opaque') {
    return;
  }

  const body = await response.arrayBuffer();
  const now = Date.now();

  await putCachedModel({
    id: cacheId,
    shipId: metadata.shipId,
    type: metadata.type,
    modelKey: metadata.modelKey,
    url: requestUrl,
    sourceUrl,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get('Content-Type'),
    size: body.byteLength,
    body,
    createdAt: now,
    updatedAt: now,
  });
}

async function handleModelRequest(event, request, requestUrl, metadata) {
  if (typeof indexedDB === 'undefined') {
    return fetch(request);
  }

  const cacheId = createModelCacheId(metadata);
  const sourceUrl = stripModelCacheParams(requestUrl);
  const db = await openModelCacheDb();

  try {
    await deleteStaleSogModels(db, metadata, cacheId);

    const cachedEntry = await getCachedModel(db, cacheId);
    if (cachedEntry) {
      return responseFromCacheEntry(cachedEntry);
    }
  } finally {
    db.close();
  }

  const networkResponse = await fetch(sourceUrl);

  event.waitUntil(
    cacheNetworkModelResponse(networkResponse.clone(), requestUrl.toString(), sourceUrl, metadata, cacheId)
      .catch((error) => {
        console.warn('[ModelCache] Failed to cache model response.', error);
      }),
  );

  return networkResponse;
}

async function listModelCacheEntries() {
  const db = await openModelCacheDb();
  const entries = [];
  const summary = {
    supported: true,
    entries,
    totalBytes: 0,
    bytesByType: {
      glb: 0,
      sog: 0,
    },
    countsByType: {
      glb: 0,
      sog: 0,
    },
  };

  try {
    const transaction = db.transaction(MODEL_STORE, 'readonly');
    const request = transaction.objectStore(MODEL_STORE).openCursor();

    await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          resolve();
          return;
        }

        const { body, ...entry } = cursor.value;
        const size = Number(entry.size) || 0;

        entries.push(entry);
        summary.totalBytes += size;

        if (entry.type === 'glb' || entry.type === 'sog') {
          summary.bytesByType[entry.type] += size;
          summary.countsByType[entry.type] += 1;
        }

        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return summary;
  } finally {
    db.close();
  }
}

async function clearModelCacheEntries(options = {}) {
  const db = await openModelCacheDb();
  let deletedCount = 0;

  try {
    const transaction = db.transaction(MODEL_STORE, 'readwrite');
    const store = transaction.objectStore(MODEL_STORE);

    if (options.id) {
      const existingEntry = await idbRequest(store.get(options.id));
      if (existingEntry) {
        store.delete(options.id);
        deletedCount = 1;
      }
      await transactionDone(transaction);
      return { deletedCount };
    }

    const request = store.openCursor();
    await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          resolve();
          return;
        }

        const entry = cursor.value;
        const typeMatches = !options.type || entry.type === options.type;
        const shipMatches = !options.shipId || entry.shipId === options.shipId;

        if (typeMatches && shipMatches) {
          cursor.delete();
          deletedCount += 1;
        }

        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    await transactionDone(transaction);
    return { deletedCount };
  } finally {
    db.close();
  }
}

function isImageLikeRequest(request, requestUrl) {
  if (request.destination === 'image') {
    return true;
  }

  return /\.(avif|bmp|gif|ico|jpe?g|jfif|png|svg|webp)$/i.test(requestUrl.pathname);
}

function isShipImagePath(pathname) {
  return pathname.startsWith('/ship-images/')
    || pathname.startsWith('/api/ship-images/');
}

function isOwnedImageRequest(request, requestUrl) {
  return isImageLikeRequest(request, requestUrl)
    && requestUrl.hostname === 'images.citizenshub.app';
}

function getImageCacheSource(requestUrl) {
  if (requestUrl.hostname === 'r2.citizenshub.app') {
    return IMAGE_CACHE_SOURCES.r2;
  }

  if (isShipImagePath(requestUrl.pathname)) {
    return IMAGE_CACHE_SOURCES.workerShipImage;
  }

  if (requestUrl.hostname === 'worker.citizenshub.app') {
    return IMAGE_CACHE_SOURCES.worker;
  }

  if (requestUrl.origin === self.location.origin || requestUrl.hostname === self.location.hostname) {
    return IMAGE_CACHE_SOURCES.app;
  }

  return IMAGE_CACHE_SOURCES.unknown;
}

async function fetchOwnedImageResponse(request, requestUrl) {
  if (requestUrl.origin === self.location.origin) {
    return fetch(request);
  }

  try {
    const headers = new Headers();
    const accept = request.headers.get('accept');
    if (accept) {
      headers.set('accept', accept);
    }

    return await fetch(requestUrl.toString(), {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      headers,
    });
  } catch (error) {
    console.warn('[ImageCache] Falling back to original request mode.', error);
    return fetch(request);
  }
}

async function shouldCacheOwnedImageResponse(requestUrl, response) {
  if (!response.ok) {
    return false;
  }

  const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase();
  if (cacheControl.includes('no-store')) {
    return false;
  }

  if (isShipImagePath(requestUrl.pathname)) {
    if (response.type === 'opaque') {
      return false;
    }

    const shipImageCacheState = (response.headers.get('X-Ship-Image-Cache') || '').toLowerCase();
    return shipImageCacheState === 'hit';
  }

  if (response.type === 'opaque') {
    return true;
  }

  const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
  return contentType.startsWith('image/');
}

async function buildCacheableImageResponse(response, source) {
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set(IMAGE_CACHE_METADATA_HEADERS.cachedAt, String(Date.now()));
  headers.set(IMAGE_CACHE_METADATA_HEADERS.source, source);
  headers.set(IMAGE_CACHE_METADATA_HEADERS.size, String(body.byteLength));

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function putOwnedImageResponse(cache, request, response, requestUrl) {
  if (response.type === 'opaque') {
    await cache.put(request, response);
    return;
  }

  const source = getImageCacheSource(requestUrl);
  const cacheableResponse = await buildCacheableImageResponse(response, source);
  await cache.put(request, cacheableResponse);
}

async function handleOwnedImageRequest(event, request, requestUrl) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetchOwnedImageResponse(request, requestUrl);
  const shouldCache = await shouldCacheOwnedImageResponse(requestUrl, networkResponse.clone());

  if (shouldCache) {
    event.waitUntil(
      putOwnedImageResponse(cache, request, networkResponse.clone(), requestUrl).catch((error) => {
        console.warn('[ImageCache] Failed to cache image response.', error);
      }),
    );
  }

  return networkResponse;
}

async function getImageResponseSize(response) {
  const headerSize = Number(
    response.headers.get(IMAGE_CACHE_METADATA_HEADERS.size)
    || response.headers.get('Content-Length')
    || '0',
  );

  if (Number.isFinite(headerSize) && headerSize > 0) {
    return headerSize;
  }

  if (response.type === 'opaque') {
    return 0;
  }

  try {
    const body = await response.clone().arrayBuffer();
    return body.byteLength;
  } catch {
    return 0;
  }
}

async function listImageCacheEntries() {
  const summary = {
    supported: typeof caches !== 'undefined',
    entries: [],
    totalBytes: 0,
    bytesBySource: {
      [IMAGE_CACHE_SOURCES.app]: 0,
      [IMAGE_CACHE_SOURCES.worker]: 0,
      [IMAGE_CACHE_SOURCES.workerShipImage]: 0,
      [IMAGE_CACHE_SOURCES.r2]: 0,
      [IMAGE_CACHE_SOURCES.unknown]: 0,
    },
    countsBySource: {
      [IMAGE_CACHE_SOURCES.app]: 0,
      [IMAGE_CACHE_SOURCES.worker]: 0,
      [IMAGE_CACHE_SOURCES.workerShipImage]: 0,
      [IMAGE_CACHE_SOURCES.r2]: 0,
      [IMAGE_CACHE_SOURCES.unknown]: 0,
    },
  };

  if (typeof caches === 'undefined') {
    return summary;
  }

  const cache = await caches.open(IMAGE_CACHE_NAME);
  const requests = await cache.keys();

  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) {
      continue;
    }

    const requestUrl = new URL(request.url);
    const source = response.headers.get(IMAGE_CACHE_METADATA_HEADERS.source) || getImageCacheSource(requestUrl);
    const size = await getImageResponseSize(response);
    const cachedAt = Number(response.headers.get(IMAGE_CACHE_METADATA_HEADERS.cachedAt) || '0') || 0;

    summary.entries.push({
      id: request.url,
      url: request.url,
      host: requestUrl.host,
      pathname: requestUrl.pathname,
      source,
      size,
      status: response.status,
      contentType: response.headers.get('Content-Type'),
      cachedAt,
    });

    summary.totalBytes += size;
    if (!(source in summary.bytesBySource)) {
      summary.bytesBySource[IMAGE_CACHE_SOURCES.unknown] += size;
      summary.countsBySource[IMAGE_CACHE_SOURCES.unknown] += 1;
    } else {
      summary.bytesBySource[source] += size;
      summary.countsBySource[source] += 1;
    }
  }

  summary.entries.sort((left, right) => (right.cachedAt || 0) - (left.cachedAt || 0));
  return summary;
}

async function clearImageCacheEntries(options = {}) {
  if (typeof caches === 'undefined') {
    return { deletedCount: 0 };
  }

  const cache = await caches.open(IMAGE_CACHE_NAME);
  let deletedCount = 0;

  if (options.id) {
    const deleted = await cache.delete(options.id);
    return {
      deletedCount: deleted ? 1 : 0,
    };
  }

  const requests = await cache.keys();

  for (const request of requests) {
    if (options.source) {
      const response = await cache.match(request);
      const requestUrl = new URL(request.url);
      const source = response?.headers.get(IMAGE_CACHE_METADATA_HEADERS.source) || getImageCacheSource(requestUrl);
      if (source !== options.source) {
        continue;
      }
    }

    const deleted = await cache.delete(request);
    if (deleted) {
      deletedCount += 1;
    }
  }

  return { deletedCount };
}

self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith(IMAGE_CACHE_NAME_PREFIX) && cacheName !== IMAGE_CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName)),
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  const modelMetadata = getModelRequestMetadata(requestUrl);

  if (modelMetadata) {
    event.respondWith(handleModelRequest(event, request, requestUrl, modelMetadata));
    return;
  }

  if (isOwnedImageRequest(request, requestUrl)) {
    event.respondWith(handleOwnedImageRequest(event, request, requestUrl));
  }
});

self.addEventListener('message', (event) => {
  const message = event.data || {};
  const port = event.ports && event.ports[0];

  if (!port) {
    return;
  }

  const respond = (payload) => {
    port.postMessage(payload);
  };

  if (message.type === MODEL_CACHE_MESSAGE_TYPES.list) {
    if (typeof indexedDB === 'undefined') {
      respond({
        ok: true,
        result: {
          supported: false,
          entries: [],
          totalBytes: 0,
          bytesByType: { glb: 0, sog: 0 },
          countsByType: { glb: 0, sog: 0 },
        },
      });
      return;
    }

    listModelCacheEntries()
      .then((result) => respond({ ok: true, result }))
      .catch((error) => respond({ ok: false, error: String(error && error.message ? error.message : error) }));
    return;
  }

  if (message.type === MODEL_CACHE_MESSAGE_TYPES.clear) {
    if (typeof indexedDB === 'undefined') {
      respond({ ok: true, result: { deletedCount: 0 } });
      return;
    }

    clearModelCacheEntries(message.payload || {})
      .then((result) => respond({ ok: true, result }))
      .catch((error) => respond({ ok: false, error: String(error && error.message ? error.message : error) }));
    return;
  }

  if (message.type === IMAGE_CACHE_MESSAGE_TYPES.list) {
    listImageCacheEntries()
      .then((result) => respond({ ok: true, result }))
      .catch((error) => respond({ ok: false, error: String(error && error.message ? error.message : error) }));
    return;
  }

  if (message.type === IMAGE_CACHE_MESSAGE_TYPES.clear) {
    clearImageCacheEntries(message.payload || {})
      .then((result) => respond({ ok: true, result }))
      .catch((error) => respond({ ok: false, error: String(error && error.message ? error.message : error) }));
    return;
  }

  respond({ ok: false, error: 'Unknown service worker message type.' });
});
