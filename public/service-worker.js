const DB_NAME = 'citizens-hub-model-cache';
const DB_VERSION = 1;
const MODEL_STORE = 'models';

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

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  const metadata = getModelRequestMetadata(requestUrl);

  if (!metadata) {
    return;
  }

  event.respondWith(handleModelRequest(event, request, requestUrl, metadata));
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

  if (message.type === MODEL_CACHE_MESSAGE_TYPES.list) {
    listModelCacheEntries()
      .then((result) => respond({ ok: true, result }))
      .catch((error) => respond({ ok: false, error: String(error && error.message ? error.message : error) }));
    return;
  }

  if (message.type === MODEL_CACHE_MESSAGE_TYPES.clear) {
    clearModelCacheEntries(message.payload || {})
      .then((result) => respond({ ok: true, result }))
      .catch((error) => respond({ ok: false, error: String(error && error.message ? error.message : error) }));
    return;
  }

  respond({ ok: false, error: 'Unknown service worker message type.' });
});
