import {
  WasmPathFinderParams,
  WasmPathFinderResult,
  WasmResponse,
  buildWasmRequest,
  toFiniteNumber
} from './PathFinderWasmCommon';

interface CPathFinderModule {
  ccall: (
    ident: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[]
  ) => unknown;
  UTF8ToString: (ptr: number) => string;
}

declare global {
  interface Window {
    createCcuPathfinderCModule?: (options?: {
      locateFile?: (path: string) => string;
    }) => Promise<CPathFinderModule>;
  }
}

const C_WASM_JS_URL = '/wasm/ccu-pathfinder-c.js';
const C_WASM_URL = '/wasm/ccu-pathfinder-c.wasm';
const INIT_TIMEOUT_MS = 5000;

let cWasmInitPromise: Promise<CPathFinderModule> | null = null;

function loadScriptOnce(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[data-c-wasm-url="${url}"]`) as HTMLScriptElement | null;
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error(`Failed to load script: ${url}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.cWasmUrl = url;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      reject(new Error(`Failed to load script: ${url}`));
    };
    document.head.appendChild(script);
  });
}

async function waitForModuleFactory(): Promise<void> {
  const start = performance.now();
  while (typeof window.createCcuPathfinderCModule !== 'function') {
    if (performance.now() - start > INIT_TIMEOUT_MS) {
      throw new Error('Timeout waiting for C WASM module factory');
    }
    await new Promise<void>(resolve => {
      window.setTimeout(resolve, 16);
    });
  }
}

async function initCWasmRuntime(): Promise<CPathFinderModule> {
  if (typeof window === 'undefined') {
    throw new Error('C WASM path finder requires browser runtime');
  }

  if (typeof window.createCcuPathfinderCModule !== 'function') {
    await loadScriptOnce(C_WASM_JS_URL);
    await waitForModuleFactory();
  }

  if (typeof window.createCcuPathfinderCModule !== 'function') {
    throw new Error('C WASM module factory is unavailable');
  }

  return window.createCcuPathfinderCModule({
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) {
        return C_WASM_URL;
      }
      return path;
    }
  });
}

function ensureCWasmInitialized(): Promise<CPathFinderModule> {
  if (!cWasmInitPromise) {
    cWasmInitPromise = initCWasmRuntime().catch(error => {
      cWasmInitPromise = null;
      throw error;
    });
  }
  return cWasmInitPromise;
}

class PathFinderCWasmService {
  async findAllPaths(params: WasmPathFinderParams): Promise<WasmPathFinderResult> {
    const request = buildWasmRequest(params);
    const module = await ensureCWasmInitialized();

    module.ccall('ccuReset', null, [], []);
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

    request.starts.forEach(start => {
      module.ccall(
        'ccuAddStart',
        'number',
        ['string', 'number', 'number'],
        [start.nodeId, start.usdCost, start.tpCost]
      );
    });

    const totalCallStart = performance.now();
    const rawPtr = module.ccall('ccuFindAllPathsC', 'number', [], []) as number;
    const rawResult = rawPtr > 0 ? module.UTF8ToString(rawPtr) : '{"error":"missing C WASM response"}';
    if (rawPtr > 0) {
      module.ccall('ccuFreeCString', null, ['number'], [rawPtr]);
    }
    const totalCallMs = performance.now() - totalCallStart;

    const parsed = JSON.parse(rawResult) as WasmResponse;
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
}

export default new PathFinderCWasmService();
