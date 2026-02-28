import { Edge, Node } from 'reactflow';
import { CcuEdgeData, CcuSourceType, Ship } from '../../../types';

interface CPathBuilderModule {
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
    createCcuPathbuilderCModule?: (options?: {
      locateFile?: (path: string) => string;
    }) => Promise<CPathBuilderModule>;
  }
}

const C_WASM_JS_URL = '/wasm/ccu-pathbuilder-c.js';
const C_WASM_URL = '/wasm/ccu-pathbuilder-c.wasm';
const INIT_TIMEOUT_MS = 5000;
const NODE_BATCH_SIZE = 512;
const EDGE_BATCH_SIZE = 1024;

const WASM_MODE_REACHABLE = 1;
const WASM_MODE_SAVING = 2;
const WASM_MODE_REVIEW = 3;
const WASM_REVIEW_MAX_REQUIRED_BITS = 20;

let cWasmInitPromise: Promise<CPathBuilderModule> | null = null;

interface WasmPathBuilderResponse {
  nodeMask?: number[];
  edgeMask?: number[];
  x?: number[];
  y?: number[];
  routeEdgeIndices?: number[];
  totalCost?: number;
  elapsedMs?: number;
  error?: string;
}

interface ShipNodeLikeData {
  ship: Ship;
  [key: string]: unknown;
}

export interface PathBuilderWasmResult {
  nodes: Node<ShipNodeLikeData>[];
  edges: Edge<CcuEdgeData>[];
  elapsedMs: number;
}

export interface PathBuilderWasmFilterParams {
  mode: typeof WASM_MODE_REACHABLE | typeof WASM_MODE_SAVING;
  nodes: Node<ShipNodeLikeData>[];
  edges: Edge<CcuEdgeData>[];
  startShipId: number;
  targetShipId: number;
  directUpgradeCost?: number;
  edgeActiveMask?: Uint8Array;
}

export interface PathBuilderWasmReviewResult {
  routeEdgeIndices: number[];
  totalCost: number;
  elapsedMs: number;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function getEdgeCost(edge: Edge<CcuEdgeData>): number {
  if (!edge.data) return Number.POSITIVE_INFINITY;

  if (typeof edge.data.customPrice === 'number') {
    return edge.data.customPrice;
  }

  const sourcePrice = edge.data.sourceShip?.msrp || 0;
  const targetPrice = edge.data.targetShip?.msrp || 0;
  return (targetPrice - sourcePrice) / 100;
}

function getOfficialEdgeCost(edge: Edge<CcuEdgeData>): number {
  const sourcePrice = edge.data?.sourceShip?.msrp || 0;
  const targetPrice = edge.data?.targetShip?.msrp || 0;
  return (targetPrice - sourcePrice) / 100;
}

function getHangarRequirementKeyFromEdge(edge: Edge<CcuEdgeData>): string | null {
  if (edge.data?.sourceType !== CcuSourceType.HANGER) {
    return null;
  }

  const sourceName = edge.data?.sourceShip?.name;
  const targetName = edge.data?.targetShip?.name;
  if (!sourceName || !targetName) {
    return null;
  }

  return `${sourceName.trim().toUpperCase()}->${targetName.trim().toUpperCase()}`;
}

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
  while (typeof window.createCcuPathbuilderCModule !== 'function') {
    if (performance.now() - start > INIT_TIMEOUT_MS) {
      throw new Error('Timeout waiting for C WASM pathbuilder factory');
    }
    await new Promise<void>(resolve => {
      window.setTimeout(resolve, 16);
    });
  }
}

async function initCWasmRuntime(): Promise<CPathBuilderModule> {
  if (typeof window === 'undefined') {
    throw new Error('C WASM path builder requires browser runtime');
  }

  if (typeof window.createCcuPathbuilderCModule !== 'function') {
    await loadScriptOnce(C_WASM_JS_URL);
    await waitForModuleFactory();
  }

  if (typeof window.createCcuPathbuilderCModule !== 'function') {
    throw new Error('C WASM path builder module factory is unavailable');
  }

  return window.createCcuPathbuilderCModule({
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) {
        return C_WASM_URL;
      }
      return path;
    }
  });
}

function ensureCWasmInitialized(): Promise<CPathBuilderModule> {
  if (!cWasmInitPromise) {
    cWasmInitPromise = initCWasmRuntime().catch(error => {
      cWasmInitPromise = null;
      throw error;
    });
  }
  return cWasmInitPromise;
}

class PathBuilderCWasmService {
  private _cachedLoadedGraph: {
    module: CPathBuilderModule;
    nodesRef: Node<ShipNodeLikeData>[];
    edgesRef: Edge<CcuEdgeData>[];
    loadedEdgeOriginalIndices: number[];
  } | null = null;

  private _loadGraphToWasm(params: {
    module: CPathBuilderModule;
    nodes: Node<ShipNodeLikeData>[];
    edges: Edge<CcuEdgeData>[];
  }): { loadedEdgeOriginalIndices: number[] } {
    const { module, nodes, edges } = params;
    module.ccall('pbReset', null, [], []);

    const nodeIndexById = new Map<string, number>();
    const nodeCount = nodes.length;
    if (nodeCount > 0) {
      const shipIds = new Int32Array(nodeCount);
      const xs = new Float64Array(nodeCount);
      const ys = new Float64Array(nodeCount);
      const msrps = new Float64Array(nodeCount);

      nodes.forEach((node, index) => {
        nodeIndexById.set(node.id, index);
        shipIds[index] = Number(node.data?.ship?.id);
        xs[index] = toFiniteNumber(node.position?.x, 0);
        ys[index] = toFiniteNumber(node.position?.y, 0);
        msrps[index] = toFiniteNumber(node.data?.ship?.msrp, 0);
      });

      for (let offset = 0; offset < nodeCount; offset += NODE_BATCH_SIZE) {
        const end = Math.min(nodeCount, offset + NODE_BATCH_SIZE);
        module.ccall(
          'pbAddNodeBatch',
          'number',
          ['array', 'array', 'array', 'array', 'number'],
          [
            toBytes(shipIds.subarray(offset, end)),
            toBytes(xs.subarray(offset, end)),
            toBytes(ys.subarray(offset, end)),
            toBytes(msrps.subarray(offset, end)),
            end - offset
          ]
        );
      }
    }

    const edgeCapacity = edges.length;
    const loadedEdgeOriginalIndices: number[] = [];
    if (edgeCapacity > 0) {
      const sourceIdx = new Int32Array(edgeCapacity);
      const targetIdx = new Int32Array(edgeCapacity);
      const actualCosts = new Float64Array(edgeCapacity);
      const officialCosts = new Float64Array(edgeCapacity);

      let edgeCount = 0;
      edges.forEach((edge, originalIndex) => {
        const sourceIndex = nodeIndexById.get(edge.source);
        const targetIndex = nodeIndexById.get(edge.target);
        if (sourceIndex === undefined || targetIndex === undefined) {
          return;
        }

        sourceIdx[edgeCount] = sourceIndex;
        targetIdx[edgeCount] = targetIndex;
        actualCosts[edgeCount] = toFiniteNumber(getEdgeCost(edge), 0);
        officialCosts[edgeCount] = toFiniteNumber(getOfficialEdgeCost(edge), 0);
        loadedEdgeOriginalIndices.push(originalIndex);
        edgeCount++;
      });

      if (edgeCount > 0) {
        for (let offset = 0; offset < edgeCount; offset += EDGE_BATCH_SIZE) {
          const end = Math.min(edgeCount, offset + EDGE_BATCH_SIZE);
          module.ccall(
            'pbAddEdgeBatch',
            'number',
            ['array', 'array', 'array', 'array', 'number'],
            [
              toBytes(sourceIdx.subarray(offset, end)),
              toBytes(targetIdx.subarray(offset, end)),
              toBytes(actualCosts.subarray(offset, end)),
              toBytes(officialCosts.subarray(offset, end)),
              end - offset
            ]
          );
        }
      }
    }

    return { loadedEdgeOriginalIndices };
  }

  private async _ensureGraphLoaded(params: {
    nodes: Node<ShipNodeLikeData>[];
    edges: Edge<CcuEdgeData>[];
  }): Promise<{
    module: CPathBuilderModule;
    loadedEdgeOriginalIndices: number[];
  }> {
    const module = await ensureCWasmInitialized();
    const cached = this._cachedLoadedGraph;
    if (
      cached &&
      cached.module === module &&
      cached.nodesRef === params.nodes &&
      cached.edgesRef === params.edges
    ) {
      return {
        module,
        loadedEdgeOriginalIndices: cached.loadedEdgeOriginalIndices
      };
    }

    const loaded = this._loadGraphToWasm({
      module,
      nodes: params.nodes,
      edges: params.edges
    });

    this._cachedLoadedGraph = {
      module,
      nodesRef: params.nodes,
      edgesRef: params.edges,
      loadedEdgeOriginalIndices: loaded.loadedEdgeOriginalIndices
    };

    return {
      module,
      loadedEdgeOriginalIndices: loaded.loadedEdgeOriginalIndices
    };
  }

  private _setEdgeActiveMask(params: {
    module: CPathBuilderModule;
    loadedEdgeOriginalIndices: number[];
    originalEdgeCount: number;
    edgeActiveMask?: Uint8Array;
  }): void {
    const { module, loadedEdgeOriginalIndices, originalEdgeCount, edgeActiveMask } = params;
    const loadedEdgeCount = loadedEdgeOriginalIndices.length;
    const loadedMask = new Uint8Array(loadedEdgeCount);

    if (loadedEdgeCount === 0) {
      return;
    }

    if (edgeActiveMask && edgeActiveMask.length !== originalEdgeCount) {
      throw new Error('invalid C WASM edge active mask length');
    }

    loadedEdgeOriginalIndices.forEach((originalEdgeIndex, wasmEdgeIndex) => {
      if (!edgeActiveMask) {
        loadedMask[wasmEdgeIndex] = 1;
        return;
      }
      loadedMask[wasmEdgeIndex] = edgeActiveMask[originalEdgeIndex] ? 1 : 0;
    });

    const setResult = module.ccall(
      'pbSetEdgeActiveMaskBatch',
      'number',
      ['array', 'number'],
      [toBytes(loadedMask), loadedEdgeCount]
    ) as number;
    if (!Number.isFinite(setResult) || setResult < 0) {
      throw new Error('failed to set C-WASM active edge mask');
    }
  }

  async warmup(): Promise<void> {
    await ensureCWasmInitialized();
  }

  async preloadGraph(params: {
    nodes: Node<ShipNodeLikeData>[];
    edges: Edge<CcuEdgeData>[];
  }): Promise<void> {
    await this._ensureGraphLoaded({
      nodes: params.nodes,
      edges: params.edges
    });
  }

  private _runWasm(mode: number, startShipId: number, targetShipId: number, fourthArg: number, module: CPathBuilderModule): WasmPathBuilderResponse {
    const rawPtr = module.ccall(
      'pbRun',
      'number',
      ['number', 'number', 'number', 'number'],
      [mode, startShipId, targetShipId, fourthArg]
    ) as number;

    const rawResult = rawPtr > 0 ? module.UTF8ToString(rawPtr) : '{"error":"missing C WASM pathbuilder response"}';
    if (rawPtr > 0) {
      module.ccall('pbFreeCString', null, ['number'], [rawPtr]);
    }

    const parsed = JSON.parse(rawResult) as WasmPathBuilderResponse;
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    return parsed;
  }

  async filterPaths(params: PathBuilderWasmFilterParams): Promise<PathBuilderWasmResult> {
    const { module, loadedEdgeOriginalIndices } = await this._ensureGraphLoaded({
      nodes: params.nodes,
      edges: params.edges
    });
    this._setEdgeActiveMask({
      module,
      loadedEdgeOriginalIndices,
      originalEdgeCount: params.edges.length,
      edgeActiveMask: params.edgeActiveMask
    });

    const parsed = this._runWasm(
      params.mode,
      params.startShipId,
      params.targetShipId,
      toFiniteNumber(params.directUpgradeCost, 0),
      module
    );

    const nodeMask = Array.isArray(parsed.nodeMask) ? parsed.nodeMask : [];
    const edgeMask = Array.isArray(parsed.edgeMask) ? parsed.edgeMask : [];
    const xs = Array.isArray(parsed.x) ? parsed.x : [];
    const ys = Array.isArray(parsed.y) ? parsed.y : [];

    if (nodeMask.length !== params.nodes.length || edgeMask.length !== loadedEdgeOriginalIndices.length) {
      throw new Error('invalid C WASM pathbuilder payload length');
    }

    const keptNodeIds = new Set<string>();
    const nodes = params.nodes.flatMap((node, index) => {
      if (!nodeMask[index]) {
        return [];
      }

      keptNodeIds.add(node.id);
      return [{
        ...node,
        position: {
          x: toFiniteNumber(xs[index], node.position.x),
          y: toFiniteNumber(ys[index], node.position.y)
        }
      }];
    });

    const keptEdgeOriginalIndexSet = new Set<number>();
    edgeMask.forEach((keep, wasmIndex) => {
      if (!keep) {
        return;
      }
      const originalIndex = loadedEdgeOriginalIndices[wasmIndex];
      if (typeof originalIndex === 'number') {
        keptEdgeOriginalIndexSet.add(originalIndex);
      }
    });

    const edges = params.edges.filter((edge, index) =>
      keptEdgeOriginalIndexSet.has(index) && keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target)
    );

    return {
      nodes,
      edges,
      elapsedMs: toFiniteNumber(parsed.elapsedMs, 0)
    };
  }

  async filterReachable(params: {
    nodes: Node<ShipNodeLikeData>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
    edgeActiveMask?: Uint8Array;
  }): Promise<PathBuilderWasmResult> {
    return this.filterPaths({
      mode: WASM_MODE_REACHABLE,
      nodes: params.nodes,
      edges: params.edges,
      startShipId: params.startShipId,
      targetShipId: params.targetShipId,
      edgeActiveMask: params.edgeActiveMask
    });
  }

  async filterSaving(params: {
    nodes: Node<ShipNodeLikeData>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
    directUpgradeCost: number;
    edgeActiveMask?: Uint8Array;
  }): Promise<PathBuilderWasmResult> {
    return this.filterPaths({
      mode: WASM_MODE_SAVING,
      nodes: params.nodes,
      edges: params.edges,
      startShipId: params.startShipId,
      targetShipId: params.targetShipId,
      directUpgradeCost: params.directUpgradeCost,
      edgeActiveMask: params.edgeActiveMask
    });
  }

  async findBestReviewRoute(params: {
    nodes: Node<ShipNodeLikeData>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
    requiredHangarCcuKeys: Set<string>;
    edgeActiveMask?: Uint8Array;
  }): Promise<PathBuilderWasmReviewResult> {
    const requiredKeyList = Array.from(params.requiredHangarCcuKeys);
    if (requiredKeyList.length > WASM_REVIEW_MAX_REQUIRED_BITS) {
      throw new Error(`required hangar keys exceed C-WASM limit (${WASM_REVIEW_MAX_REQUIRED_BITS})`);
    }

    const requiredBitByKey = new Map<string, number>();
    requiredKeyList.forEach((key, idx) => {
      requiredBitByKey.set(key, 1 << idx);
    });

    const { module, loadedEdgeOriginalIndices } = await this._ensureGraphLoaded({
      nodes: params.nodes,
      edges: params.edges
    });
    this._setEdgeActiveMask({
      module,
      loadedEdgeOriginalIndices,
      originalEdgeCount: params.edges.length,
      edgeActiveMask: params.edgeActiveMask
    });

    const loadedEdgeCount = loadedEdgeOriginalIndices.length;
    if (loadedEdgeCount > 0) {
      const reviewBits = new Uint32Array(loadedEdgeCount);
      loadedEdgeOriginalIndices.forEach((originalEdgeIndex, wasmEdgeIndex) => {
        const edge = params.edges[originalEdgeIndex];
        if (!edge) {
          return;
        }

        const hangarKey = getHangarRequirementKeyFromEdge(edge);
        const requiredBit = hangarKey ? (requiredBitByKey.get(hangarKey) || 0) : 0;
        reviewBits[wasmEdgeIndex] = requiredBit;
      });

      const setResult = module.ccall(
        'pbSetEdgeReviewBitsBatch',
        'number',
        ['array', 'number'],
        [toBytes(reviewBits), loadedEdgeCount]
      ) as number;
      if (!Number.isFinite(setResult) || setResult < 0) {
        throw new Error('failed to set C-WASM review edge requirements');
      }
    }

    const parsed = this._runWasm(
      WASM_MODE_REVIEW,
      params.startShipId,
      params.targetShipId,
      requiredKeyList.length,
      module
    );

    const routeEdgeIndices = Array.isArray(parsed.routeEdgeIndices) ? parsed.routeEdgeIndices : [];
    const mappedRouteEdgeIndices = routeEdgeIndices.map(wasmEdgeIndex => {
      if (!Number.isInteger(wasmEdgeIndex) || wasmEdgeIndex < 0 || wasmEdgeIndex >= loadedEdgeOriginalIndices.length) {
        throw new Error('invalid C-WASM review route edge index');
      }

      const originalEdgeIndex = loadedEdgeOriginalIndices[wasmEdgeIndex];
      if (!Number.isInteger(originalEdgeIndex) || originalEdgeIndex < 0 || originalEdgeIndex >= params.edges.length) {
        throw new Error('invalid C-WASM review route edge mapping');
      }

      return originalEdgeIndex;
    });

    return {
      routeEdgeIndices: mappedRouteEdgeIndices,
      totalCost: toFiniteNumber(parsed.totalCost, 0),
      elapsedMs: toFiniteNumber(parsed.elapsedMs, 0)
    };
  }
}

export default new PathBuilderCWasmService();
