import {
  PathFinderServiceData,
  WasmPathFinderParams,
  WasmPathFinderResult,
  WasmRequest,
  buildWasmGraphRequest,
  buildWasmStarts,
  extractShipIdFromNodeId,
  toFiniteNumber
} from './PathFinderWasmCommon';

interface WasmBaseGraphParams {
  edges: WasmPathFinderParams['edges'];
  nodes: WasmPathFinderParams['nodes'];
  data: WasmPathFinderParams['data'];
}

interface PathFinderWorkerWarmupRequest {
  type: 'warmup';
  requestId: number;
}

interface PathFinderWorkerPreloadRequest {
  type: 'preloadGraph';
  requestId: number;
  request: Pick<WasmRequest, 'nodes' | 'edges'>;
}

interface PathFinderWorkerFindPathsRequest {
  type: 'findPaths';
  requestId: number;
  request: WasmRequest;
}

type PathFinderWorkerRequest =
  | PathFinderWorkerWarmupRequest
  | PathFinderWorkerPreloadRequest
  | PathFinderWorkerFindPathsRequest;

interface PathFinderWorkerSuccess {
  type: 'success';
  requestId: number;
  result?: WasmPathFinderResult;
}

interface PathFinderWorkerError {
  type: 'error';
  requestId: number;
  error: string;
}

type PathFinderWorkerResponse = PathFinderWorkerSuccess | PathFinderWorkerError;

const PATH_FINDER_WORKER_URL = '/workers/pathFinderCWasm.worker.js';

class PathFinderCWasmService {
  private worker: Worker | null = null;

  private nextRequestId = 1;

  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }>();

  private cachedGraph: {
    nodesRef: WasmPathFinderParams['nodes'];
    edgesRef: WasmPathFinderParams['edges'];
    data: PathFinderServiceData;
    graph: Pick<WasmRequest, 'nodes' | 'edges'>;
  } | null = null;

  private ensureWorker(): Worker {
    if (typeof window === 'undefined') {
      throw new Error('C WASM path finder requires browser runtime');
    }

    if (this.worker) {
      return this.worker;
    }

    const worker = new Worker(PATH_FINDER_WORKER_URL);

    worker.onmessage = (event: MessageEvent<PathFinderWorkerResponse>) => {
      const message = event.data;
      const pending = this.pendingRequests.get(message.requestId);
      if (!pending) {
        return;
      }

      this.pendingRequests.delete(message.requestId);

      if (message.type === 'error') {
        pending.reject(new Error(message.error));
        return;
      }

      pending.resolve(message.result);
    };

    worker.onerror = (event: ErrorEvent) => {
      console.error('Path finder worker crashed:', event.message || event.error);
      this.rejectAllPending(new Error(event.message || 'Path finder worker crashed'));

      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }
    };

    this.worker = worker;
    return worker;
  }

  private rejectAllPending(reason: unknown): void {
    this.pendingRequests.forEach(pending => {
      pending.reject(reason);
    });
    this.pendingRequests.clear();
  }

  private postToWorker<T>(message: PathFinderWorkerRequest): Promise<T> {
    const worker = this.ensureWorker();

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(message.requestId, {
        resolve: value => resolve(value as T),
        reject
      });

      worker.postMessage(message);
    });
  }

  private allocRequestId(): number {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return requestId;
  }

  private buildBaseGraphRequest(params: WasmBaseGraphParams): WasmRequest {
    const graph = this.getOrBuildGraph({
      nodes: params.nodes,
      edges: params.edges,
      data: params.data
    });

    return {
      ...graph,
      starts: [],
      endShipId: '',
      exchangeRate: 1,
      conciergeValue: 0,
      pruneOpt: false
    };
  }

  private isSameServiceData(left: PathFinderServiceData, right: PathFinderServiceData): boolean {
    return left.ccus === right.ccus
      && left.wbHistory === right.wbHistory
      && left.hangarItems === right.hangarItems
      && left.importItems === right.importItems
      && left.priceHistoryMap === right.priceHistoryMap;
  }

  private getOrBuildGraph(params: Pick<WasmPathFinderParams, 'nodes' | 'edges' | 'data'>): Pick<WasmRequest, 'nodes' | 'edges'> {
    const cache = this.cachedGraph;
    if (
      cache
      && cache.nodesRef === params.nodes
      && cache.edgesRef === params.edges
      && this.isSameServiceData(cache.data, params.data)
    ) {
      return cache.graph;
    }

    const graph = buildWasmGraphRequest({
      nodes: params.nodes,
      edges: params.edges,
      data: params.data
    });

    this.cachedGraph = {
      nodesRef: params.nodes,
      edgesRef: params.edges,
      data: params.data,
      graph
    };

    return graph;
  }

  async warmup(): Promise<void> {
    const requestId = this.allocRequestId();
    await this.postToWorker<void>({
      type: 'warmup',
      requestId
    });
  }

  async preloadBaseGraph(params: WasmBaseGraphParams): Promise<void> {
    const request = this.buildBaseGraphRequest(params);
    const requestId = this.allocRequestId();

    await this.postToWorker<void>({
      type: 'preloadGraph',
      requestId,
      request: {
        nodes: request.nodes,
        edges: request.edges
      }
    });
  }

  async findAllPaths(params: WasmPathFinderParams): Promise<WasmPathFinderResult> {
    const graph = this.getOrBuildGraph({
      nodes: params.nodes,
      edges: params.edges,
      data: params.data
    });
    const nodeIdSet = new Set(graph.nodes.map(node => node.id));
    const request = {
      ...graph,
      starts: buildWasmStarts({
        startNodes: params.startNodes,
        startShipPrices: params.startShipPrices
      }, nodeIdSet),
      endShipId: extractShipIdFromNodeId(params.endNodeId),
      exchangeRate: toFiniteNumber(params.exchangeRate, 1),
      conciergeValue: toFiniteNumber(params.conciergeValue, 0),
      pruneOpt: params.pruneOpt
    } satisfies WasmRequest;
    const requestId = this.allocRequestId();

    return this.postToWorker<WasmPathFinderResult>({
      type: 'findPaths',
      requestId,
      request
    });
  }
}

export default new PathFinderCWasmService();
