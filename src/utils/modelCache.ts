export type ModelCacheType = 'glb' | 'sog';

export type ShipImageCacheSource = 'app' | 'worker' | 'workerShipImage' | 'r2' | 'unknown';

export interface ModelCacheUrlMetadata {
  type: ModelCacheType;
  shipId: number;
  modelKey: string;
}

export interface ModelCacheEntrySummary {
  id: string;
  shipId: number;
  type: ModelCacheType;
  modelKey: string;
  url: string;
  sourceUrl: string;
  size: number;
  contentType: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ModelCacheListResult {
  supported: boolean;
  entries: ModelCacheEntrySummary[];
  totalBytes: number;
  bytesByType: Record<ModelCacheType, number>;
  countsByType: Record<ModelCacheType, number>;
}

export interface ClearModelCacheOptions {
  id?: string;
  type?: ModelCacheType;
  shipId?: number;
}

export interface ClearModelCacheResult {
  deletedCount: number;
}

export interface ShipImageCacheEntrySummary {
  id: string;
  url: string;
  host: string;
  pathname: string;
  source: ShipImageCacheSource;
  size: number;
  status: number;
  contentType: string | null;
  cachedAt: number;
}

export interface ShipImageCacheListResult {
  supported: boolean;
  entries: ShipImageCacheEntrySummary[];
  totalBytes: number;
  bytesBySource: Record<ShipImageCacheSource, number>;
  countsBySource: Record<ShipImageCacheSource, number>;
}

export interface ClearShipImageCacheOptions {
  id?: string;
  source?: ShipImageCacheSource;
}

export interface ClearShipImageCacheResult {
  deletedCount: number;
}

const MODEL_CACHE_PARAMS = {
  enabled: 'ch_model_cache',
  type: 'ch_model_type',
  shipId: 'ch_ship_id',
  key: 'ch_model_key',
} as const;

const MODEL_CACHE_SERVICE_WORKER_MESSAGES = {
  list: 'CH_MODEL_CACHE_LIST',
  clear: 'CH_MODEL_CACHE_CLEAR',
} as const;

const IMAGE_CACHE_SERVICE_WORKER_MESSAGES = {
  list: 'CH_IMAGE_CACHE_LIST',
  clear: 'CH_IMAGE_CACHE_CLEAR',
} as const;

const EMPTY_MODEL_CACHE_RESULT: ModelCacheListResult = {
  supported: false,
  entries: [],
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

const EMPTY_SHIP_IMAGE_CACHE_RESULT: ShipImageCacheListResult = {
  supported: false,
  entries: [],
  totalBytes: 0,
  bytesBySource: {
    app: 0,
    worker: 0,
    workerShipImage: 0,
    r2: 0,
    unknown: 0,
  },
  countsBySource: {
    app: 0,
    worker: 0,
    workerShipImage: 0,
    r2: 0,
    unknown: 0,
  },
};

function getBasePath() {
  const baseUrl = import.meta.env.BASE_URL || '/';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function isServiceWorkerAvailable() {
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof window !== 'undefined'
    && window.isSecureContext;
}

function createTimeout<T>(ms: number, message: string) {
  return new Promise<T>((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

async function getServiceWorker() {
  if (!isServiceWorkerAvailable()) {
    throw new Error('Service worker is not available in this browser context.');
  }

  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    createTimeout<ServiceWorkerRegistration>(8_000, 'Timed out waiting for service worker registration.'),
  ]);
  const worker = registration.active || navigator.serviceWorker.controller;

  if (!worker) {
    throw new Error('Service worker is not active yet.');
  }

  return worker;
}

async function postServiceWorkerMessage<T>(type: string, payload?: unknown) {
  const worker = await getServiceWorker();

  return await new Promise<T>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeoutId = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error('Timed out waiting for service worker response.'));
    }, 8_000);

    channel.port1.onmessage = (event: MessageEvent<{
      ok?: boolean;
      result?: T;
      error?: string;
    }>) => {
      window.clearTimeout(timeoutId);
      channel.port1.close();

      if (!event.data?.ok) {
        reject(new Error(event.data?.error || 'Service worker request failed.'));
        return;
      }

      resolve(event.data.result as T);
    };

    worker.postMessage({ type, payload }, [channel.port2]);
  });
}

export function withModelCacheParams(modelUrl: string, metadata: ModelCacheUrlMetadata) {
  if (typeof window === 'undefined' || !modelUrl) {
    return modelUrl;
  }

  const url = new URL(modelUrl, window.location.href);
  url.searchParams.set(MODEL_CACHE_PARAMS.enabled, '1');
  url.searchParams.set(MODEL_CACHE_PARAMS.type, metadata.type);
  url.searchParams.set(MODEL_CACHE_PARAMS.shipId, String(metadata.shipId));
  url.searchParams.set(MODEL_CACHE_PARAMS.key, metadata.modelKey);

  return url.toString();
}

export function registerModelCacheServiceWorker() {
  if (!isServiceWorkerAvailable()) {
    return;
  }

  const basePath = getBasePath();
  const serviceWorkerUrl = new URL(`${basePath}service-worker.js`, window.location.origin).toString();
  const scope = new URL(basePath, window.location.origin).toString();

  navigator.serviceWorker.register(serviceWorkerUrl, { scope }).catch((error) => {
    console.warn('Failed to register cache service worker.', error);
  });
}

export async function listModelCacheEntries() {
  if (!isServiceWorkerAvailable()) {
    return EMPTY_MODEL_CACHE_RESULT;
  }

  return await postServiceWorkerMessage<ModelCacheListResult>(MODEL_CACHE_SERVICE_WORKER_MESSAGES.list);
}

export async function clearModelCacheEntries(options: ClearModelCacheOptions = {}) {
  return await postServiceWorkerMessage<ClearModelCacheResult>(
    MODEL_CACHE_SERVICE_WORKER_MESSAGES.clear,
    options,
  );
}

export async function listShipImageCacheEntries() {
  if (!isServiceWorkerAvailable()) {
    return EMPTY_SHIP_IMAGE_CACHE_RESULT;
  }

  return await postServiceWorkerMessage<ShipImageCacheListResult>(IMAGE_CACHE_SERVICE_WORKER_MESSAGES.list);
}

export async function clearShipImageCacheEntries(options: ClearShipImageCacheOptions = {}) {
  return await postServiceWorkerMessage<ClearShipImageCacheResult>(
    IMAGE_CACHE_SERVICE_WORKER_MESSAGES.clear,
    options,
  );
}

export function formatModelCacheSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes >= 1024 * 1024 * 1024) {
    const value = bytes / (1024 * 1024 * 1024);
    return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} GB`;
  }

  if (bytes >= 1024 * 1024) {
    const value = bytes / (1024 * 1024);
    return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} MB`;
  }

  if (bytes >= 1024) {
    const value = bytes / 1024;
    return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} KB`;
  }

  return `${bytes} B`;
}
