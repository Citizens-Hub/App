import { Ship, Ccu, WbHistoryData, HangarItem, ImportItem, PriceHistoryEntity, CcuValidityWindow } from '../../../types';
import { CcuSourceType, CcuEdgeData } from '../../../types';
import { Node, Edge } from 'reactflow';
import pathBuilderCWasmService from './PathBuilderCWasmService';

type ShipVariant = 'base' | 'wb' | 'historical';

interface ShipNodeData {
  ship: Ship;
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  id: string;
  shipVariant: ShipVariant;
  pathShipName: string;
  plannerShipKey: string;
  [key: string]: unknown;
}

interface SpecialShipPricing {
  priceCents: number;
  sourceType: CcuSourceType;
  validityWindows?: CcuValidityWindow[];
}

interface SourceSkuPriceConstraintParams {
  sourceShipId: number;
  targetPriceCents: number;
  targetValidityWindows: CcuValidityWindow[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
  enforceSimultaneousIncrease?: boolean;
}

interface SourceStandardPriceWindow {
  sku: number;
  priceCents: number;
  startTs: number;
  endTs: number | null;
}

interface PathLayoutOptions {
  startPosition?: { x: number; y: number };
  levelSpacing?: number;
  minVerticalSpacing?: number;
  preferredLevelHeight?: number;
}

interface PathBuildOptions {
  exhaustiveEdgeSearch?: boolean;
  preferHangarCcu?: boolean;
  buildConstraintAwareGraph?: boolean;
}

export type PathGraphResult = { nodes: Node<ShipNodeData>[]; edges: Edge<CcuEdgeData>[] };

export interface AutoPathSessionData {
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  hangarItems: HangarItem[];
  importItems: ImportItem[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
}

interface AutoPathBaseGraphCache {
  key: string;
  data: AutoPathSessionData;
  graph: PathGraphResult;
}

export type AutoPathBaseGraphOptions = Pick<
  AutoPathBuildRequest,
  'rangeStartTs' | 'rangeEndTs' | 'includeWarbond' | 'includePriceIncrease' | 'preferHangarCcu'
>;

export interface AutoPathSessionInitOptions {
  warmupWasm?: boolean;
}

interface AutoPathExclusionResult {
  filteredEdges: Edge<CcuEdgeData>[];
  edgeActiveMask: Uint8Array;
}

type AutoPathFilterRequest = Pick<
  AutoPathBuildRequest,
  | 'startShipId'
  | 'targetShipId'
  | 'rangeStartTs'
  | 'rangeEndTs'
  | 'includeWarbond'
  | 'includePriceIncrease'
  | 'preferHangarCcu'
  | 'excludedCcuKeys'
  | 'excludedSkuIds'
  | 'requiredHangarCcuKeys'
>;

export interface AutoPathExecutionOptions {
  useWasmPathBuilder?: boolean;
  comparePathBuilderPerf?: boolean;
}

export interface AutoPathBuildPerfStats {
  mode: 'js' | 'c-wasm';
  jsElapsedMs?: number;
  cWasmElapsedMs?: number;
  preprocessElapsedMs?: number;
  totalElapsedMs?: number;
  consistency?: 'match' | 'mismatch' | 'unavailable';
  mismatchWithJs?: {
    cWasmOnly: number;
    jsOnly: number;
  };
  cWasmSpeedupRatio?: number;
}

export interface AutoPathBuildResult extends PathGraphResult {
  perfStats?: AutoPathBuildPerfStats;
  mismatchMessage?: string | null;
}

export interface AutoPathReviewEdge {
  edge: Edge<CcuEdgeData>;
  sourceShip: Ship;
  targetShip: Ship;
  cost: number;
  key: string;
  sourceType: CcuSourceType;
  validityWindows?: CcuValidityWindow[];
}

export interface AutoPathReviewRoute {
  nodeIds: string[];
  edges: AutoPathReviewEdge[];
  totalCost: number;
}

export interface AutoPathReviewResult {
  route: AutoPathReviewRoute | null;
  perfStats?: AutoPathBuildPerfStats;
  mismatchMessage?: string | null;
}

export interface AutoPathBuildRequest {
  startShipId: number;
  targetShipId: number;
  rangeStartTs: number;
  rangeEndTs: number;
  includeWarbond: boolean;
  includePriceIncrease: boolean;
  ignoreTargetAvailability: boolean;
  preferHangarCcu: boolean;
  excludedCcuKeys?: string[];
  excludedSkuIds?: number[];
  requiredHangarCcuKeys?: string[];
}

export class PathBuilderService {
  private _autoPathSessionData: AutoPathSessionData | null = null;
  private _autoPathBaseGraphCache: AutoPathBaseGraphCache | null = null;

  async initializeAutoPathSession(params: AutoPathSessionData, options?: AutoPathSessionInitOptions): Promise<void> {
    const { ships, ccus, wbHistory, hangarItems, importItems, priceHistoryMap } = params;
    const hasSameSessionData = this._autoPathSessionData
      && this._autoPathSessionData.ships === ships
      && this._autoPathSessionData.ccus === ccus
      && this._autoPathSessionData.wbHistory === wbHistory
      && this._autoPathSessionData.hangarItems === hangarItems
      && this._autoPathSessionData.importItems === importItems
      && this._autoPathSessionData.priceHistoryMap === priceHistoryMap;

    this._autoPathSessionData = {
      ships,
      ccus,
      wbHistory,
      hangarItems,
      importItems,
      priceHistoryMap
    };

    if (!hasSameSessionData) {
      this._autoPathBaseGraphCache = null;
    }

    if (options?.warmupWasm !== false) {
      await pathBuilderCWasmService.warmup();
    }
  }

  resetAutoPathSession(): void {
    this._autoPathSessionData = null;
    this._autoPathBaseGraphCache = null;
  }

  getAutoPathSessionData(): AutoPathSessionData | null {
    return this._autoPathSessionData;
  }

  clearAutoPathBaseGraphCache(): void {
    this._autoPathBaseGraphCache = null;
  }

  buildAutoPathBaseGraphSnapshot(params: {
    options: AutoPathBaseGraphOptions;
    data?: AutoPathSessionData;
  }): { key: string; graph: PathGraphResult } | null {
    const data = params.data || this._autoPathSessionData;
    if (!data) {
      return null;
    }

    const graph = this._getOrCreateAutoPathBaseGraph({
      options: params.options,
      data
    });
    if (!graph) {
      return null;
    }

    return {
      key: this._buildAutoPathBaseGraphCacheKey(params.options),
      graph
    };
  }

  hydrateAutoPathBaseGraphCache(params: {
    key: string;
    graph: PathGraphResult;
    data?: AutoPathSessionData;
  }): void {
    const data = params.data || this._autoPathSessionData;
    if (!data) {
      return;
    }

    this._autoPathBaseGraphCache = {
      key: params.key,
      data,
      graph: params.graph
    };
  }

  async prebuildAutoPathBaseGraph(options: AutoPathBaseGraphOptions): Promise<void> {
    void this.buildAutoPathBaseGraphSnapshot({
      options
    });
  }

  async preloadAutoPathBaseGraphInWasm(): Promise<void> {
    const graph = this._autoPathBaseGraphCache?.graph;
    if (!graph) {
      return;
    }

    await pathBuilderCWasmService.preloadGraph({
      nodes: graph.nodes,
      edges: graph.edges
    });
  }

  createPath(params: {
    stepShips: Ship[][];
    ccus: Ccu[];
    wbHistory: WbHistoryData[];
    hangarItems: HangarItem[];
    importItems: ImportItem[];
    priceHistoryMap: Record<number, PriceHistoryEntity>;
    specialPricingMap?: Record<string, SpecialShipPricing>;
    layout?: PathLayoutOptions;
    options?: PathBuildOptions;
  }): PathGraphResult {
    const { stepShips, ccus, wbHistory, hangarItems, importItems, priceHistoryMap, specialPricingMap, layout, options } = params;
    if (stepShips.length < 2) return { nodes: [], edges: [] };

    const startPosition = layout?.startPosition || { x: 100, y: 100 };
    const newNodes: Node<ShipNodeData>[] = [];
    const newEdges: Edge<CcuEdgeData>[] = [];

    const targetShips = stepShips[1];
    const sourceShips = stepShips[0];
    const allShips = [...sourceShips, ...targetShips];
    const uniqueShips = this._getUniqueShips(allShips);

    const shipActualPrices = new Map<string, number>();
    uniqueShips.forEach(ship => {
      shipActualPrices.set(
        this._getShipVariantKey(ship),
        this._getShipPrice(ship, ccus, wbHistory, priceHistoryMap, specialPricingMap)
      );
    });

    const sortedShips = [...uniqueShips].sort((a, b) =>
      (shipActualPrices.get(this._getShipVariantKey(a)) || 0) - (shipActualPrices.get(this._getShipVariantKey(b)) || 0)
    );

    const priceLevels = this._createPriceLevels(sortedShips, shipActualPrices);
    const sortedPriceLevels = Array.from(priceLevels.keys()).sort((a, b) => a - b);

    const shipNodeMap = this._createNodesForPriceLevels(
      priceLevels,
      sortedPriceLevels,
      startPosition,
      ccus,
      wbHistory,
      newNodes,
      layout
    );

    const levelShips = this._createLevelShipsArray(shipNodeMap, sortedPriceLevels, shipActualPrices);

    this._createUpgradeEdges(
      levelShips,
      stepShips,
      ccus,
      wbHistory,
      priceHistoryMap,
      hangarItems,
      importItems,
      specialPricingMap,
      options,
      newEdges
    );

    return { nodes: newNodes, edges: newEdges };
  }

  async createAutoPath(params: {
    request: AutoPathBuildRequest;
    executionOptions?: AutoPathExecutionOptions;
    ships?: Ship[];
    ccus?: Ccu[];
    wbHistory?: WbHistoryData[];
    hangarItems?: HangarItem[];
    importItems?: ImportItem[];
    priceHistoryMap?: Record<number, PriceHistoryEntity>;
  }): Promise<AutoPathBuildResult> {
    const startedAt = performance.now();
    const { request, executionOptions } = params;
    const autoPathData = this._resolveAutoPathData(params);
    if (!autoPathData) {
      return { nodes: [], edges: [] };
    }

    const startShip = autoPathData.ships.find(ship => ship.id === request.startShipId);
    const targetShip = autoPathData.ships.find(ship => ship.id === request.targetShipId);
    if (!startShip || !targetShip || startShip.msrp <= 0 || targetShip.msrp <= 0 || startShip.msrp >= targetShip.msrp) {
      return { nodes: [], edges: [] };
    }

    const targetHistory = autoPathData.priceHistoryMap[targetShip.id]?.history || [];
    if (!request.ignoreTargetAvailability && !this._hasValidSkuInRange(targetHistory, request.rangeStartTs, request.rangeEndTs)) {
      return { nodes: [], edges: [] };
    }

    const generated = this._getOrCreateAutoPathBaseGraph({
      options: this._toAutoPathBaseGraphOptions(request),
      data: autoPathData
    });
    if (!generated) {
      return { nodes: [], edges: [] };
    }

    const filteredResult = await this._runAutoPathFilters({
      generated,
      request,
      executionOptions,
      directUpgradeCost: (targetShip.msrp - startShip.msrp) / 100
    });

    const totalElapsedMs = performance.now() - startedAt;
    if (!filteredResult.perfStats) {
      return filteredResult;
    }

    const filterElapsedMs = filteredResult.perfStats.mode === 'c-wasm'
      ? filteredResult.perfStats.cWasmElapsedMs
      : filteredResult.perfStats.jsElapsedMs;
    const preprocessElapsedMs = Math.max(0, totalElapsedMs - (filterElapsedMs || 0));

    return {
      ...filteredResult,
      perfStats: {
        ...filteredResult.perfStats,
        preprocessElapsedMs,
        totalElapsedMs
      }
    };
  }

  async rebuildAutoPathFromCache(params: {
    startShipId: number;
    targetShipId: number;
    rangeStartTs: number;
    rangeEndTs: number;
    includeWarbond: boolean;
    includePriceIncrease: boolean;
    preferHangarCcu: boolean;
    excludedCcuKeys?: string[];
    excludedSkuIds?: number[];
    requiredHangarCcuKeys?: string[];
    executionOptions?: AutoPathExecutionOptions;
  }): Promise<AutoPathBuildResult> {
    const startedAt = performance.now();
    const cache = this._autoPathBaseGraphCache;
    const sessionData = this._autoPathSessionData;
    if (!cache || !sessionData) {
      return { nodes: [], edges: [] };
    }

    const startShip = sessionData.ships.find(ship => ship.id === params.startShipId);
    const targetShip = sessionData.ships.find(ship => ship.id === params.targetShipId);
    if (!startShip || !targetShip || startShip.msrp <= 0 || targetShip.msrp <= 0 || startShip.msrp >= targetShip.msrp) {
      return { nodes: [], edges: [] };
    }

    const filteredResult = await this._runAutoPathFilters({
      generated: cache.graph,
      request: {
        startShipId: params.startShipId,
        targetShipId: params.targetShipId,
        rangeStartTs: params.rangeStartTs,
        rangeEndTs: params.rangeEndTs,
        includeWarbond: params.includeWarbond,
        includePriceIncrease: params.includePriceIncrease,
        preferHangarCcu: params.preferHangarCcu,
        excludedCcuKeys: params.excludedCcuKeys,
        excludedSkuIds: params.excludedSkuIds,
        requiredHangarCcuKeys: params.requiredHangarCcuKeys
      },
      executionOptions: params.executionOptions,
      directUpgradeCost: (targetShip.msrp - startShip.msrp) / 100
    });

    if (!filteredResult.perfStats) {
      return filteredResult;
    }

    const filterElapsedMs = filteredResult.perfStats.mode === 'c-wasm'
      ? filteredResult.perfStats.cWasmElapsedMs
      : filteredResult.perfStats.jsElapsedMs;
    const totalElapsedMs = performance.now() - startedAt;
    const preprocessElapsedMs = Math.max(0, totalElapsedMs - (filterElapsedMs || 0));

    return {
      ...filteredResult,
      perfStats: {
        ...filteredResult.perfStats,
        preprocessElapsedMs,
        totalElapsedMs
      }
    };
  }

  private async _runAutoPathFilters(params: {
    generated: PathGraphResult;
    request: AutoPathFilterRequest;
    executionOptions?: AutoPathExecutionOptions;
    directUpgradeCost: number;
  }): Promise<AutoPathBuildResult> {
    const { generated, request, executionOptions, directUpgradeCost } = params;
    const exclusionResult = this._applyAutoPathExclusions({
      edges: generated.edges,
      request
    });

    const requiredHangarSet = new Set((request.requiredHangarCcuKeys || []).map(key => key.trim().toUpperCase()));
    const useWasmPathBuilder = executionOptions?.useWasmPathBuilder !== false;
    const comparePathBuilderPerf = import.meta.env.DEV && executionOptions?.comparePathBuilderPerf === true;

    if (requiredHangarSet.size > 0) {
      return this._runPathFilterWithExecution({
        useWasmPathBuilder,
        comparePathBuilderPerf,
        runJs: () => this._keepReachablePaths({
          nodes: generated.nodes,
          edges: exclusionResult.filteredEdges,
          startShipId: request.startShipId,
          targetShipId: request.targetShipId
        }),
        runCWasm: () => this._keepReachablePathsWithWasm({
          nodes: generated.nodes,
          edges: exclusionResult.filteredEdges,
          startShipId: request.startShipId,
          targetShipId: request.targetShipId
        })
      });
    }

    return this._runPathFilterWithExecution({
      useWasmPathBuilder,
      comparePathBuilderPerf,
      runJs: () => this._keepOnlySavingPaths({
        nodes: generated.nodes,
        edges: exclusionResult.filteredEdges,
        startShipId: request.startShipId,
        targetShipId: request.targetShipId,
        directUpgradeCost
      }),
      runCWasm: () => this._keepOnlySavingPathsWithWasm({
        nodes: generated.nodes,
        edges: exclusionResult.filteredEdges,
        startShipId: request.startShipId,
        targetShipId: request.targetShipId,
        directUpgradeCost
      })
    });
  }

  private _resolveAutoPathData(params: {
    ships?: Ship[];
    ccus?: Ccu[];
    wbHistory?: WbHistoryData[];
    hangarItems?: HangarItem[];
    importItems?: ImportItem[];
    priceHistoryMap?: Record<number, PriceHistoryEntity>;
  }): AutoPathSessionData | null {
    if (
      params.ships &&
      params.ccus &&
      params.wbHistory &&
      params.hangarItems &&
      params.importItems &&
      params.priceHistoryMap
    ) {
      return {
        ships: params.ships,
        ccus: params.ccus,
        wbHistory: params.wbHistory,
        hangarItems: params.hangarItems,
        importItems: params.importItems,
        priceHistoryMap: params.priceHistoryMap
      };
    }

    return this._autoPathSessionData;
  }

  private _toAutoPathBaseGraphOptions(request: Pick<
    AutoPathBuildRequest,
    'rangeStartTs' | 'rangeEndTs' | 'includeWarbond' | 'includePriceIncrease' | 'preferHangarCcu'
  >): AutoPathBaseGraphOptions {
    return {
      rangeStartTs: request.rangeStartTs,
      rangeEndTs: request.rangeEndTs,
      includeWarbond: request.includeWarbond,
      includePriceIncrease: request.includePriceIncrease,
      preferHangarCcu: request.preferHangarCcu
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _buildAutoPathBaseGraphCacheKey(_options: AutoPathBaseGraphOptions): string {
    return 'global-history-hangar-v1';
  }

  private _getAutoPathGlobalHistoryRange(priceHistoryMap: Record<number, PriceHistoryEntity>): {
    startTs: number;
    endTs: number;
  } {
    let minTs = Number.POSITIVE_INFINITY;
    let maxTs = Number.NEGATIVE_INFINITY;

    Object.values(priceHistoryMap).forEach(entity => {
      const history = entity?.history || [];
      history.forEach(entry => {
        if (typeof entry.ts !== 'number' || !Number.isFinite(entry.ts)) {
          return;
        }
        minTs = Math.min(minTs, entry.ts);
        maxTs = Math.max(maxTs, entry.ts);
      });
    });

    if (!Number.isFinite(minTs) || !Number.isFinite(maxTs) || minTs > maxTs) {
      return {
        startTs: 0,
        endTs: Number.MAX_SAFE_INTEGER
      };
    }

    return {
      startTs: minTs,
      endTs: maxTs
    };
  }

  private _getOrCreateAutoPathBaseGraph(params: {
    options: AutoPathBaseGraphOptions;
    data: AutoPathSessionData;
  }): PathGraphResult | null {
    const { options, data } = params;
    const cacheKey = this._buildAutoPathBaseGraphCacheKey(options);
    if (
      this._autoPathBaseGraphCache &&
      this._autoPathBaseGraphCache.key === cacheKey &&
      this._autoPathBaseGraphCache.data.ships === data.ships &&
      this._autoPathBaseGraphCache.data.ccus === data.ccus &&
      this._autoPathBaseGraphCache.data.wbHistory === data.wbHistory &&
      this._autoPathBaseGraphCache.data.hangarItems === data.hangarItems &&
      this._autoPathBaseGraphCache.data.importItems === data.importItems &&
      this._autoPathBaseGraphCache.data.priceHistoryMap === data.priceHistoryMap
    ) {
      return this._autoPathBaseGraphCache.graph;
    }

    const { ships, ccus, wbHistory, hangarItems, importItems, priceHistoryMap } = data;
    const globalShips = ships
      .filter(ship => ship.msrp > 0)
      .sort((a, b) => a.msrp - b.msrp);
    if (globalShips.length < 2) {
      return null;
    }

    const baseStartShip = globalShips[0];
    const baseTargets = globalShips.filter(ship => ship.id !== baseStartShip.id);
    const specialPricingMap: Record<string, SpecialShipPricing> = {};
    const variantTargets: Ship[] = [];

    const globalHistoryRange = this._getAutoPathGlobalHistoryRange(priceHistoryMap);
    baseTargets.forEach(ship => {
      const history = priceHistoryMap[ship.id]?.history || [];

      const warbondPrices = this._findHistoryPriceOptionsInRange(
        history,
        globalHistoryRange.startTs,
        globalHistoryRange.endTs,
        (entry) => this._isDiscountPriceEntry(entry)
      );

      warbondPrices
        .filter(price => price < ship.msrp)
        .forEach(price => {
          const wbShip = { ...ship, name: `${ship.name}__auto_wb_${price}` };
          const validityWindows = this._collectSkuValidityWindowsForPrice({
            history,
            rangeStartTs: globalHistoryRange.startTs,
            rangeEndTs: globalHistoryRange.endTs,
            priceCents: price,
            predicate: (entry) => this._isDiscountPriceEntry(entry)
          });
          variantTargets.push(wbShip);
          specialPricingMap[this._getShipVariantKey(wbShip)] = {
            priceCents: price,
            sourceType: CcuSourceType.HISTORICAL,
            validityWindows
          };
        });

      const standardPrices = this._findHistoryPriceOptionsInRange(
        history,
        globalHistoryRange.startTs,
        globalHistoryRange.endTs,
        (entry) => this._isStandardOrNormalPriceEntry(entry)
      );

      standardPrices
        .filter(price => price < ship.msrp)
        .forEach(price => {
          const historicalShip = { ...ship, name: `${ship.name}__auto_pi_${price}` };
          const validityWindows = this._collectSkuValidityWindowsForPrice({
            history,
            rangeStartTs: globalHistoryRange.startTs,
            rangeEndTs: globalHistoryRange.endTs,
            priceCents: price,
            predicate: (entry) => this._isStandardOrNormalPriceEntry(entry)
          });
          variantTargets.push(historicalShip);
          specialPricingMap[this._getShipVariantKey(historicalShip)] = {
            priceCents: price,
            sourceType: CcuSourceType.PRICE_INCREASE,
            validityWindows
          };
        });
    });

    const stepShips: Ship[][] = [[baseStartShip], [...baseTargets, ...variantTargets]];
    const generated = this.createPath({
      stepShips,
      ccus,
      wbHistory,
      hangarItems,
      importItems,
      priceHistoryMap,
      specialPricingMap,
      options: {
        exhaustiveEdgeSearch: true,
        preferHangarCcu: options.preferHangarCcu,
        buildConstraintAwareGraph: true
      }
    });

    this._autoPathBaseGraphCache = {
      key: cacheKey,
      data,
      graph: generated
    };

    return generated;
  }

  private _applyAutoPathExclusions(params: {
    edges: Edge<CcuEdgeData>[];
    request: AutoPathFilterRequest;
  }): AutoPathExclusionResult {
    const { edges, request } = params;
    const excludedCcuKeySet = new Set(request.excludedCcuKeys || []);
    const excludedSkuIdSet = new Set(request.excludedSkuIds || []);
    const edgeActiveMask = new Uint8Array(edges.length);
    if (edges.length === 0) {
      return { filteredEdges: [], edgeActiveMask };
    }

    const hangarPairKeySet = request.preferHangarCcu
      ? this._collectHangarEdgePairKeys(edges)
      : null;

    const filteredEdges: Edge<CcuEdgeData>[] = [];
    edges.forEach((edge, edgeIndex) => {
      if (!this._isEdgeAllowedByRequest(edge, request, hangarPairKeySet)) {
        edgeActiveMask[edgeIndex] = 0;
        return;
      }

      if (excludedCcuKeySet.has(this._getAutoPathEdgeKey(edge))) {
        edgeActiveMask[edgeIndex] = 0;
        return;
      }

      const filteredEdge = this._filterEdgeByRequestWindows({
        edge,
        rangeStartTs: request.rangeStartTs,
        rangeEndTs: request.rangeEndTs,
        excludedSkuIdSet
      });
      if (!filteredEdge) {
        edgeActiveMask[edgeIndex] = 0;
        return;
      }

      edgeActiveMask[edgeIndex] = 1;
      filteredEdges.push(filteredEdge);
    });

    return {
      filteredEdges,
      edgeActiveMask
    };
  }

  private _isEdgeAllowedByRequest(
    edge: Edge<CcuEdgeData>,
    request: Pick<AutoPathBuildRequest, 'includeWarbond' | 'includePriceIncrease' | 'preferHangarCcu'>,
    hangarPairKeySet: Set<string> | null
  ): boolean {
    const sourceType = edge.data?.sourceType || CcuSourceType.OFFICIAL;
    if (sourceType === CcuSourceType.HISTORICAL && !request.includeWarbond) {
      return false;
    }

    if (sourceType === CcuSourceType.PRICE_INCREASE && !request.includePriceIncrease) {
      return false;
    }

    if (sourceType === CcuSourceType.HANGER) {
      return request.preferHangarCcu;
    }

    if (!request.preferHangarCcu || !hangarPairKeySet) {
      return true;
    }

    const pairKey = this._getAutoPathPairKey(edge);
    return !pairKey || !hangarPairKeySet.has(pairKey);
  }

  private _collectHangarEdgePairKeys(edges: Edge<CcuEdgeData>[]): Set<string> {
    const pairKeySet = new Set<string>();
    edges.forEach(edge => {
      if (edge.data?.sourceType !== CcuSourceType.HANGER) {
        return;
      }
      const pairKey = this._getAutoPathPairKey(edge);
      if (pairKey) {
        pairKeySet.add(pairKey);
      }
    });
    return pairKeySet;
  }

  private _getAutoPathPairKey(edge: Edge<CcuEdgeData>): string | null {
    const sourceShipId = edge.data?.sourceShip?.id;
    const targetShipId = edge.data?.targetShip?.id;
    if (typeof sourceShipId === 'number' && typeof targetShipId === 'number') {
      return `${sourceShipId}->${targetShipId}`;
    }

    if (!edge.source || !edge.target) {
      return null;
    }

    return `${edge.source}->${edge.target}`;
  }

  private _filterEdgeByRequestWindows(params: {
    edge: Edge<CcuEdgeData>;
    rangeStartTs: number;
    rangeEndTs: number;
    excludedSkuIdSet: Set<number>;
  }): Edge<CcuEdgeData> | null {
    const { edge, rangeStartTs, rangeEndTs, excludedSkuIdSet } = params;
    const windows = edge.data?.validityWindows;
    if (!windows?.length) {
      return edge;
    }

    const filteredWindows = windows.flatMap(window => {
      if (excludedSkuIdSet.has(window.sku)) {
        return [];
      }

      const windowEndTs = window.endTs ?? Number.POSITIVE_INFINITY;
      if (windowEndTs < rangeStartTs || window.startTs > rangeEndTs) {
        return [];
      }

      const clippedStartTs = Math.max(window.startTs, rangeStartTs);
      const clippedEndTs = window.endTs === null ? null : Math.min(window.endTs, rangeEndTs);
      if (clippedEndTs !== null && clippedStartTs > clippedEndTs) {
        return [];
      }

      return [{
        sku: window.sku,
        startTs: clippedStartTs,
        endTs: clippedEndTs
      }];
    });

    if (!filteredWindows.length) {
      return null;
    }

    return {
      ...edge,
      data: {
        ...edge.data!,
        validityWindows: filteredWindows
      }
    };
  }

  findBestReviewRoute(params: {
    nodes: Node<{ ship: Ship; [key: string]: unknown }>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
    requiredHangarCcuKeys: Set<string>;
  }): AutoPathReviewRoute | null {
    return this._findBestReviewRouteJs(params);
  }

  async findBestReviewRouteWithExecution(params: {
    nodes: Node<{ ship: Ship; [key: string]: unknown }>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
    requiredHangarCcuKeys: Set<string>;
    executionOptions?: AutoPathExecutionOptions;
  }): Promise<AutoPathReviewResult> {
    const startedAt = performance.now();
    const {
      nodes,
      edges,
      startShipId,
      targetShipId,
      requiredHangarCcuKeys,
      executionOptions
    } = params;

    const useWasmPathBuilder = executionOptions?.useWasmPathBuilder !== false;
    const comparePathBuilderPerf = import.meta.env.DEV && executionOptions?.comparePathBuilderPerf === true;
    const runJsEngine = !useWasmPathBuilder || comparePathBuilderPerf;
    const runCWasmEngine = useWasmPathBuilder || comparePathBuilderPerf;
    const preloadGraphPromise = runCWasmEngine
      ? pathBuilderCWasmService.preloadGraph({ nodes, edges }).catch(error => {
        this._warnWasmConsistency('C WASM review graph preload failed', error);
      })
      : null;

    let jsRoute: AutoPathReviewRoute | null = null;
    let cWasmRoute: AutoPathReviewRoute | null = null;
    let jsElapsedMs: number | undefined;
    let cWasmElapsedMs: number | undefined;

    if (runJsEngine) {
      const jsStartedAt = performance.now();
      jsRoute = this._findBestReviewRouteJs({
        nodes,
        edges,
        startShipId,
        targetShipId,
        requiredHangarCcuKeys
      });
      jsElapsedMs = performance.now() - jsStartedAt;
    }

    if (runCWasmEngine) {
      try {
        if (preloadGraphPromise) {
          await preloadGraphPromise;
        }
        const cWasmStartedAt = performance.now();
        cWasmRoute = await this._findBestReviewRouteWithWasm({
          nodes,
          edges,
          startShipId,
          targetShipId,
          requiredHangarCcuKeys
        });
        cWasmElapsedMs = performance.now() - cWasmStartedAt;
      } catch (error) {
        this._warnWasmConsistency('C WASM review route builder failed', error);
      }
    }

    if (jsElapsedMs === undefined && cWasmElapsedMs === undefined) {
      const jsStartedAt = performance.now();
      jsRoute = this._findBestReviewRouteJs({
        nodes,
        edges,
        startShipId,
        targetShipId,
        requiredHangarCcuKeys
      });
      jsElapsedMs = performance.now() - jsStartedAt;
    }

    const selectedRoute = useWasmPathBuilder
      ? (cWasmRoute ?? jsRoute)
      : (jsRoute ?? cWasmRoute);

    let mismatchWithJs: AutoPathBuildPerfStats['mismatchWithJs'];
    let mismatchMessage: string | null = null;
    let consistency: AutoPathBuildPerfStats['consistency'] = 'unavailable';

    if (comparePathBuilderPerf) {
      if (jsElapsedMs !== undefined && cWasmElapsedMs !== undefined) {
        const isMatch = this._isReviewRouteConsistent(jsRoute, cWasmRoute);
        consistency = isMatch ? 'match' : 'mismatch';
        mismatchWithJs = this._getReviewRouteMismatch({
          jsRoute,
          cWasmRoute
        });

        if (!isMatch) {
          mismatchMessage = `Review route mismatch detected (JS-only edges: ${mismatchWithJs.jsOnly}, C-WASM-only edges: ${mismatchWithJs.cWasmOnly})`;
          this._warnWasmConsistency('Review route mismatch detected', mismatchWithJs);
        }
      } else {
        consistency = 'unavailable';
        mismatchMessage = 'Review route compare unavailable because one or more engines failed.';
      }
    }

    const cWasmSpeedupRatio = jsElapsedMs && cWasmElapsedMs && cWasmElapsedMs > 0
      ? jsElapsedMs / cWasmElapsedMs
      : undefined;

    return {
      route: selectedRoute ?? null,
      perfStats: {
        mode: useWasmPathBuilder ? 'c-wasm' : 'js',
        jsElapsedMs,
        cWasmElapsedMs,
        totalElapsedMs: performance.now() - startedAt,
        consistency,
        mismatchWithJs,
        cWasmSpeedupRatio
      },
      mismatchMessage: comparePathBuilderPerf ? mismatchMessage : null
    };
  }

  private _findBestReviewRouteJs(params: {
    nodes: Node<{ ship: Ship; [key: string]: unknown }>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
    requiredHangarCcuKeys: Set<string>;
  }): AutoPathReviewRoute | null {
    const { nodes, edges, startShipId, targetShipId, requiredHangarCcuKeys } = params;

    if (!nodes.length || !edges.length) {
      return null;
    }

    const nodeMap = new Map<string, Node<{ ship: Ship; [key: string]: unknown }>>();
    const outgoingMap = new Map<string, Edge<CcuEdgeData>[]>();

    nodes.forEach(node => {
      nodeMap.set(node.id, node);
    });

    edges.forEach(edge => {
      const list = outgoingMap.get(edge.source) || [];
      list.push(edge);
      outgoingMap.set(edge.source, list);
    });

    const startNodeIds = nodes
      .filter(node => node.data?.ship?.id === startShipId)
      .map(node => node.id);

    const targetNodeIds = new Set(
      nodes
        .filter(node => node.data?.ship?.id === targetShipId)
        .map(node => node.id)
    );

    if (!startNodeIds.length || !targetNodeIds.size) {
      return null;
    }

    const requiredKeyList = Array.from(requiredHangarCcuKeys);
    const requiredBitByKey = new Map<string, bigint>();
    requiredKeyList.forEach((key, idx) => {
      requiredBitByKey.set(key, 1n << BigInt(idx));
    });
    const allRequiredMask = requiredKeyList.length > 0
      ? (1n << BigInt(requiredKeyList.length)) - 1n
      : 0n;

    const stateKey = (nodeId: string, mask: bigint) => `${nodeId}|${mask.toString()}`;
    const dist = new Map<string, number>();
    const prevState = new Map<string, { prevNodeId: string; prevMask: bigint; edge: Edge<CcuEdgeData> }>();
    const queue: Array<{ nodeId: string; mask: bigint; cost: number }> = [];

    startNodeIds.forEach(nodeId => {
      dist.set(stateKey(nodeId, 0n), 0);
      queue.push({ nodeId, mask: 0n, cost: 0 });
    });

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;
      const currentStateKey = stateKey(current.nodeId, current.mask);
      const knownCost = dist.get(currentStateKey);
      if (knownCost === undefined || current.cost > knownCost + 1e-6) {
        continue;
      }

      if (targetNodeIds.has(current.nodeId) && current.mask === allRequiredMask) {
        break;
      }

      const outgoingEdges = outgoingMap.get(current.nodeId) || [];
      outgoingEdges.forEach(edge => {
        const edgeCost = this._getEdgeCost(edge);
        if (!Number.isFinite(edgeCost) || edgeCost < 0) {
          return;
        }

        const hangarKey = this._getHangarRequirementKeyFromEdge(edge);
        const requiredBit = hangarKey ? (requiredBitByKey.get(hangarKey) || 0n) : 0n;
        const nextMask = current.mask | requiredBit;
        const candidateCost = current.cost + edgeCost;
        const nextStateKey = stateKey(edge.target, nextMask);
        const currentTargetCost = dist.get(nextStateKey) ?? Number.POSITIVE_INFINITY;

        if (candidateCost < currentTargetCost - 1e-6) {
          dist.set(nextStateKey, candidateCost);
          prevState.set(nextStateKey, { prevNodeId: current.nodeId, prevMask: current.mask, edge });
          queue.push({ nodeId: edge.target, mask: nextMask, cost: candidateCost });
        }
      });
    }

    let bestTargetId = '';
    let bestCost = Number.POSITIVE_INFINITY;
    let bestMask = allRequiredMask;

    targetNodeIds.forEach(targetNodeId => {
      const targetCost = dist.get(stateKey(targetNodeId, allRequiredMask)) ?? Number.POSITIVE_INFINITY;
      if (targetCost < bestCost) {
        bestCost = targetCost;
        bestTargetId = targetNodeId;
        bestMask = allRequiredMask;
      }
    });

    if (!bestTargetId || !Number.isFinite(bestCost)) {
      return null;
    }

    const startNodeIdSet = new Set(startNodeIds);
    const pathEdges: AutoPathReviewEdge[] = [];
    const backtrackVisited = new Set<string>();
    let cursorNodeId = bestTargetId;
    let cursorMask = bestMask;

    while (!(startNodeIdSet.has(cursorNodeId) && cursorMask === 0n)) {
      const cursorStateKey = stateKey(cursorNodeId, cursorMask);
      if (backtrackVisited.has(cursorStateKey)) {
        return null;
      }
      backtrackVisited.add(cursorStateKey);

      const prevInfo = prevState.get(cursorStateKey);
      if (!prevInfo) {
        return null;
      }

      const edge = prevInfo.edge;
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      const sourceShip = edge.data?.sourceShip || sourceNode?.data?.ship;
      const targetShip = edge.data?.targetShip || targetNode?.data?.ship;

      if (!sourceShip || !targetShip) {
        return null;
      }

      pathEdges.push({
        edge,
        sourceShip,
        targetShip,
        cost: this._getEdgeCost(edge),
        key: this._getAutoPathEdgeKey(edge),
        sourceType: edge.data?.sourceType || CcuSourceType.OFFICIAL,
        validityWindows: edge.data?.validityWindows
      });

      cursorNodeId = prevInfo.prevNodeId;
      cursorMask = prevInfo.prevMask;
    }

    pathEdges.reverse();

    if (!pathEdges.length) {
      return null;
    }

    const nodeIds = [pathEdges[0].edge.source, ...pathEdges.map(item => item.edge.target)];
    const totalCost = pathEdges.reduce((sum, item) => sum + item.cost, 0);

    return {
      nodeIds,
      edges: pathEdges,
      totalCost
    };
  }

  private async _findBestReviewRouteWithWasm(params: {
    nodes: Node<{ ship: Ship; [key: string]: unknown }>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
    requiredHangarCcuKeys: Set<string>;
  }): Promise<AutoPathReviewRoute | null> {
    const { nodes, edges, startShipId, targetShipId, requiredHangarCcuKeys } = params;

    if (!nodes.length || !edges.length) {
      return null;
    }

    const wasmRoute = await pathBuilderCWasmService.findBestReviewRoute({
      nodes,
      edges,
      startShipId,
      targetShipId,
      requiredHangarCcuKeys
    });

    if (!wasmRoute.routeEdgeIndices.length) {
      return null;
    }

    const nodeMap = new Map<string, Node<{ ship: Ship; [key: string]: unknown }>>();
    nodes.forEach(node => {
      nodeMap.set(node.id, node);
    });

    const pathEdges: AutoPathReviewEdge[] = [];
    for (const edgeIndex of wasmRoute.routeEdgeIndices) {
      const edge = edges[edgeIndex];
      if (!edge) {
        return null;
      }

      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      const sourceShip = edge.data?.sourceShip || sourceNode?.data?.ship;
      const targetShip = edge.data?.targetShip || targetNode?.data?.ship;
      if (!sourceShip || !targetShip) {
        return null;
      }

      pathEdges.push({
        edge,
        sourceShip,
        targetShip,
        cost: this._getEdgeCost(edge),
        key: this._getAutoPathEdgeKey(edge),
        sourceType: edge.data?.sourceType || CcuSourceType.OFFICIAL,
        validityWindows: edge.data?.validityWindows
      });
    }

    if (!pathEdges.length) {
      return null;
    }

    const computedTotalCost = pathEdges.reduce((sum, item) => sum + item.cost, 0);
    const totalCost = Number.isFinite(wasmRoute.totalCost) ? wasmRoute.totalCost : computedTotalCost;

    return {
      nodeIds: [pathEdges[0].edge.source, ...pathEdges.map(item => item.edge.target)],
      edges: pathEdges,
      totalCost
    };
  }

  private _isReviewRouteConsistent(left: AutoPathReviewRoute | null, right: AutoPathReviewRoute | null): boolean {
    if (!left || !right) {
      return left === right;
    }

    if (left.edges.length !== right.edges.length) {
      return false;
    }

    for (let i = 0; i < left.edges.length; i++) {
      if (left.edges[i].edge.id !== right.edges[i].edge.id) {
        return false;
      }
    }

    if (Math.abs(left.totalCost - right.totalCost) > 1e-3) {
      return false;
    }

    return true;
  }

  private _getReviewRouteMismatch(params: {
    jsRoute: AutoPathReviewRoute | null;
    cWasmRoute: AutoPathReviewRoute | null;
  }): { jsOnly: number; cWasmOnly: number } {
    const jsEdgeSet = new Set((params.jsRoute?.edges || []).map(item => item.edge.id));
    const cWasmEdgeSet = new Set((params.cWasmRoute?.edges || []).map(item => item.edge.id));

    const jsOnlyEdges = Array.from(jsEdgeSet).filter(edgeId => !cWasmEdgeSet.has(edgeId)).length;
    const cWasmOnlyEdges = Array.from(cWasmEdgeSet).filter(edgeId => !jsEdgeSet.has(edgeId)).length;

    return {
      jsOnly: jsOnlyEdges,
      cWasmOnly: cWasmOnlyEdges
    };
  }

  private _isPathGraphConsistent(left: PathGraphResult, right: PathGraphResult): boolean {
    if (left.nodes.length !== right.nodes.length || left.edges.length !== right.edges.length) {
      return false;
    }

    const rightNodeMap = new Map(right.nodes.map(node => [node.id, node]));
    for (const leftNode of left.nodes) {
      const rightNode = rightNodeMap.get(leftNode.id);
      if (!rightNode) {
        return false;
      }

      const xDiff = Math.abs((leftNode.position?.x || 0) - (rightNode.position?.x || 0));
      const yDiff = Math.abs((leftNode.position?.y || 0) - (rightNode.position?.y || 0));
      if (xDiff > 1e-3 || yDiff > 1e-3) {
        return false;
      }
    }

    const leftEdgeIds = new Set(left.edges.map(edge => edge.id));
    const rightEdgeIds = new Set(right.edges.map(edge => edge.id));
    if (leftEdgeIds.size !== rightEdgeIds.size) {
      return false;
    }

    for (const edgeId of leftEdgeIds) {
      if (!rightEdgeIds.has(edgeId)) {
        return false;
      }
    }

    return true;
  }

  private _getPathGraphMismatch(params: {
    jsResult: PathGraphResult;
    cWasmResult: PathGraphResult;
  }): { jsOnly: number; cWasmOnly: number } {
    const toEdgeKey = (edge: Edge<CcuEdgeData>) => edge.id;
    const jsEdgeSet = new Set(params.jsResult.edges.map(toEdgeKey));
    const cWasmEdgeSet = new Set(params.cWasmResult.edges.map(toEdgeKey));

    const jsOnlyEdges = Array.from(jsEdgeSet).filter(edgeId => !cWasmEdgeSet.has(edgeId)).length;
    const cWasmOnlyEdges = Array.from(cWasmEdgeSet).filter(edgeId => !jsEdgeSet.has(edgeId)).length;

    return {
      jsOnly: jsOnlyEdges,
      cWasmOnly: cWasmOnlyEdges
    };
  }

  private _warnWasmConsistency(message: string, detail?: unknown): void {
    if (!import.meta.env.DEV) {
      return;
    }
    
    console.warn(`[PathBuilderService][WASM] ${message}`, detail);
  }

  private async _runPathFilterWithExecution(params: {
    useWasmPathBuilder: boolean;
    comparePathBuilderPerf: boolean;
    runJs: () => PathGraphResult;
    runCWasm: () => Promise<PathGraphResult>;
  }): Promise<AutoPathBuildResult> {
    const { useWasmPathBuilder, comparePathBuilderPerf, runJs, runCWasm } = params;
    const runJsEngine = !useWasmPathBuilder || comparePathBuilderPerf;
    const runCWasmEngine = useWasmPathBuilder || comparePathBuilderPerf;

    let jsResult: PathGraphResult | null = null;
    let cWasmResult: PathGraphResult | null = null;
    let jsElapsedMs: number | undefined;
    let cWasmElapsedMs: number | undefined;
    let cWasmError: unknown = null;

    if (runJsEngine) {
      const jsStartedAt = performance.now();
      jsResult = runJs();
      jsElapsedMs = performance.now() - jsStartedAt;
    }

    if (runCWasmEngine) {
      try {
        const cWasmStartedAt = performance.now();
        cWasmResult = await runCWasm();
        cWasmElapsedMs = performance.now() - cWasmStartedAt;
      } catch (error) {
        cWasmError = error;
        this._warnWasmConsistency('C WASM path builder filter failed', error);
      }
    }

    if (!cWasmResult && !jsResult) {
      const jsStartedAt = performance.now();
      jsResult = runJs();
      jsElapsedMs = performance.now() - jsStartedAt;
    }

    const selectedResult = useWasmPathBuilder
      ? (cWasmResult || jsResult)
      : (jsResult || cWasmResult);

    if (!selectedResult) {
      return {
        nodes: [],
        edges: [],
        perfStats: {
          mode: useWasmPathBuilder ? 'c-wasm' : 'js',
          jsElapsedMs,
          cWasmElapsedMs,
          consistency: 'unavailable'
        },
        mismatchMessage: cWasmError ? 'Path builder compare unavailable because one or more engines failed.' : null
      };
    }

    let mismatchWithJs: AutoPathBuildPerfStats['mismatchWithJs'];
    let mismatchMessage: string | null = null;
    let consistency: AutoPathBuildPerfStats['consistency'] = 'unavailable';

    if (comparePathBuilderPerf) {
      if (jsResult && cWasmResult) {
        const isMatch = this._isPathGraphConsistent(jsResult, cWasmResult);
        consistency = isMatch ? 'match' : 'mismatch';
        mismatchWithJs = this._getPathGraphMismatch({ jsResult, cWasmResult });

        if (!isMatch) {
          mismatchMessage = `Path mismatch detected (JS-only edges: ${mismatchWithJs.jsOnly}, C-WASM-only edges: ${mismatchWithJs.cWasmOnly})`;
          this._warnWasmConsistency('Path builder mismatch detected', mismatchWithJs);
        }
      } else {
        consistency = 'unavailable';
        mismatchMessage = 'Path builder compare unavailable because one or more engines failed.';
      }
    }

    const cWasmSpeedupRatio = jsElapsedMs && cWasmElapsedMs && cWasmElapsedMs > 0
      ? jsElapsedMs / cWasmElapsedMs
      : undefined;

    return {
      ...selectedResult,
      perfStats: {
        mode: useWasmPathBuilder ? 'c-wasm' : 'js',
        jsElapsedMs,
        cWasmElapsedMs,
        consistency,
        mismatchWithJs,
        cWasmSpeedupRatio
      },
      mismatchMessage
    };
  }

  private async _keepReachablePathsWithWasm(params: {
    nodes: Node<ShipNodeData>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
  }): Promise<PathGraphResult> {
    const wasmResult = await pathBuilderCWasmService.filterReachable({
      nodes: params.nodes,
      edges: params.edges,
      startShipId: params.startShipId,
      targetShipId: params.targetShipId
    });

    return {
      nodes: wasmResult.nodes as Node<ShipNodeData>[],
      edges: wasmResult.edges as Edge<CcuEdgeData>[]
    };
  }

  private async _keepOnlySavingPathsWithWasm(params: {
    nodes: Node<ShipNodeData>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
    directUpgradeCost: number;
  }): Promise<PathGraphResult> {
    const wasmResult = await pathBuilderCWasmService.filterSaving({
      nodes: params.nodes,
      edges: params.edges,
      startShipId: params.startShipId,
      targetShipId: params.targetShipId,
      directUpgradeCost: params.directUpgradeCost
    });

    return {
      nodes: wasmResult.nodes as Node<ShipNodeData>[],
      edges: wasmResult.edges as Edge<CcuEdgeData>[]
    };
  }

  private _getAutoPathEdgeKey(edge: Edge<CcuEdgeData>): string {
    const sourceId = edge.data?.sourceShip?.id || edge.source;
    const targetId = edge.data?.targetShip?.id || edge.target;
    const sourceType = edge.data?.sourceType || CcuSourceType.OFFICIAL;
    const cost = this._getEdgeCost(edge).toFixed(2);
    return `${sourceId}->${targetId}|${sourceType}|${cost}`;
  }

  private _getHangarRequirementKeyFromEdge(edge: Edge<CcuEdgeData>): string | null {
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

  private _keepReachablePaths(params: {
    nodes: Node<ShipNodeData>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
  }): { nodes: Node<ShipNodeData>[]; edges: Edge<CcuEdgeData>[] } {
    const { nodes, edges, startShipId, targetShipId } = params;
    if (!nodes.length || !edges.length) {
      return { nodes: [], edges: [] };
    }

    const startNodes = nodes.filter(node => node.data.ship.id === startShipId);
    const targetNodeIds = new Set(nodes.filter(node => node.data.ship.id === targetShipId).map(node => node.id));
    if (!startNodes.length || !targetNodeIds.size) {
      return { nodes: [], edges: [] };
    }

    const nextFromStart = new Map<string, string[]>();
    const prevToTarget = new Map<string, string[]>();
    edges.forEach(edge => {
      const out = nextFromStart.get(edge.source) || [];
      out.push(edge.target);
      nextFromStart.set(edge.source, out);

      const back = prevToTarget.get(edge.target) || [];
      back.push(edge.source);
      prevToTarget.set(edge.target, back);
    });

    const reachableFromStart = new Set<string>();
    const startQueue = startNodes.map(node => node.id);
    while (startQueue.length > 0) {
      const current = startQueue.shift()!;
      if (reachableFromStart.has(current)) continue;
      reachableFromStart.add(current);
      (nextFromStart.get(current) || []).forEach(next => {
        if (!reachableFromStart.has(next)) {
          startQueue.push(next);
        }
      });
    }

    const canReachTarget = new Set<string>();
    const targetQueue = Array.from(targetNodeIds);
    while (targetQueue.length > 0) {
      const current = targetQueue.shift()!;
      if (canReachTarget.has(current)) continue;
      canReachTarget.add(current);
      (prevToTarget.get(current) || []).forEach(prev => {
        if (!canReachTarget.has(prev)) {
          targetQueue.push(prev);
        }
      });
    }

    const keptNodeIds = new Set<string>();
    nodes.forEach(node => {
      if (reachableFromStart.has(node.id) && canReachTarget.has(node.id)) {
        keptNodeIds.add(node.id);
      }
    });

    const keptEdges = edges.filter(edge =>
      keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target)
    );
    if (!keptEdges.length) {
      return { nodes: [], edges: [] };
    }

    const keptNodes = nodes.filter(node => keptNodeIds.has(node.id));
    return {
      nodes: this._normalizeHorizontalLayoutByDepth(keptNodes, keptEdges, startShipId),
      edges: keptEdges
    };
  }

  private _getUniqueShips(ships: Ship[]): Ship[] {
    const seen = new Set<string>();
    return ships.filter(ship => {
      const key = this._getShipVariantKey(ship);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private _getShipVariant(shipName: string): ShipVariant {
    if (this._isWbVariantName(shipName)) return 'wb';
    if (this._isPriceIncreaseVariantName(shipName)) return 'historical';
    return 'base';
  }

  private _getBaseShipName(shipName: string): string {
    return shipName
      .replace(/__auto_(wb|pi)_\d+$/, '')
      .replace(/-historical$/, '')
      .replace(/-wb$/, '');
  }

  private _getShipVariantKey(ship: Ship): string {
    return `${ship.id}:${ship.name}`;
  }

  private _getSpecialShipPricing(
    ship: Ship,
    specialPricingMap?: Record<string, SpecialShipPricing>
  ): SpecialShipPricing | undefined {
    if (!specialPricingMap) return undefined;
    return specialPricingMap[this._getShipVariantKey(ship)];
  }

  private _isWarbondEdition(edition?: string): boolean {
    if (!edition) return false;
    const lowerEdition = edition.toLowerCase();
    return lowerEdition.includes('warbond') || lowerEdition.includes('-wb') || lowerEdition.includes(' wb');
  }

  private _isStandardEdition(edition?: string): boolean {
    if (!edition) return true;
    const lowerEdition = edition.toLowerCase();
    if (this._isWarbondEdition(edition)) return false;
    return lowerEdition.includes('standard');
  }

  private _isDiscountPriceEntry(entry: PriceHistoryEntity['history'][number]): boolean {
    if (typeof entry.msrp !== 'number') return false;
    if (typeof entry.baseMsrp === 'number' && entry.msrp < entry.baseMsrp) {
      return true;
    }
    return this._isWarbondEdition(entry.edition);
  }

  private _isStandardOrNormalPriceEntry(entry: PriceHistoryEntity['history'][number]): boolean {
    if (typeof entry.msrp !== 'number') return false;
    if (this._isDiscountPriceEntry(entry)) return false;
    if (typeof entry.baseMsrp === 'number') {
      return entry.msrp >= entry.baseMsrp;
    }
    return this._isStandardEdition(entry.edition);
  }

  private _findHistoryPriceOptionsInRange(
    history: PriceHistoryEntity['history'],
    rangeStartTs: number,
    rangeEndTs: number,
    predicate: (entry: PriceHistoryEntity['history'][number]) => boolean
  ): number[] {
    const prices = history
      .filter(entry =>
        entry.change === '+' &&
        typeof entry.sku === 'number' &&
        typeof entry.msrp === 'number' &&
        entry.ts >= rangeStartTs &&
        entry.ts <= rangeEndTs &&
        predicate(entry)
      )
      .map(entry => entry.msrp as number);

    return [...new Set(prices)].sort((a, b) => a - b);
  }

  private _collectSkuValidityWindowsForPrice(params: {
    history: PriceHistoryEntity['history'];
    rangeStartTs: number;
    rangeEndTs: number;
    priceCents: number;
    predicate: (entry: PriceHistoryEntity['history'][number]) => boolean;
  }): CcuValidityWindow[] {
    const { history, rangeStartTs, rangeEndTs, priceCents, predicate } = params;
    const openBySku = new Map<number, number>();
    const windows: CcuValidityWindow[] = [];

    const pushWindow = (sku: number, startTs: number, endTs: number | null) => {
      const clippedStartTs = Math.max(startTs, rangeStartTs);
      const rawEndTs = endTs === null ? rangeEndTs : Math.min(endTs, rangeEndTs);
      if (clippedStartTs > rawEndTs) {
        return;
      }

      windows.push({
        sku,
        startTs: clippedStartTs,
        endTs: endTs === null ? null : rawEndTs
      });
    };

    const sortedHistory = [...history]
      .filter(entry => entry.ts <= rangeEndTs)
      .sort((a, b) => a.ts - b.ts);

    sortedHistory.forEach(entry => {
      if (typeof entry.sku !== 'number') {
        return;
      }

      if (entry.change === '+') {
        if (!predicate(entry) || typeof entry.msrp !== 'number' || entry.msrp !== priceCents) {
          return;
        }

        if (!openBySku.has(entry.sku)) {
          openBySku.set(entry.sku, entry.ts);
        }
        return;
      }

      if (entry.change === '-') {
        const openTs = openBySku.get(entry.sku);
        if (openTs === undefined) {
          return;
        }

        pushWindow(entry.sku, openTs, entry.ts);
        openBySku.delete(entry.sku);
      }
    });

    openBySku.forEach((startTs, sku) => {
      pushWindow(sku, startTs, null);
    });

    return windows.sort((a, b) => {
      if (a.startTs !== b.startTs) {
        return a.startTs - b.startTs;
      }
      return a.sku - b.sku;
    });
  }

  private _collectSourceStandardPriceWindows(params: {
    history: PriceHistoryEntity['history'];
  }): SourceStandardPriceWindow[] {
    const { history } = params;
    const openBySku = new Map<number, { startTs: number; priceCents: number }>();
    const windows: SourceStandardPriceWindow[] = [];

    const pushWindow = (sku: number, priceCents: number, startTs: number, endTs: number | null) => {
      if (endTs !== null && startTs >= endTs) {
        return;
      }

      windows.push({
        sku,
        priceCents,
        startTs,
        endTs
      });
    };

    const sortedHistory = [...history].sort((a, b) => a.ts - b.ts);
    sortedHistory.forEach(entry => {
      if (typeof entry.sku !== 'number') {
        return;
      }

      if (entry.change === '+') {
        const existing = openBySku.get(entry.sku);
        if (existing) {
          pushWindow(entry.sku, existing.priceCents, existing.startTs, entry.ts);
          openBySku.delete(entry.sku);
        }

        if (!this._isStandardOrNormalPriceEntry(entry) || typeof entry.msrp !== 'number') {
          return;
        }

        openBySku.set(entry.sku, {
          startTs: entry.ts,
          priceCents: entry.msrp
        });
        return;
      }

      if (entry.change === '-') {
        const existing = openBySku.get(entry.sku);
        if (!existing) {
          return;
        }

        pushWindow(entry.sku, existing.priceCents, existing.startTs, entry.ts);
        openBySku.delete(entry.sku);
      }
    });

    openBySku.forEach((value, sku) => {
      pushWindow(sku, value.priceCents, value.startTs, null);
    });

    return windows.sort((a, b) => {
      if (a.startTs !== b.startTs) {
        return a.startTs - b.startTs;
      }
      if (a.priceCents !== b.priceCents) {
        return a.priceCents - b.priceCents;
      }
      return a.sku - b.sku;
    });
  }

  private _getSourceHighestStandardPriceByTs(
    sourceStandardWindows: SourceStandardPriceWindow[],
    tsInclusive: number
  ): number | null {
    const candidatePrices = sourceStandardWindows
      .filter(sourceWindow => sourceWindow.startTs <= tsInclusive)
      .map(sourceWindow => sourceWindow.priceCents);
    if (!candidatePrices.length) {
      return null;
    }
    return Math.max(...candidatePrices);
  }

  private _hasSourceEffectiveIncreaseAtTs(
    sourceStandardWindows: SourceStandardPriceWindow[],
    ts: number
  ): boolean {
    const previousPrices = sourceStandardWindows
      .filter(sourceWindow => sourceWindow.startTs < ts)
      .map(sourceWindow => sourceWindow.priceCents);
    const atTsPrices = sourceStandardWindows
      .filter(sourceWindow => sourceWindow.startTs === ts)
      .map(sourceWindow => sourceWindow.priceCents);
    if (!atTsPrices.length) {
      return false;
    }

    const previousMax = previousPrices.length ? Math.max(...previousPrices) : Number.NEGATIVE_INFINITY;
    const atTsMax = Math.max(...atTsPrices);
    return atTsMax > previousMax;
  }

  private _getLowestHistoricalUpgradeCostUsd(params: {
    sourceShipId: number;
    targetPriceCents: number;
    targetValidityWindows: CcuValidityWindow[];
    priceHistoryMap: Record<number, PriceHistoryEntity>;
  }): number | null {
    const { sourceShipId, targetPriceCents, targetValidityWindows, priceHistoryMap } = params;
    if (!targetValidityWindows.length) {
      return null;
    }

    const sourceHistory = priceHistoryMap[sourceShipId]?.history || [];
    const sourceStandardWindows = this._collectSourceStandardPriceWindows({
      history: sourceHistory
    });
    if (!sourceStandardWindows.length) {
      return null;
    }

    const candidateCosts = targetValidityWindows
      .map(targetWindow => {
        const pricePointTs = this._getWindowEvaluationTs(
          targetWindow.startTs,
          targetWindow.endTs,
          Number.POSITIVE_INFINITY
        );
        const sourceEffectivePrice = this._getSourceHighestStandardPriceByTs(sourceStandardWindows, pricePointTs);
        if (sourceEffectivePrice === null || sourceEffectivePrice >= targetPriceCents) {
          return null;
        }

        const costUsd = (targetPriceCents - sourceEffectivePrice) / 100;
        return costUsd > 0 ? costUsd : null;
      })
      .filter((value): value is number => typeof value === 'number');

    if (!candidateCosts.length) {
      return null;
    }

    return Math.min(...candidateCosts);
  }

  private _getWindowEvaluationTs(startTs: number, endTs: number | null, fallbackEndTs: number): number {
    if (endTs === null) {
      return fallbackEndTs;
    }
    // Treat validity window end as exclusive.
    return Math.max(startTs, endTs - 1);
  }

  private _filterTargetValidityWindowsBySourceSkuPrice(params: SourceSkuPriceConstraintParams): CcuValidityWindow[] {
    const {
      sourceShipId,
      targetPriceCents,
      targetValidityWindows,
      priceHistoryMap,
      enforceSimultaneousIncrease = false
    } = params;

    const sourceHistory = priceHistoryMap[sourceShipId]?.history || [];
    const hasHistorySkuData = sourceHistory.some(entry =>
      entry.change === '+' &&
      typeof entry.sku === 'number' &&
      typeof entry.msrp === 'number'
    );
    if (!hasHistorySkuData) {
      return [];
    }

    const sourceStandardWindows = this._collectSourceStandardPriceWindows({
      history: sourceHistory
    });
    if (!sourceStandardWindows.length) {
      return [];
    }

    return targetValidityWindows.flatMap(targetWindow => {
      const targetWindowStartTs = targetWindow.startTs;
      const sourceHighestAtWindowStart = this._getSourceHighestStandardPriceByTs(sourceStandardWindows, targetWindowStartTs);
      if (sourceHighestAtWindowStart === null || sourceHighestAtWindowStart >= targetPriceCents) {
        return [];
      }

      let effectiveTargetWindowEndTs = targetWindow.endTs;
      const firstHigherSourceTs = sourceStandardWindows
        .filter(sourceWindow =>
          sourceWindow.startTs > targetWindowStartTs
          && sourceWindow.priceCents > targetPriceCents
          && (targetWindow.endTs === null || sourceWindow.startTs < targetWindow.endTs)
        )
        .map(sourceWindow => sourceWindow.startTs)
        .sort((a, b) => a - b)[0];
      if (typeof firstHigherSourceTs === 'number') {
        effectiveTargetWindowEndTs = firstHigherSourceTs;
      }

      if (effectiveTargetWindowEndTs !== null && effectiveTargetWindowEndTs <= targetWindowStartTs) {
        return [];
      }

      const effectiveTargetWindowEvalTs = this._getWindowEvaluationTs(
        targetWindowStartTs,
        effectiveTargetWindowEndTs,
        Number.POSITIVE_INFINITY
      );
      const sourceHighestAtWindowEnd = this._getSourceHighestStandardPriceByTs(sourceStandardWindows, effectiveTargetWindowEvalTs);
      if (sourceHighestAtWindowEnd !== null && sourceHighestAtWindowEnd > targetPriceCents) {
        return [];
      }

      if (
        enforceSimultaneousIncrease
        && targetWindow.endTs !== null
        && this._hasSourceEffectiveIncreaseAtTs(sourceStandardWindows, targetWindow.endTs)
      ) {
        return [];
      }

      return [{
        ...targetWindow,
        endTs: effectiveTargetWindowEndTs
      }];
    });
  }

  private _isWbVariantName(shipName: string): boolean {
    return shipName.endsWith('-wb') || /__auto_wb_\d+$/.test(shipName);
  }

  private _isPriceIncreaseVariantName(shipName: string): boolean {
    return shipName.endsWith('-historical') || /__auto_pi_\d+$/.test(shipName);
  }

  private _hasValidSkuInRange(
    history: PriceHistoryEntity['history'],
    rangeStartTs: number,
    rangeEndTs: number
  ): boolean {
    return history.some(entry =>
      entry.change === '+' &&
      typeof entry.msrp === 'number' &&
      typeof entry.sku === 'number' &&
      entry.ts >= rangeStartTs &&
      entry.ts <= rangeEndTs
    );
  }

  private _getShipPrice(
    ship: Ship,
    ccus: Ccu[],
    _wbHistory: WbHistoryData[],
    priceHistoryMap: Record<number, PriceHistoryEntity>,
    specialPricingMap?: Record<string, SpecialShipPricing>
  ): number {
    const specialPrice = this._getSpecialShipPricing(ship, specialPricingMap);
    if (specialPrice) {
      return specialPrice.priceCents;
    }

    if (this._isWbVariantName(ship.name)) {
      return ccus.find(c => c.id === ship.id)?.skus.find(sku => sku.price !== ship.msrp && sku.available)?.price || ship.msrp;
    }

    if (this._isPriceIncreaseVariantName(ship.name)) {
      const historicalPrice = priceHistoryMap[ship.id]?.history
        .filter(entry =>
          entry.change === '+' &&
          typeof entry.sku === 'number' &&
          this._isStandardOrNormalPriceEntry(entry)
        )
        .map(entry => entry.msrp as number)
        .sort((a, b) => a - b)[0];
      return historicalPrice || ship.msrp;
    }

    return ship.msrp;
  }

  private _createPriceLevels(sortedShips: Ship[], shipActualPrices: Map<string, number>): Map<number, Ship[]> {
    const priceLevels: Map<number, Ship[]> = new Map();
    sortedShips.forEach(ship => {
      const price = shipActualPrices.get(this._getShipVariantKey(ship))!;
      if (!priceLevels.has(price)) {
        priceLevels.set(price, []);
      }
      priceLevels.get(price)?.push(ship);
    });
    return priceLevels;
  }

  private _createNodesForPriceLevels(
    priceLevels: Map<number, Ship[]>,
    sortedPriceLevels: number[],
    startPosition: { x: number; y: number },
    ccus: Ccu[],
    wbHistory: WbHistoryData[],
    newNodes: Node<ShipNodeData>[],
    layout?: PathLayoutOptions
  ): Map<string, Node<ShipNodeData>> {
    let levelX = startPosition.x;
    const levelSpacing = layout?.levelSpacing || 500;
    const minVerticalSpacing = layout?.minVerticalSpacing || 500;
    const preferredLevelHeight = layout?.preferredLevelHeight || 600;
    const shipNodeMap: Map<string, Node<ShipNodeData>> = new Map();

    sortedPriceLevels.forEach((price, levelIndex) => {
      const shipsAtLevel = priceLevels.get(price) || [];
      const levelY = startPosition.y;
      const shipsSpacing = Math.max(minVerticalSpacing, preferredLevelHeight / (shipsAtLevel.length || 1));

      shipsAtLevel.forEach((ship, shipIndex) => {
        const shipKey = this._getShipVariantKey(ship);
        if (shipNodeMap.has(shipKey)) {
          return;
        }

        const yPos = levelY + shipIndex * shipsSpacing;
        const timestamp = Date.now();
        const nodeId = `ship-${ship.id}-${timestamp + shipIndex + levelIndex * 100}`;
        const shipVariant = this._getShipVariant(ship.name);

        const shipNode: Node<ShipNodeData> = {
          id: nodeId,
          type: 'ship',
          position: { x: levelX, y: yPos },
          data: {
            ship: {
              ...ship,
              name: this._getBaseShipName(ship.name)
            },
            ccus,
            wbHistory,
            id: nodeId,
            shipVariant,
            pathShipName: ship.name,
            plannerShipKey: shipKey
          }
        };

        newNodes.push(shipNode);
        shipNodeMap.set(shipKey, shipNode);
      });

      levelX += levelSpacing;
    });

    return shipNodeMap;
  }

  private _createLevelShipsArray(
    shipNodeMap: Map<string, Node<ShipNodeData>>,
    sortedPriceLevels: number[],
    shipActualPrices: Map<string, number>
  ): Node<ShipNodeData>[][] {
    const createdNodes = Array.from(shipNodeMap.values());
    const levelShips: Node<ShipNodeData>[][] = [];

    for (let i = 0; i < sortedPriceLevels.length; i++) {
      const currentPrice = sortedPriceLevels[i];
      const currentLevelShips = createdNodes.filter(node => {
        const actualPrice = shipActualPrices.get(node.data.plannerShipKey);
        return actualPrice !== undefined && Math.abs(actualPrice - currentPrice) < 1;
      });
      levelShips.push(currentLevelShips);
    }

    return levelShips;
  }

  private _buildNonHangarEdgeData(params: {
    sourceShipNode: Node<ShipNodeData>;
    targetShipNode: Node<ShipNodeData>;
    stepShips: Ship[][];
    ccus: Ccu[];
    priceHistoryMap: Record<number, PriceHistoryEntity>;
    specialPricingMap: Record<string, SpecialShipPricing> | undefined;
  }): CcuEdgeData | null {
    const { sourceShipNode, targetShipNode, stepShips, ccus, priceHistoryMap, specialPricingMap } = params;
    const priceDifference = targetShipNode.data.ship.msrp - sourceShipNode.data.ship.msrp;
    const edgeData: CcuEdgeData = {
      price: priceDifference,
      sourceShip: sourceShipNode.data.ship,
      targetShip: targetShipNode.data.ship,
      sourceType: CcuSourceType.OFFICIAL
    };

    const targetShipInPath = stepShips[1].find(ship => this._getShipVariantKey(ship) === targetShipNode.data.plannerShipKey);
    const targetShipNameInPath = targetShipInPath?.name;
    const specialPricing = targetShipInPath ? this._getSpecialShipPricing(targetShipInPath, specialPricingMap) : undefined;

    if (specialPricing) {
      if (
        (specialPricing.sourceType === CcuSourceType.HISTORICAL ||
          specialPricing.sourceType === CcuSourceType.PRICE_INCREASE) &&
        specialPricing.validityWindows?.length
      ) {
        const constrainedWindows = this._filterTargetValidityWindowsBySourceSkuPrice({
          sourceShipId: sourceShipNode.data.ship.id,
          targetPriceCents: specialPricing.priceCents,
          targetValidityWindows: specialPricing.validityWindows,
          priceHistoryMap,
          enforceSimultaneousIncrease: specialPricing.sourceType === CcuSourceType.PRICE_INCREASE
        });

        if (!constrainedWindows.length) {
          return null;
        }

        const actualPrice = this._getLowestHistoricalUpgradeCostUsd({
          sourceShipId: sourceShipNode.data.ship.id,
          targetPriceCents: specialPricing.priceCents,
          targetValidityWindows: constrainedWindows,
          priceHistoryMap
        });
        if (actualPrice === null || actualPrice <= 0) {
          return null;
        }

        edgeData.validityWindows = constrainedWindows;
        edgeData.sourceType = specialPricing.sourceType;
        edgeData.customPrice = Math.max(0, actualPrice);
        return edgeData;
      }

      const actualPrice = specialPricing.priceCents / 100 - sourceShipNode.data.ship.msrp / 100;
      if (actualPrice <= 0) {
        return null;
      }

      edgeData.sourceType = specialPricing.sourceType;
      edgeData.customPrice = Math.max(0, actualPrice);
      if (specialPricing.validityWindows?.length && !edgeData.validityWindows) {
        edgeData.validityWindows = specialPricing.validityWindows;
      }
      return edgeData;
    }

    if (targetShipNameInPath && this._isPriceIncreaseVariantName(targetShipNameInPath)) {
      const historicalPrice = priceHistoryMap[targetShipNode.data.ship.id]?.history
        .filter(entry =>
          entry.change === '+' &&
          typeof entry.sku === 'number' &&
          this._isStandardOrNormalPriceEntry(entry)
        )
        .map(entry => entry.msrp as number)
        .sort((a, b) => a - b)[0];

      if (historicalPrice && historicalPrice !== targetShipNode.data.ship.msrp) {
        const actualPrice = historicalPrice / 100 - sourceShipNode.data.ship.msrp / 100;
        if (actualPrice <= 0) {
          return null;
        }
        edgeData.sourceType = CcuSourceType.PRICE_INCREASE;
        edgeData.customPrice = Math.max(0, actualPrice);
      }
      return edgeData;
    }

    if (targetShipNameInPath && this._isWbVariantName(targetShipNameInPath)) {
      const wbPrice = ccus.find(c => c.id === targetShipNode.data.ship.id)?.skus.find(sku =>
        sku.price !== targetShipNode.data.ship.msrp && sku.available)?.price || targetShipNode.data.ship.msrp;

      if (wbPrice && wbPrice !== targetShipNode.data.ship.msrp) {
        const actualPrice = wbPrice / 100 - sourceShipNode.data.ship.msrp / 100;
        if (actualPrice <= 0) {
          return null;
        }
        edgeData.sourceType = CcuSourceType.AVAILABLE_WB;
        edgeData.customPrice = Math.max(0, actualPrice);
      }
      return edgeData;
    }

    const targetShipSkus = ccus.find(c => c.id === targetShipNode.data.ship.id)?.skus;
    const targetWb = targetShipSkus?.find(sku => sku.price !== targetShipNode.data.ship.msrp && sku.available);

    if (targetWb && sourceShipNode.data.ship.msrp < targetWb.price) {
      const actualPrice = targetWb.price / 100 - sourceShipNode.data.ship.msrp / 100;
      if (actualPrice <= 0) {
        return null;
      }
      edgeData.sourceType = CcuSourceType.AVAILABLE_WB;
      edgeData.customPrice = Math.max(0, actualPrice);
    }

    return edgeData;
  }

  private _pushAutoPathEdge(params: {
    sourceShipNode: Node<ShipNodeData>;
    targetShipNode: Node<ShipNodeData>;
    edgeData: CcuEdgeData;
    newEdges: Edge<CcuEdgeData>[];
    idSuffix?: string;
  }): void {
    const { sourceShipNode, targetShipNode, edgeData, newEdges, idSuffix } = params;
    const baseId = `edge-${sourceShipNode.id}-${targetShipNode.id}`;
    const edgeId = idSuffix ? `${baseId}-${idSuffix}` : baseId;
    newEdges.push({
      id: edgeId,
      source: sourceShipNode.id,
      target: targetShipNode.id,
      type: 'ccu',
      animated: true,
      data: edgeData
    });
  }

  private _createUpgradeEdges(
    levelShips: Node<ShipNodeData>[][],
    stepShips: Ship[][],
    ccus: Ccu[],
    _wbHistory: WbHistoryData[],
    priceHistoryMap: Record<number, PriceHistoryEntity>,
    hangarItems: HangarItem[],
    _importItems: ImportItem[],
    specialPricingMap: Record<string, SpecialShipPricing> | undefined,
    options: PathBuildOptions | undefined,
    newEdges: Edge<CcuEdgeData>[]
  ): void {
    const exhaustiveEdgeSearch = options?.exhaustiveEdgeSearch === true;
    const preferHangarCcu = options?.preferHangarCcu !== false;
    const buildConstraintAwareGraph = options?.buildConstraintAwareGraph === true;

    levelShips.forEach((level, index) => {
      level.forEach(targetShipNode => {
        for (let i = index - 1; i >= 0; i--) {
          const sourceShips = levelShips[i].filter(sourceShipNode => {
            const originShip = stepShips[1].find(s => this._getShipVariantKey(s) === sourceShipNode.data.plannerShipKey);
            const targetShipInPath = stepShips[1].find(s => this._getShipVariantKey(s) === targetShipNode.data.plannerShipKey);
            const targetSpecialPricing = targetShipInPath ? this._getSpecialShipPricing(targetShipInPath, specialPricingMap) : undefined;
            const targetShipCost = this._getShipPrice(targetShipInPath || targetShipNode.data.ship, ccus, [], priceHistoryMap, specialPricingMap);
            const isHistoricalTargetPricing = targetSpecialPricing
              && (
                targetSpecialPricing.sourceType === CcuSourceType.HISTORICAL
                || targetSpecialPricing.sourceType === CcuSourceType.PRICE_INCREASE
              );

            const exactMatchCCU = (buildConstraintAwareGraph || preferHangarCcu) && hangarItems.some(upgrade =>
              upgrade.fromShip?.toUpperCase() === sourceShipNode.data.ship.name.trim().toUpperCase() &&
              upgrade.toShip?.toUpperCase() === targetShipNode.data.ship.name.trim().toUpperCase()
            );

            if (!isHistoricalTargetPricing && sourceShipNode.data.ship.msrp >= targetShipCost && !exactMatchCCU) {
              return false;
            }

            if (exhaustiveEdgeSearch) {
              return true;
            }

            if (stepShips[0].find(s => s.id === sourceShipNode.data.ship.id)) {
              return true;
            }

            return (originShip ? this._isWbVariantName(originShip.name) : false) ||
              (originShip ? this._isPriceIncreaseVariantName(originShip.name) : false) ||
              hangarItems.some(upgrade => upgrade.toShip?.toUpperCase() === sourceShipNode.data.ship.name.trim().toUpperCase()) ||
              exactMatchCCU;
          });

          if (sourceShips.length > 0) {
            sourceShips.forEach(sourceShipNode => {
              const priceDifference = targetShipNode.data.ship.msrp - sourceShipNode.data.ship.msrp;
              const hangarCcu = hangarItems.find(upgrade => {
                const from = upgrade.fromShip?.toUpperCase();
                const to = upgrade.toShip?.toUpperCase();
                return from === sourceShipNode.data.ship.name.trim().toUpperCase() && to === targetShipNode.data.ship.name.trim().toUpperCase();
              });

              const nonHangarEdgeData = this._buildNonHangarEdgeData({
                sourceShipNode,
                targetShipNode,
                stepShips,
                ccus,
                priceHistoryMap,
                specialPricingMap
              });

              const hangarEdgeData: CcuEdgeData | null = hangarCcu
                ? {
                  price: priceDifference,
                  sourceShip: sourceShipNode.data.ship,
                  targetShip: targetShipNode.data.ship,
                  sourceType: CcuSourceType.HANGER,
                  customPrice: hangarCcu.price
                }
                : null;

              if (buildConstraintAwareGraph) {
                if (nonHangarEdgeData) {
                  this._pushAutoPathEdge({
                    sourceShipNode,
                    targetShipNode,
                    edgeData: nonHangarEdgeData,
                    newEdges,
                    idSuffix: 'base'
                  });
                }

                if (hangarEdgeData) {
                  this._pushAutoPathEdge({
                    sourceShipNode,
                    targetShipNode,
                    edgeData: hangarEdgeData,
                    newEdges,
                    idSuffix: 'hangar'
                  });
                }
                return;
              }

              const selectedEdgeData = hangarEdgeData && preferHangarCcu
                ? hangarEdgeData
                : nonHangarEdgeData;
              if (!selectedEdgeData) {
                return;
              }

              this._pushAutoPathEdge({
                sourceShipNode,
                targetShipNode,
                edgeData: selectedEdgeData,
                newEdges
              });
            });

            if (!exhaustiveEdgeSearch) {
              break;
            }
          }
        }
      });
    });
  }

  private _getEdgeCost(edge: Edge<CcuEdgeData>): number {
    if (!edge.data) return Number.POSITIVE_INFINITY;

    if (typeof edge.data.customPrice === 'number') {
      return edge.data.customPrice;
    }

    const sourcePrice = edge.data.sourceShip?.msrp || 0;
    const targetPrice = edge.data.targetShip?.msrp || 0;
    return (targetPrice - sourcePrice) / 100;
  }

  private _getOfficialEdgeCost(edge: Edge<CcuEdgeData>): number {
    const sourcePrice = edge.data?.sourceShip?.msrp || 0;
    const targetPrice = edge.data?.targetShip?.msrp || 0;
    return (targetPrice - sourcePrice) / 100;
  }

  private _getEdgeSavings(edge: Edge<CcuEdgeData>): number {
    const officialCost = this._getOfficialEdgeCost(edge);
    const actualCost = this._getEdgeCost(edge);
    if (!Number.isFinite(officialCost) || !Number.isFinite(actualCost)) {
      return 0;
    }
    return officialCost - actualCost;
  }

  private _keepOnlySavingPaths(params: {
    nodes: Node<ShipNodeData>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
    directUpgradeCost: number;
  }): { nodes: Node<ShipNodeData>[]; edges: Edge<CcuEdgeData>[] } {
    const { nodes, edges, startShipId, targetShipId, directUpgradeCost } = params;
    if (!nodes.length || !edges.length) {
      return { nodes: [], edges: [] };
    }

    const startNodes = nodes.filter(node => node.data.ship.id === startShipId);
    const targetNodes = new Set(nodes.filter(node => node.data.ship.id === targetShipId).map(node => node.id));

    if (!startNodes.length || !targetNodes.size) {
      return { nodes: [], edges: [] };
    }

    const outgoingMap = new Map<string, Edge<CcuEdgeData>[]>();
    edges.forEach(edge => {
      const list = outgoingMap.get(edge.source) || [];
      list.push(edge);
      outgoingMap.set(edge.source, list);
    });

    const topoNodes = [...nodes].sort((a, b) => {
      if (a.position.x !== b.position.x) {
        return a.position.x - b.position.x;
      }
      return a.position.y - b.position.y;
    });

    const distFromStart = new Map<string, number>();
    const distToTarget = new Map<string, number>();
    const bestPrevEdgeId = new Map<string, string>();
    const edgeById = new Map<string, Edge<CcuEdgeData>>();
    nodes.forEach(node => {
      distFromStart.set(node.id, Number.POSITIVE_INFINITY);
      distToTarget.set(node.id, Number.POSITIVE_INFINITY);
    });
    edges.forEach(edge => edgeById.set(edge.id, edge));

    startNodes.forEach(node => distFromStart.set(node.id, 0));
    topoNodes.forEach(node => {
      const currentCost = distFromStart.get(node.id) ?? Number.POSITIVE_INFINITY;
      if (!Number.isFinite(currentCost)) return;
      const nextEdges = outgoingMap.get(node.id) || [];
      nextEdges.forEach(edge => {
        const edgeCost = this._getEdgeCost(edge);
        if (!Number.isFinite(edgeCost) || edgeCost < 0) return;
        const nextCost = currentCost + edgeCost;
        const currentTargetCost = distFromStart.get(edge.target) ?? Number.POSITIVE_INFINITY;
        if (nextCost < currentTargetCost - 1e-6) {
          distFromStart.set(edge.target, nextCost);
          bestPrevEdgeId.set(edge.target, edge.id);
        }
      });
    });

    targetNodes.forEach(nodeId => distToTarget.set(nodeId, 0));
    [...topoNodes].reverse().forEach(node => {
      const nextEdges = outgoingMap.get(node.id) || [];
      nextEdges.forEach(edge => {
        const edgeCost = this._getEdgeCost(edge);
        const tailCost = distToTarget.get(edge.target) ?? Number.POSITIVE_INFINITY;
        if (!Number.isFinite(edgeCost) || edgeCost < 0 || !Number.isFinite(tailCost)) return;
        const candidateCost = edgeCost + tailCost;
        const currentCost = distToTarget.get(node.id) ?? Number.POSITIVE_INFINITY;
        if (candidateCost < currentCost) {
          distToTarget.set(node.id, candidateCost);
        }
      });
    });

    const sortedTargets = Array.from(targetNodes)
      .map(nodeId => ({
        nodeId,
        cost: distFromStart.get(nodeId) ?? Number.POSITIVE_INFINITY
      }))
      .sort((a, b) => a.cost - b.cost);

    const bestTarget = sortedTargets[0];
    const bestTargetCost = bestTarget?.cost ?? Number.POSITIVE_INFINITY;

    if (!Number.isFinite(bestTargetCost) || bestTargetCost >= directUpgradeCost || !bestTarget) {
      return { nodes: [], edges: [] };
    }

    const startNodeIdSet = new Set(startNodes.map(node => node.id));
    const mandatoryEdgeIds = new Set<string>();
    const visitedBacktrackNodes = new Set<string>();
    let cursorNodeId: string | undefined = bestTarget.nodeId;
    while (cursorNodeId && !startNodeIdSet.has(cursorNodeId) && !visitedBacktrackNodes.has(cursorNodeId)) {
      visitedBacktrackNodes.add(cursorNodeId);
      const prevEdgeId = bestPrevEdgeId.get(cursorNodeId);
      if (!prevEdgeId) break;
      mandatoryEdgeIds.add(prevEdgeId);
      cursorNodeId = edgeById.get(prevEdgeId)?.source;
    }

    const edgeScore = new Map<string, number>();
    const edgeSavings = new Map<string, number>();
    const candidateEdges = edges.filter(edge => {
      const sourceCost = distFromStart.get(edge.source) ?? Number.POSITIVE_INFINITY;
      const targetRemainCost = distToTarget.get(edge.target) ?? Number.POSITIVE_INFINITY;
      const edgeCost = this._getEdgeCost(edge);
      if (!Number.isFinite(sourceCost) || !Number.isFinite(targetRemainCost) || !Number.isFinite(edgeCost) || edgeCost < 0) {
        return false;
      }

      const lowerBound = sourceCost + edgeCost + targetRemainCost;
      edgeScore.set(edge.id, lowerBound);
      const savings = this._getEdgeSavings(edge);
      edgeSavings.set(edge.id, savings);
      if (mandatoryEdgeIds.has(edge.id)) {
        return true;
      }

      if (startNodeIdSet.has(edge.source) && targetNodes.has(edge.target) && savings <= 1e-6) {
        return false;
      }

      const explorationSlack = Math.max(1, Math.min(8, bestTargetCost * 0.12));
      const relaxedBound = Math.min(directUpgradeCost, bestTargetCost + explorationSlack);
      if (savings <= 1e-6) {
        const noSavingRelaxedBound = Math.min(directUpgradeCost, bestTargetCost + Math.min(2, explorationSlack * 0.5));
        return lowerBound < noSavingRelaxedBound;
      }

      return lowerBound < relaxedBound;
    });

    const maxEdgesPerSource = nodes.length > 220 ? 1 : 2;
    const maxNoSavingPerSource = 1;
    const maxTotalEdges = nodes.length > 300 ? 180 : 260;
    const maxNoSavingEdgesTotal = Math.max(20, Math.floor(maxTotalEdges * 0.16));
    const selectedEdgeIds = new Set<string>();
    const bySource = new Map<string, Edge<CcuEdgeData>[]>();

    candidateEdges.forEach(edge => {
      const list = bySource.get(edge.source) || [];
      list.push(edge);
      bySource.set(edge.source, list);
    });

    bySource.forEach(sourceEdges => {
      const sortedEdges = [...sourceEdges].sort((a, b) => {
        const scoreA = edgeScore.get(a.id) ?? Number.POSITIVE_INFINITY;
        const scoreB = edgeScore.get(b.id) ?? Number.POSITIVE_INFINITY;
        if (scoreA !== scoreB) return scoreA - scoreB;
        const savingsA = edgeSavings.get(a.id) ?? 0;
        const savingsB = edgeSavings.get(b.id) ?? 0;
        if (savingsA !== savingsB) return savingsB - savingsA;
        return this._getEdgeCost(a) - this._getEdgeCost(b);
      });

      const mandatoryInSource = sortedEdges.filter(edge => mandatoryEdgeIds.has(edge.id));
      mandatoryInSource.forEach(edge => selectedEdgeIds.add(edge.id));

      const discountedEdges = sortedEdges.filter(edge =>
        !selectedEdgeIds.has(edge.id) && (edgeSavings.get(edge.id) ?? 0) > 1e-6
      );
      const noSavingEdges = sortedEdges.filter(edge =>
        !selectedEdgeIds.has(edge.id) && (edgeSavings.get(edge.id) ?? 0) <= 1e-6
      );

      let slotsLeft = Math.max(0, maxEdgesPerSource - mandatoryInSource.length);
      discountedEdges.forEach(edge => {
        if (slotsLeft <= 0) return;
        selectedEdgeIds.add(edge.id);
        slotsLeft--;
      });

      let noSavingSlots = Math.min(maxNoSavingPerSource, slotsLeft);
      noSavingEdges.forEach(edge => {
        if (noSavingSlots <= 0) return;
        selectedEdgeIds.add(edge.id);
        noSavingSlots--;
      });
    });

    if (selectedEdgeIds.size > maxTotalEdges) {
      const mandatoryList = Array.from(selectedEdgeIds).filter(id => mandatoryEdgeIds.has(id));
      const nonMandatorySorted = Array.from(selectedEdgeIds)
        .filter(id => !mandatoryEdgeIds.has(id))
        .sort((a, b) => {
          const scoreDiff = (edgeScore.get(a) ?? Number.POSITIVE_INFINITY) - (edgeScore.get(b) ?? Number.POSITIVE_INFINITY);
          if (scoreDiff !== 0) return scoreDiff;
          const savingsDiff = (edgeSavings.get(b) ?? 0) - (edgeSavings.get(a) ?? 0);
          if (savingsDiff !== 0) return savingsDiff;
          return 0;
        });

      selectedEdgeIds.clear();
      mandatoryList.forEach(id => selectedEdgeIds.add(id));

      const slotsLeft = Math.max(0, maxTotalEdges - selectedEdgeIds.size);
      nonMandatorySorted.slice(0, slotsLeft).forEach(id => selectedEdgeIds.add(id));
    }

    const noSavingSelected = Array.from(selectedEdgeIds).filter(id =>
      !mandatoryEdgeIds.has(id) && (edgeSavings.get(id) ?? 0) <= 1e-6
    );
    if (noSavingSelected.length > maxNoSavingEdgesTotal) {
      const noSavingSorted = [...noSavingSelected].sort((a, b) =>
        (edgeScore.get(a) ?? Number.POSITIVE_INFINITY) - (edgeScore.get(b) ?? Number.POSITIVE_INFINITY)
      );
      const keepNoSaving = new Set(noSavingSorted.slice(0, maxNoSavingEdgesTotal));
      noSavingSelected.forEach(id => {
        if (!keepNoSaving.has(id)) {
          selectedEdgeIds.delete(id);
        }
      });
    }

    const keptEdges = candidateEdges.filter(edge => selectedEdgeIds.has(edge.id));
    if (!keptEdges.length) {
      return { nodes: [], edges: [] };
    }

    const nextFromStart = new Map<string, string[]>();
    const prevToTarget = new Map<string, string[]>();
    keptEdges.forEach(edge => {
      const out = nextFromStart.get(edge.source) || [];
      out.push(edge.target);
      nextFromStart.set(edge.source, out);

      const back = prevToTarget.get(edge.target) || [];
      back.push(edge.source);
      prevToTarget.set(edge.target, back);
    });

    const reachableFromStart = new Set<string>();
    const startQueue = startNodes.map(node => node.id);
    while (startQueue.length > 0) {
      const current = startQueue.shift()!;
      if (reachableFromStart.has(current)) continue;
      reachableFromStart.add(current);
      (nextFromStart.get(current) || []).forEach(next => {
        if (!reachableFromStart.has(next)) {
          startQueue.push(next);
        }
      });
    }

    const canReachTarget = new Set<string>();
    const targetQueue = Array.from(targetNodes);
    while (targetQueue.length > 0) {
      const current = targetQueue.shift()!;
      if (canReachTarget.has(current)) continue;
      canReachTarget.add(current);
      (prevToTarget.get(current) || []).forEach(prev => {
        if (!canReachTarget.has(prev)) {
          targetQueue.push(prev);
        }
      });
    }

    const keptNodeIds = new Set<string>();
    nodes.forEach(node => {
      if (reachableFromStart.has(node.id) && canReachTarget.has(node.id)) {
        keptNodeIds.add(node.id);
      }
    });

    const fullyConnectedEdges = keptEdges.filter(edge =>
      keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target)
    );
    if (!fullyConnectedEdges.length) {
      return { nodes: [], edges: [] };
    }

    const keptNodes = nodes.filter(node => keptNodeIds.has(node.id));

    return {
      nodes: this._normalizeHorizontalLayoutByDepth(keptNodes, fullyConnectedEdges, startShipId),
      edges: fullyConnectedEdges
    };
  }

  private _normalizeHorizontalLayoutByDepth(
    nodes: Node<ShipNodeData>[],
    edges: Edge<CcuEdgeData>[],
    startShipId: number
  ): Node<ShipNodeData>[] {
    if (!nodes.length) {
      return nodes;
    }

    const nodeMap = new Map<string, Node<ShipNodeData>>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    const outgoingMap = new Map<string, Edge<CcuEdgeData>[]>();
    const incomingCount = new Map<string, number>();

    nodes.forEach(node => incomingCount.set(node.id, 0));
    edges.forEach(edge => {
      const list = outgoingMap.get(edge.source) || [];
      list.push(edge);
      outgoingMap.set(edge.source, list);
      incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
    });

    const startNodeIds = nodes
      .filter(node => node.data.ship.id === startShipId)
      .map(node => node.id);

    const rootNodeIds = startNodeIds.length
      ? startNodeIds
      : nodes.filter(node => (incomingCount.get(node.id) || 0) === 0).map(node => node.id);

    if (!rootNodeIds.length) {
      return nodes;
    }

    const depthMap = new Map<string, number>();
    const queue: string[] = [];

    rootNodeIds.forEach(nodeId => {
      depthMap.set(nodeId, 0);
      queue.push(nodeId);
    });

    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      const currentDepth = depthMap.get(currentNodeId) || 0;
      const nextEdges = outgoingMap.get(currentNodeId) || [];

      nextEdges.forEach(edge => {
        if (!nodeMap.has(edge.target)) {
          return;
        }

        const nextDepth = currentDepth + 1;
        const existingDepth = depthMap.get(edge.target);

        if (existingDepth === undefined || nextDepth < existingDepth) {
          depthMap.set(edge.target, nextDepth);
          queue.push(edge.target);
        }
      });
    }

    for (let i = 0; i < nodes.length; i++) {
      let changed = false;
      edges.forEach(edge => {
        const sourceDepth = depthMap.get(edge.source);
        if (sourceDepth === undefined) return;
        const targetDepth = depthMap.get(edge.target);
        if (targetDepth === undefined || targetDepth <= sourceDepth) {
          depthMap.set(edge.target, sourceDepth + 1);
          changed = true;
        }
      });
      if (!changed) break;
    }

    const fallbackColumns = [...new Set(nodes.map(node => node.position.x))].sort((a, b) => a - b);
    const fallbackDepthMap = new Map<number, number>();
    fallbackColumns.forEach((x, index) => fallbackDepthMap.set(x, index));

    const resolvedDepth = new Map<string, number>();
    nodes.forEach(node => {
      resolvedDepth.set(node.id, depthMap.get(node.id) ?? fallbackDepthMap.get(node.position.x) ?? 0);
    });

    const nodesByDepth = new Map<number, Node<ShipNodeData>[]>();
    nodes.forEach(node => {
      const depth = resolvedDepth.get(node.id) || 0;
      const list = nodesByDepth.get(depth) || [];
      list.push(node);
      nodesByDepth.set(depth, list);
    });

    const minX = Math.min(...nodes.map(node => node.position.x));
    const minY = Math.min(...nodes.map(node => node.position.y));
    const horizontalSpacing = 500;
    const verticalSpacing = 620;
    const maxColumnSize = Math.max(...Array.from(nodesByDepth.values()).map(col => col.length));

    const layoutMap = new Map<string, { x: number; y: number }>();

    Array.from(nodesByDepth.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([depth, columnNodes]) => {
        const sortedColumnNodes = [...columnNodes].sort((a, b) => {
          const msrpDiff = (a.data.ship.msrp || 0) - (b.data.ship.msrp || 0);
          if (msrpDiff !== 0) return msrpDiff;
          return a.position.y - b.position.y;
        });

        const columnOffset = ((maxColumnSize - sortedColumnNodes.length) * verticalSpacing) / 2;

        sortedColumnNodes.forEach((node, index) => {
          layoutMap.set(node.id, {
            x: minX + depth * horizontalSpacing,
            y: minY + columnOffset + index * verticalSpacing
          });
        });
      });

    return nodes.map(node => ({
      ...node,
      position: layoutMap.get(node.id) || node.position
    }));
  }
}

export default PathBuilderService;
