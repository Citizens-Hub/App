import { Ccu, CcuEdgeData, ImportItem, PriceHistoryEntity, WbHistoryData } from '@/types';
import { Edge, Node } from 'reactflow';
import { HangarItem } from './CcuSourceTypeFactory';
import pathFinderService from './PathFinderService';

export interface WasmNode {
  id: string;
  shipId: string;
}

export interface WasmEdge {
  sourceNodeId: string;
  sourceShipId: string;
  targetNodeId: string;
  usdPrice: number;
  tpPrice: number;
  isUsedUp: boolean;
  allowUsedUpEdge: boolean;
}

export interface WasmStart {
  nodeId: string;
  usdCost: number;
  tpCost: number;
}

export interface WasmRequest {
  nodes: WasmNode[];
  edges: WasmEdge[];
  starts: WasmStart[];
  endShipId: string;
  exchangeRate: number;
  conciergeValue: number;
  pruneOpt: boolean;
}

export interface WasmStats {
  expanded: number;
  pruned: number;
  returned: number;
}

export interface WasmResponse {
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

export function extractShipIdFromNodeId(nodeId: string): string {
  const segments = nodeId.split('-');
  return segments.length >= 2 ? segments[1] : nodeId;
}

export function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildWasmRequest(params: WasmPathFinderParams): WasmRequest {
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
