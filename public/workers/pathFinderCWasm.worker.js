const C_WASM_JS_URL = '/wasm/ccu-pathfinder-c.js';
const C_WASM_URL = '/wasm/ccu-pathfinder-c.wasm';

let cWasmInitPromise = null;
let queued = Promise.resolve();
let loadedGraphSignature = null;
let clearStartsSupported = null;

function enqueue(task) {
  const nextTask = queued.then(task, task);
  queued = nextTask.then(() => undefined, () => undefined);
  return nextTask;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function graphSignature(request) {
  return JSON.stringify({
    nodes: request.nodes,
    edges: request.edges
  });
}

async function initCWasmRuntime() {
  if (typeof self.createCcuPathfinderCModule !== 'function') {
    self.importScripts(C_WASM_JS_URL);
  }

  if (typeof self.createCcuPathfinderCModule !== 'function') {
    throw new Error('C WASM module factory is unavailable in worker');
  }

  return self.createCcuPathfinderCModule({
    locateFile: path => {
      if (path.endsWith('.wasm')) {
        return C_WASM_URL;
      }
      return path;
    }
  });
}

function ensureCWasmInitialized() {
  if (!cWasmInitPromise) {
    cWasmInitPromise = initCWasmRuntime().catch(error => {
      cWasmInitPromise = null;
      throw error;
    });
  }
  return cWasmInitPromise;
}

function loadBaseGraph(module, request) {
  module.ccall('ccuReset', null, [], []);

  request.nodes.forEach(node => {
    module.ccall('ccuAddNode', 'number', ['string', 'string'], [node.id, node.shipId]);
  });

  request.edges.forEach(edge => {
    module.ccall(
      'ccuAddEdge',
      'number',
      ['string', 'string', 'string', 'number', 'number', 'number', 'number'],
      [
        edge.sourceNodeId,
        edge.sourceShipId,
        edge.targetNodeId,
        edge.usdPrice,
        edge.tpPrice,
        edge.isUsedUp ? 1 : 0,
        edge.allowUsedUpEdge ? 1 : 0
      ]
    );
  });
}

function ensureBaseGraphLoaded(module, request) {
  const signature = graphSignature(request);
  if (loadedGraphSignature === signature) {
    return;
  }

  loadBaseGraph(module, request);
  loadedGraphSignature = signature;
}

function tryClearStarts(module) {
  if (clearStartsSupported === false) {
    return false;
  }

  try {
    module.ccall('ccuClearStarts', null, [], []);
    clearStartsSupported = true;
    return true;
  } catch (error) {
    clearStartsSupported = false;
    return false;
  }
}

async function warmup() {
  await ensureCWasmInitialized();
}

async function preloadGraph(request) {
  const module = await ensureCWasmInitialized();
  ensureBaseGraphLoaded(module, request);
}

async function findPaths(request) {
  const module = await ensureCWasmInitialized();

  ensureBaseGraphLoaded(module, request);

  const startsCleared = tryClearStarts(module);
  if (!startsCleared) {
    loadBaseGraph(module, request);
    loadedGraphSignature = graphSignature(request);
  }

  module.ccall(
    'ccuSetConfig',
    null,
    ['string', 'number', 'number', 'number'],
    [
      request.endShipId,
      request.exchangeRate,
      request.conciergeValue,
      request.pruneOpt ? 1 : 0
    ]
  );

  request.starts.forEach(start => {
    module.ccall(
      'ccuAddStart',
      'number',
      ['string', 'number', 'number'],
      [start.nodeId, start.usdCost, start.tpCost]
    );
  });

  const totalCallStart = performance.now();
  const rawPtr = module.ccall('ccuFindAllPathsC', 'number', [], []);
  const rawResult = rawPtr > 0
    ? module.UTF8ToString(rawPtr)
    : '{"error":"missing C WASM response"}';

  if (rawPtr > 0) {
    module.ccall('ccuFreeCString', null, ['number'], [rawPtr]);
  }

  const totalCallMs = performance.now() - totalCallStart;
  const parsed = JSON.parse(rawResult);

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  return {
    paths: parsed.paths || [],
    elapsedMs: toFiniteNumber(parsed.elapsedMs, totalCallMs),
    totalCallMs,
    stats: parsed.stats || { expanded: 0, pruned: 0, returned: 0 }
  };
}

self.onmessage = event => {
  const message = event.data;

  enqueue(async () => {
    if (!message || typeof message.type !== 'string' || typeof message.requestId !== 'number') {
      return;
    }

    try {
      if (message.type === 'warmup') {
        await warmup();
        self.postMessage({
          type: 'success',
          requestId: message.requestId
        });
        return;
      }

      if (message.type === 'preloadGraph') {
        await preloadGraph(message.request);
        self.postMessage({
          type: 'success',
          requestId: message.requestId
        });
        return;
      }

      if (message.type === 'findPaths') {
        const result = await findPaths(message.request);
        self.postMessage({
          type: 'success',
          requestId: message.requestId,
          result
        });
        return;
      }

      self.postMessage({
        type: 'error',
        requestId: message.requestId,
        error: `Unsupported worker request type: ${String(message.type)}`
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        requestId: message.requestId,
        error: toErrorMessage(error)
      });
    }
  });
};
