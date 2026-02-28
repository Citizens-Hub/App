import { Ccu, CcuEdgeData, ImportItem, PriceHistoryEntity, WbHistoryData } from '@/types';
import { Edge, Node } from 'reactflow';
import { HangarItem } from './CcuSourceTypeFactory';
import pathFinderService from './PathFinderService';

interface GoRuntime {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

declare global {
  interface Window {
    Go?: new () => GoRuntime;
    ccuFindAllPaths?: (payload: string) => string;
  }
}

const WASM_URL = '/wasm/ccu-pathfinder.wasm';
const WASM_EXEC_URL = '/wasm/wasm_exec.js';
const INIT_TIMEOUT_MS = 5000;

interface WasmNode {
  id: string;
  shipId: string;
}

interface WasmEdge {
  sourceNodeId: string;
  sourceShipId: string;
  targetNodeId: string;
  usdPrice: number;
  tpPrice: number;
  isUsedUp: boolean;
  allowUsedUpEdge: boolean;
}

interface WasmStart {
  nodeId: string;
  usdCost: number;
  tpCost: number;
}

interface WasmRequest {
  nodes: WasmNode[];
  edges: WasmEdge[];
  starts: WasmStart[];
  endShipId: string;
  exchangeRate: number;
  conciergeValue: number;
  pruneOpt: boolean;
}

interface WasmStats {
  expanded: number;
  pruned: number;
  returned: number;
}

interface WasmResponse {
  paths?: string[][];
  elapsedMs?: number;
  stats?: WasmStats;
  error?: string;
}

export interface PathFinderServiceData {
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  hangarItems: HangarItem[];
  importItems: ImportItem[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
}

export interface WasmPathFinderParams {
  startNodes: Node[];
  endNodeId: string;
  edges: Edge<CcuEdgeData>[];
  nodes: Node[];
  exchangeRate: number;
  conciergeValue: string;
  pruneOpt: boolean;
  startShipPrices: Record<string, number | string>;
  data: PathFinderServiceData;
}

export interface WasmPathFinderResult {
  paths: string[][];
  elapsedMs: number;
  totalCallMs: number;
  stats: WasmStats;
}

let wasmInitPromise: Promise<void> | null = null;

function extractShipIdFromNodeId(nodeId: string): string {
  const segments = nodeId.split('-');
  return segments.length >= 2 ? segments[1] : nodeId;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadScriptOnce(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[data-wasm-url="${url}"]`) as HTMLScriptElement | null;
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
    script.dataset.wasmUrl = url;
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

async function instantiateWasmModule(importObject: WebAssembly.Imports): Promise<WebAssembly.Instance> {
  if (WebAssembly.instantiateStreaming) {
    try {
      const streamingResult = await WebAssembly.instantiateStreaming(fetch(WASM_URL), importObject);
      return streamingResult.instance;
    } catch {
      // Fallback when dev server or proxy does not return `application/wasm`.
    }
  }

  const response = await fetch(WASM_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch wasm module: ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  const compiled = await WebAssembly.instantiate(bytes, importObject);
  return compiled.instance;
}

async function waitForWasmExport(): Promise<void> {
  const start = performance.now();
  while (typeof window.ccuFindAllPaths !== 'function') {
    if (performance.now() - start > INIT_TIMEOUT_MS) {
      throw new Error('Timeout waiting for ccuFindAllPaths export from Go WASM runtime');
    }
    await new Promise<void>(resolve => {
      window.setTimeout(resolve, 16);
    });
  }
}

async function initWasmRuntime(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('WASM path finder requires browser runtime');
  }
  if (typeof window.ccuFindAllPaths === 'function') {
    return;
  }

  if (!window.Go) {
    await loadScriptOnce(WASM_EXEC_URL);
  }

  if (!window.Go) {
    throw new Error('Go WASM runtime is unavailable after loading wasm_exec.js');
  }

  const go = new window.Go();
  const instance = await instantiateWasmModule(go.importObject);
  void go.run(instance);
  await waitForWasmExport();
}

function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = initWasmRuntime().catch(error => {
      wasmInitPromise = null;
      throw error;
    });
  }
  return wasmInitPromise;
}

function buildWasmRequest(params: WasmPathFinderParams): WasmRequest {
  const nodeMap = new Map<string, WasmNode>();

  params.nodes.forEach(node => {
    nodeMap.set(node.id, {
      id: node.id,
      shipId: extractShipIdFromNodeId(node.id)
    });
  });

  const starts: WasmStart[] = params.startNodes
    .filter(node => nodeMap.has(node.id))
    .map(node => ({
      nodeId: node.id,
      usdCost: toFiniteNumber(params.startShipPrices[node.id], 0),
      tpCost: 0
    }));

  const edges: WasmEdge[] = [];
  params.edges.forEach(edge => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      return;
    }

    const priceInfo = pathFinderService.getPriceInfo(edge, params.data);
    const allowUsedUpEdge = priceInfo.isUsedUp ? pathFinderService.isSingleEdgeInAnyCompletedPath(edge) : false;

    edges.push({
      sourceNodeId: edge.source,
      sourceShipId: extractShipIdFromNodeId(edge.source),
      targetNodeId: edge.target,
      usdPrice: toFiniteNumber(priceInfo.usdPrice, 0),
      tpPrice: toFiniteNumber(priceInfo.tpPrice, 0),
      isUsedUp: priceInfo.isUsedUp === true,
      allowUsedUpEdge
    });
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    starts,
    endShipId: extractShipIdFromNodeId(params.endNodeId),
    exchangeRate: toFiniteNumber(params.exchangeRate, 1),
    conciergeValue: toFiniteNumber(params.conciergeValue, 0),
    pruneOpt: params.pruneOpt
  };
}

class PathFinderWasmService {
  async findAllPaths(params: WasmPathFinderParams): Promise<WasmPathFinderResult> {
    const request = buildWasmRequest(params);

    await ensureWasmInitialized();
    if (typeof window.ccuFindAllPaths !== 'function') {
      throw new Error('ccuFindAllPaths is not available in WASM runtime');
    }

    const totalCallStart = performance.now();
    const rawResult = window.ccuFindAllPaths(JSON.stringify(request));
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

export default new PathFinderWasmService();
