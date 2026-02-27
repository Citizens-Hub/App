import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Button, Chip, CircularProgress, Autocomplete, TextField } from '@mui/material';
import { Close } from '@mui/icons-material';
import { Edge, Node } from 'reactflow';
import { FormattedMessage, useIntl } from 'react-intl';
import { CcuEdgeData, CcuSourceType, CcuValidityWindow, Ship } from '../../../types';
import { ChevronsRight } from 'lucide-react';
import { useCcuPlanner } from '../context/useCcuPlanner';
import { AutoPathBuildRequest } from '../services/PathBuilderService';
import PriceHistoryChart from '../../../components/PriceHistoryChart';

interface AutoPathNodeData {
  ship: Ship;
  [key: string]: unknown;
}

export interface ReviewedPathBuildResult {
  nodes: Node<AutoPathNodeData>[];
  edges: Edge<CcuEdgeData>[];
}

interface PathBuilderProps {
  open: boolean;
  onClose: () => void;
  onCreatePath: (result: ReviewedPathBuildResult) => void;
}

interface ReviewPathEdge {
  edge: Edge<CcuEdgeData>;
  sourceShip: Ship;
  targetShip: Ship;
  cost: number;
  key: string;
  sourceType: CcuSourceType;
  validityWindows?: CcuValidityWindow[];
}

interface ReviewPath {
  nodeIds: string[];
  edges: ReviewPathEdge[];
  totalCost: number;
}

interface ExcludedCcu {
  key: string;
  label: string;
}

interface HangarCcuOption {
  key: string;
  label: string;
}

function normalizeShipName(name: string): string {
  return name.trim().toUpperCase();
}

function buildHangarCcuKey(fromShipName: string, toShipName: string): string {
  return `${normalizeShipName(fromShipName)}->${normalizeShipName(toShipName)}`;
}

function getShipImageUrl(ship?: Ship | null): string {
  if (!ship) return '';
  if (ship.medias?.productThumbMediumAndSmall) {
    return ship.medias.productThumbMediumAndSmall;
  }
  if (ship.medias?.slideShow) {
    return ship.medias.slideShow;
  }
  return '';
}

function ShipImage({
  ship,
  className,
  placeholderClassName,
}: {
  ship?: Ship | null;
  className: string;
  placeholderClassName?: string;
}) {
  const imageUrl = getShipImageUrl(ship);
  if (!imageUrl) {
    return (
      <div className={`${className} ${placeholderClassName || ''} bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] text-gray-500`}>
        N/A
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={ship?.name || 'ship'}
      className={`${className} object-cover border border-gray-200 dark:border-gray-700`}
    />
  );
}

function UpgradePreview({
  fromShip,
  toShip,
  className,
}: {
  fromShip: Ship;
  toShip: Ship;
  className?: string;
}) {
  const fromImage = getShipImageUrl(fromShip);
  const toImage = getShipImageUrl(toShip);

  return (
    <div className={`relative overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-[#1b1b1b] ${className || 'w-[180px] h-[72px]'}`}>
      {fromImage ? (
        <img
          src={fromImage}
          alt={fromShip.name}
          className="absolute left-0 top-0 w-[35%] h-full object-cover"
        />
      ) : (
        <div className="absolute left-0 top-0 w-[35%] h-full flex items-center justify-center text-[10px] text-gray-500 bg-gray-200 dark:bg-gray-700">N/A</div>
      )}

      {toImage ? (
        <img
          src={toImage}
          alt={toShip.name}
          className="absolute right-0 top-0 w-[65%] h-full object-cover shadow-[0_0_20px_0_rgba(0,0,0,0.22)]"
        />
      ) : (
        <div className="absolute right-0 top-0 w-[65%] h-full flex items-center justify-center text-[10px] text-gray-500 bg-gray-200 dark:bg-gray-700">N/A</div>
      )}

      <div className="absolute top-1/2 left-[35%] -translate-x-1/2 -translate-y-1/2 text-white">
        <ChevronsRight className="w-6 h-6 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]" />
      </div>
    </div>
  );
}

function getCcuTypeStyle(sourceType: CcuSourceType): string {
  switch (sourceType) {
    case CcuSourceType.HANGER:
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case CcuSourceType.HISTORICAL:
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case CcuSourceType.PRICE_INCREASE:
      return 'bg-sky-50 text-sky-700 border border-sky-200';
    case CcuSourceType.AVAILABLE_WB:
    case CcuSourceType.OFFICIAL_WB:
      return 'bg-orange-50 text-orange-700 border border-orange-200';
    case CcuSourceType.THIRD_PARTY:
      return 'bg-cyan-50 text-cyan-700 border border-cyan-200';
    case CcuSourceType.SUBSCRIPTION:
      return 'bg-pink-50 text-pink-700 border border-pink-200';
    case CcuSourceType.OFFICIAL:
    default:
      return 'bg-gray-50 text-gray-700 border border-gray-200';
  }
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateRangeToTs(startDate: string, endDate: string): { startTs: number; endTs: number } | null {
  const startTs = new Date(`${startDate}T00:00:00`).getTime();
  const endTs = new Date(`${endDate}T23:59:59`).getTime();

  if (Number.isNaN(startTs) || Number.isNaN(endTs)) {
    return null;
  }

  return { startTs, endTs };
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

function getEdgeKey(edge: Edge<CcuEdgeData>): string {
  const sourceId = edge.data?.sourceShip?.id || edge.source;
  const targetId = edge.data?.targetShip?.id || edge.target;
  const sourceType = edge.data?.sourceType || CcuSourceType.OFFICIAL;
  const cost = getEdgeCost(edge).toFixed(2);
  return `${sourceId}->${targetId}|${sourceType}|${cost}`;
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
  return buildHangarCcuKey(sourceName, targetName);
}

function findBestRoute(params: {
  nodes: Node<AutoPathNodeData>[];
  edges: Edge<CcuEdgeData>[];
  startShipId: number;
  targetShipId: number;
  requiredHangarCcuKeys: Set<string>;
}): ReviewPath | null {
  const { nodes, edges, startShipId, targetShipId, requiredHangarCcuKeys } = params;

  if (!nodes.length || !edges.length) {
    return null;
  }

  const nodeMap = new Map<string, Node<AutoPathNodeData>>();
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
      const edgeCost = getEdgeCost(edge);
      if (!Number.isFinite(edgeCost) || edgeCost < 0) {
        return;
      }

      const hangarKey = getHangarRequirementKeyFromEdge(edge);
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
  const pathEdges: ReviewPathEdge[] = [];
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
      cost: getEdgeCost(edge),
      key: getEdgeKey(edge),
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

export default function PathBuilder({ open, onClose, onCreatePath }: PathBuilderProps) {
  const intl = useIntl();
  const {
    ships,
    hangarItems,
    priceHistoryMap,
    pathBuilderService,
    getServiceData,
    showAlert
  } = useCcuPlanner();

  const [step, setStep] = useState<'configure' | 'review'>('configure');
  const [startShipId, setStartShipId] = useState<number | ''>('');
  const [targetShipId, setTargetShipId] = useState<number | ''>('');
  const [rangeStartDate, setRangeStartDate] = useState('');
  const [rangeEndDate, setRangeEndDate] = useState('');
  const [includeWarbond, setIncludeWarbond] = useState(true);
  const [includePriceIncrease, setIncludePriceIncrease] = useState(true);
  const [ignoreTargetAvailability, setIgnoreTargetAvailability] = useState(true);
  const [preferHangarCcu, setPreferHangarCcu] = useState(true);
  const [reviewRequest, setReviewRequest] = useState<AutoPathBuildRequest | null>(null);
  const [generatedResult, setGeneratedResult] = useState<ReviewedPathBuildResult | null>(null);
  const [excludedCcus, setExcludedCcus] = useState<ExcludedCcu[]>([]);
  const [excludedSkuIds, setExcludedSkuIds] = useState<number[]>([]);
  const [requiredHangarCcuKeys, setRequiredHangarCcuKeys] = useState<string[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const calculateTaskRef = useRef(0);

  const selectableShips = useMemo(
    () => ships.filter(ship => ship.msrp > 0).sort((a, b) => a.msrp - b.msrp),
    [ships]
  );

  const startShip = useMemo(
    () => selectableShips.find(ship => ship.id === startShipId),
    [selectableShips, startShipId]
  );

  const targetShipOptions = useMemo(() => {
    if (!startShip) {
      return selectableShips;
    }

    return selectableShips.filter(ship => ship.msrp > startShip.msrp);
  }, [selectableShips, startShip]);

  const targetShip = useMemo(
    () => selectableShips.find(ship => ship.id === targetShipId),
    [selectableShips, targetShipId]
  );

  const requiredHangarOptions = useMemo(() => {
    const optionMap = new Map<string, HangarCcuOption>();

    hangarItems.forEach(item => {
      if (!item.fromShip || !item.toShip) {
        return;
      }

      const key = buildHangarCcuKey(item.fromShip, item.toShip);
      if (optionMap.has(key)) {
        return;
      }

      const priceText = typeof item.price === 'number'
        ? ` (${item.price.toLocaleString(intl.locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
        : '';
      optionMap.set(key, {
        key,
        label: `${item.fromShip} -> ${item.toShip}${priceText}`
      });
    });

    return Array.from(optionMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [hangarItems, intl.locale]);

  const selectedRequiredHangarOptions = useMemo(() => {
    const requiredKeySet = new Set(requiredHangarCcuKeys);
    return requiredHangarOptions.filter(option => requiredKeySet.has(option.key));
  }, [requiredHangarOptions, requiredHangarCcuKeys]);

  const requiredHangarKeySet = useMemo(
    () => new Set(requiredHangarCcuKeys),
    [requiredHangarCcuKeys]
  );

  const excludedSkuIdSet = useMemo(
    () => new Set(excludedSkuIds),
    [excludedSkuIds]
  );

  const reviewRoute = useMemo(() => {
    if (!generatedResult || !reviewRequest) {
      return null;
    }

    return findBestRoute({
      nodes: generatedResult.nodes,
      edges: generatedResult.edges,
      startShipId: reviewRequest.startShipId,
      targetShipId: reviewRequest.targetShipId,
      requiredHangarCcuKeys: requiredHangarKeySet
    });
  }, [generatedResult, reviewRequest, requiredHangarKeySet]);

  const directUpgradeCost = useMemo(() => {
    if (!reviewRequest) return 0;

    const start = ships.find(ship => ship.id === reviewRequest.startShipId);
    const target = ships.find(ship => ship.id === reviewRequest.targetShipId);

    if (!start || !target) {
      return 0;
    }

    return Math.max(0, (target.msrp - start.msrp) / 100);
  }, [reviewRequest, ships]);

  const reviewStartShip = useMemo(() => {
    if (!reviewRequest) return null;
    return ships.find(ship => ship.id === reviewRequest.startShipId) || null;
  }, [reviewRequest, ships]);

  const reviewTargetShip = useMemo(() => {
    if (!reviewRequest) return null;
    return ships.find(ship => ship.id === reviewRequest.targetShipId) || null;
  }, [reviewRequest, ships]);

  useEffect(() => {
    if (!open) {
      calculateTaskRef.current = Date.now() + Math.random();
      setIsCalculating(false);
      return;
    }

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setFullYear(now.getFullYear() - 1);

    setStep('configure');
    setStartShipId('');
    setTargetShipId('');
    setRangeStartDate(toDateInputValue(defaultStart));
    setRangeEndDate(toDateInputValue(now));
    setIncludeWarbond(true);
    setIncludePriceIncrease(true);
    setIgnoreTargetAvailability(true);
    setPreferHangarCcu(true);
    setReviewRequest(null);
    setGeneratedResult(null);
    setExcludedCcus([]);
    setExcludedSkuIds([]);
    setRequiredHangarCcuKeys([]);
    setIsCalculating(false);
  }, [open]);

  useEffect(() => {
    if (!startShip) {
      return;
    }

    const target = selectableShips.find(ship => ship.id === targetShipId);
    if (target && target.msrp > startShip.msrp) {
      return;
    }

    setTargetShipId('');
  }, [startShip, targetShipId, selectableShips]);

  const formatUsd = (value: number): string => {
    return value.toLocaleString(intl.locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatDate = (ts: number): string => {
    return new Date(ts).toLocaleDateString(intl.locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const getCcuTypeLabel = (sourceType: CcuSourceType): string => {
    switch (sourceType) {
      case CcuSourceType.HANGER:
        return intl.formatMessage({ id: 'routeInfoPanel.hangar', defaultMessage: 'Hangar' });
      case CcuSourceType.HISTORICAL:
        return intl.formatMessage({ id: 'routeInfoPanel.historical', defaultMessage: 'Historical WB' });
      case CcuSourceType.PRICE_INCREASE:
        return intl.formatMessage({ id: 'routeInfoPanel.priceIncrease', defaultMessage: 'Price Increase' });
      case CcuSourceType.AVAILABLE_WB:
      case CcuSourceType.OFFICIAL_WB:
        return intl.formatMessage({ id: 'routeInfoPanel.availableWB', defaultMessage: 'WB' });
      case CcuSourceType.THIRD_PARTY:
        return intl.formatMessage({ id: 'routeInfoPanel.thirdParty', defaultMessage: 'Third Party' });
      case CcuSourceType.OFFICIAL:
        return intl.formatMessage({ id: 'routeInfoPanel.official', defaultMessage: 'Normal' });
      default:
        return sourceType;
    }
  };

  const buildRequest = (): AutoPathBuildRequest | null => {
    if (!startShipId || !targetShipId) {
      showAlert(
        intl.formatMessage({
          id: 'pathBuilder.error.selectShip',
          defaultMessage: 'Please select both starting ship and target ship.'
        }),
        'warning'
      );
      return null;
    }

    if (!includeWarbond && !includePriceIncrease) {
      showAlert(
        intl.formatMessage({
          id: 'pathBuilder.error.optionRequired',
          defaultMessage: 'Please select at least one historical option.'
        }),
        'warning'
      );
      return null;
    }

    const range = parseDateRangeToTs(rangeStartDate, rangeEndDate);
    if (!range || range.startTs > range.endTs) {
      showAlert(
        intl.formatMessage({
          id: 'pathBuilder.error.invalidDateRange',
          defaultMessage: 'Please enter a valid date range.'
        }),
        'warning'
      );
      return null;
    }

    const request: AutoPathBuildRequest = {
      startShipId,
      targetShipId,
      rangeStartTs: range.startTs,
      rangeEndTs: range.endTs,
      includeWarbond,
      includePriceIncrease,
      ignoreTargetAvailability,
      preferHangarCcu
    };

    if (!ignoreTargetAvailability) {
      const targetHistory = priceHistoryMap[targetShipId]?.history || [];
      const hasValidSkuInRange = targetHistory.some(entry =>
        entry.change === '+' &&
        typeof entry.msrp === 'number' &&
        typeof entry.sku === 'number' &&
        entry.ts >= range.startTs &&
        entry.ts <= range.endTs
      );

      if (!hasValidSkuInRange) {
        showAlert(
          intl.formatMessage({
            id: 'pathBuilder.error.targetUnavailableInRange',
            defaultMessage: 'The target ship has no valid SKU in the selected date range. Enable "Ignore target availability" to continue.'
          }),
          'warning'
        );
        return null;
      }
    }

    return request;
  };

  const calculateRoute = async (
    request: AutoPathBuildRequest,
    nextExcludedCcus: ExcludedCcu[],
    nextExcludedSkuIds: number[],
    nextRequiredHangarCcuKeys: string[],
    options?: { showNoPathAlert?: boolean; moveToReview?: boolean }
  ) => {
    const taskId = Date.now() + Math.random();
    calculateTaskRef.current = taskId;
    setIsCalculating(true);

    await new Promise(resolve => setTimeout(resolve, 0));

    const generated = pathBuilderService.createAutoPath({
      request: {
        ...request,
        excludedCcuKeys: nextExcludedCcus.map(item => item.key),
        excludedSkuIds: nextExcludedSkuIds,
        requiredHangarCcuKeys: nextRequiredHangarCcuKeys
      },
      ships,
      ...getServiceData()
    });

    if (calculateTaskRef.current !== taskId) {
      return;
    }

    setReviewRequest(request);
    setGeneratedResult(generated);

    const hasRoute = generated.nodes.length > 0 && generated.edges.length > 0;
    if (options?.moveToReview && hasRoute) {
      setStep('review');
    }

    if (!hasRoute && options?.showNoPathAlert) {
      showAlert(
        intl.formatMessage({
          id: 'pathBuilder.error.noPath',
          defaultMessage: 'No valid path could be generated with the selected settings.'
        }),
        'warning'
      );
    }

    setIsCalculating(false);
  };

  const handleGenerateForReview = async () => {
    const request = buildRequest();
    if (!request) {
      return;
    }

    const nextExcludedCcus: ExcludedCcu[] = [];
    const nextExcludedSkuIds: number[] = [];
    setExcludedCcus(nextExcludedCcus);
    setExcludedSkuIds(nextExcludedSkuIds);
    await calculateRoute(request, nextExcludedCcus, nextExcludedSkuIds, requiredHangarCcuKeys, {
      showNoPathAlert: true,
      moveToReview: true
    });
  };

  const handleExcludeCcu = (edge: ReviewPathEdge) => {
    if (!reviewRequest || isCalculating) {
      return;
    }

    if (excludedCcus.some(item => item.key === edge.key)) {
      return;
    }

    const label = `${edge.sourceShip.name} -> ${edge.targetShip.name} (${edge.sourceType}, ${formatUsd(edge.cost)})`;
    const nextExcludedCcus = [...excludedCcus, { key: edge.key, label }];
    setExcludedCcus(nextExcludedCcus);
    void calculateRoute(reviewRequest, nextExcludedCcus, excludedSkuIds, requiredHangarCcuKeys);
  };

  const handleIncludeCcuAgain = (key: string) => {
    if (!reviewRequest || isCalculating) {
      return;
    }

    const nextExcludedCcus = excludedCcus.filter(item => item.key !== key);
    setExcludedCcus(nextExcludedCcus);
    void calculateRoute(reviewRequest, nextExcludedCcus, excludedSkuIds, requiredHangarCcuKeys);
  };

  const handleExcludeSku = (skuId: number) => {
    if (!reviewRequest || isCalculating) {
      return;
    }

    if (excludedSkuIds.includes(skuId)) {
      return;
    }

    const nextExcludedSkuIds = [...excludedSkuIds, skuId];
    setExcludedSkuIds(nextExcludedSkuIds);
    void calculateRoute(reviewRequest, excludedCcus, nextExcludedSkuIds, requiredHangarCcuKeys);
  };

  const handleIncludeSkuAgain = (skuId: number) => {
    if (!reviewRequest || isCalculating) {
      return;
    }

    const nextExcludedSkuIds = excludedSkuIds.filter(id => id !== skuId);
    setExcludedSkuIds(nextExcludedSkuIds);
    void calculateRoute(reviewRequest, excludedCcus, nextExcludedSkuIds, requiredHangarCcuKeys);
  };

  const handleConfirmRoute = () => {
    if (!generatedResult || !reviewRoute) {
      showAlert(
        intl.formatMessage({
          id: 'pathBuilder.error.noRouteAfterExclusion',
          defaultMessage: 'No valid route remains. Re-enable one or more excluded CCUs and try again.'
        }),
        'warning'
      );
      return;
    }

    const nodeIdSet = new Set(reviewRoute.nodeIds);
    const reviewedNodes = generatedResult.nodes.filter(node => nodeIdSet.has(node.id));
    const reviewedEdges = reviewRoute.edges.map(item => item.edge);

    onCreatePath({
      nodes: reviewedNodes,
      edges: reviewedEdges
    });

    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen
      slotProps={{
        paper: { sx: { borderRadius: 0 } }
      }}
    >
      <DialogTitle className="flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center gap-2">
          <FormattedMessage id="pathBuilder.title" defaultMessage="Path Builder" />
        </div>
        <IconButton onClick={onClose} size="small" aria-label={intl.formatMessage({ id: 'pathBuilder.close', defaultMessage: 'Close' })}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent
        className="p-0 h-full flex flex-col"
        sx={{
          overflow: 'hidden',
          '& .MuiButton-root': { borderRadius: 0 },
          '& .MuiChip-root': { borderRadius: 0 },
          '& .MuiOutlinedInput-root': { borderRadius: 0 }
        }}
      >
        {step === 'configure' ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-auto p-4">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2 flex flex-col gap-4">
                  <div className="text-sm text-gray-500">
                    <FormattedMessage
                      id="pathBuilder.autoHint"
                      defaultMessage="Automatically generate a CCU path graph from your starting ship to your target ship using historical opportunities in the selected time range."
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="border border-gray-200 dark:border-gray-800 p-3">
                      <label htmlFor="auto-start-ship" className="text-sm font-medium">
                        <FormattedMessage id="pathBuilder.startShip" defaultMessage="Starting Ship" />
                      </label>
                      <Autocomplete
                        options={selectableShips}
                        value={startShip || null}
                        onChange={(_, value) => setStartShipId(value?.id ?? '')}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        getOptionLabel={(option) => option.name}
                        noOptionsText={intl.formatMessage({ id: 'pathBuilder.noShips', defaultMessage: 'No ships found' })}
                        ListboxProps={{ style: { maxHeight: 320 } }}
                        slotProps={{ popper: { sx: { zIndex: 1600, '& .MuiPaper-root': { borderRadius: 0 } } } }}
                        renderOption={(props, option) => (
                          <li {...props}>
                            <div className="flex items-center gap-3 w-full py-1">
                              <ShipImage ship={option} className="w-12 h-12" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{option.name}</div>
                                <div className="text-xs text-gray-500">
                                  {(option.msrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                                </div>
                              </div>
                            </div>
                          </li>
                        )}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            id="auto-start-ship"
                            placeholder={intl.formatMessage({ id: 'pathBuilder.selectStartShip', defaultMessage: 'Select starting ship' })}
                            size="small"
                            sx={{ mt: 1 }}
                          />
                        )}
                      />

                      <div className="mt-3 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#121212] p-3">
                        {startShip ? (
                          <div className="flex items-center gap-3">
                            <ShipImage ship={startShip} className="w-16 h-12" />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{startShip.name}</div>
                              <div className="text-xs text-gray-500">{startShip.manufacturer.name}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">
                            <FormattedMessage id="pathBuilder.selectStartShip" defaultMessage="Select starting ship" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border border-gray-200 dark:border-gray-800 p-3">
                      <label htmlFor="auto-target-ship" className="text-sm font-medium">
                        <FormattedMessage id="pathBuilder.targetShip" defaultMessage="Target Ship" />
                      </label>
                      <Autocomplete
                        options={targetShipOptions}
                        value={targetShip || null}
                        onChange={(_, value) => setTargetShipId(value?.id ?? '')}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        getOptionLabel={(option) => option.name}
                        noOptionsText={intl.formatMessage({ id: 'pathBuilder.noShips', defaultMessage: 'No ships found' })}
                        ListboxProps={{ style: { maxHeight: 320 } }}
                        slotProps={{ popper: { sx: { zIndex: 1600, '& .MuiPaper-root': { borderRadius: 0 } } } }}
                        renderOption={(props, option) => (
                          <li {...props}>
                            <div className="flex items-center gap-3 w-full py-1">
                              <ShipImage ship={option} className="w-12 h-12" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{option.name}</div>
                                <div className="text-xs text-gray-500">
                                  {(option.msrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                                </div>
                              </div>
                            </div>
                          </li>
                        )}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            id="auto-target-ship"
                            placeholder={intl.formatMessage({ id: 'pathBuilder.selectTargetShip', defaultMessage: 'Select target ship' })}
                            size="small"
                            sx={{ mt: 1 }}
                          />
                        )}
                      />

                      <div className="mt-3 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#121212] p-3">
                        {targetShip ? (
                          <div className="flex items-center gap-3">
                            <ShipImage ship={targetShip} className="w-16 h-12" />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{targetShip.name}</div>
                              <div className="text-xs text-gray-500">{targetShip.manufacturer.name}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">
                            <FormattedMessage id="pathBuilder.selectTargetShip" defaultMessage="Select target ship" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="border border-gray-200 dark:border-gray-800 p-3 flex flex-col gap-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-3">
                      <div className="flex flex-col gap-2">
                        <label htmlFor="auto-range-start" className="text-sm font-medium">
                          <FormattedMessage id="pathBuilder.rangeStart" defaultMessage="Start Date" />
                        </label>
                        <input
                          id="auto-range-start"
                          type="date"
                          value={rangeStartDate}
                          onChange={(e) => setRangeStartDate(e.target.value)}
                          className="border border-gray-300 px-3 py-2 bg-white dark:bg-[#121212]"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label htmlFor="auto-range-end" className="text-sm font-medium">
                          <FormattedMessage id="pathBuilder.rangeEnd" defaultMessage="End Date" />
                        </label>
                        <input
                          id="auto-range-end"
                          type="date"
                          value={rangeEndDate}
                          onChange={(e) => setRangeEndDate(e.target.value)}
                          className="border border-gray-300 px-3 py-2 bg-white dark:bg-[#121212]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border border-gray-200 dark:border-gray-800 p-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeWarbond}
                        onChange={(e) => setIncludeWarbond(e.target.checked)}
                      />
                      <span className="text-sm">
                        <FormattedMessage
                          id="pathBuilder.option.warbond"
                          defaultMessage="Use Warbond CCUs sold in this period"
                        />
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includePriceIncrease}
                        onChange={(e) => setIncludePriceIncrease(e.target.checked)}
                      />
                      <span className="text-sm">
                        <FormattedMessage
                          id="pathBuilder.option.priceIncrease"
                          defaultMessage="Use price-increase CCUs (historical standard SKU price lower than current SKU price)"
                        />
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ignoreTargetAvailability}
                        onChange={(e) => setIgnoreTargetAvailability(e.target.checked)}
                      />
                      <span className="text-sm">
                        <FormattedMessage
                          id="pathBuilder.option.ignoreTargetAvailability"
                          defaultMessage="Ignore target ship availability (recommended)"
                        />
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferHangarCcu}
                        onChange={(e) => setPreferHangarCcu(e.target.checked)}
                      />
                      <span className="text-sm">
                        <FormattedMessage
                          id="pathBuilder.option.preferHangar"
                          defaultMessage="Prefer hangar CCUs when possible"
                        />
                      </span>
                    </label>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-800 p-3">
                    <div className="text-sm font-medium">
                      <FormattedMessage
                        id="pathBuilder.requiredHangarTitle"
                        defaultMessage="Required hangar CCUs"
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1 mb-2">
                      <FormattedMessage
                        id="pathBuilder.requiredHangarHint"
                        defaultMessage="These hangar CCUs must appear in the generated route."
                      />
                    </div>
                    <Autocomplete
                      multiple
                      options={requiredHangarOptions}
                      value={selectedRequiredHangarOptions}
                      onChange={(_, values) => {
                        const nextKeys = Array.from(new Set(values.map(item => item.key)));
                        setRequiredHangarCcuKeys(nextKeys);
                      }}
                      getOptionLabel={(option) => option.label}
                      isOptionEqualToValue={(option, value) => option.key === value.key}
                      noOptionsText={intl.formatMessage({ id: 'pathBuilder.noHangarCcu', defaultMessage: 'No hangar CCUs available' })}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          placeholder={intl.formatMessage({ id: 'pathBuilder.selectRequiredHangar', defaultMessage: 'Select required hangar CCUs' })}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 p-4 flex justify-end gap-2">
              <Button onClick={onClose} variant="outlined" disabled={isCalculating}>
                <FormattedMessage id="pathBuilder.cancel" defaultMessage="Cancel" />
              </Button>
              <Button onClick={handleGenerateForReview} variant="contained" color="primary" disabled={isCalculating}>
                {isCalculating ? (
                  <span className="flex items-center gap-2">
                    <CircularProgress size={16} color="inherit" />
                    {intl.formatMessage({ id: 'pathBuilder.calculating', defaultMessage: 'Calculating...' })}
                  </span>
                ) : (
                  <FormattedMessage id="pathBuilder.createPath" defaultMessage="Create path" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col gap-4">
              {isCalculating && (
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 p-2">
                  <CircularProgress size={16} />
                  <FormattedMessage
                    id="pathBuilder.recalculating"
                    defaultMessage="Recalculating route..."
                  />
                </div>
              )}

              <div className="text-sm text-gray-500">
                <FormattedMessage
                  id="pathBuilder.reviewHint"
                  defaultMessage="Review the generated route before adding it to the canvas. Excluding one CCU will automatically recalculate a new route."
                />
              </div>

              {reviewStartShip && reviewTargetShip && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#121212] p-3">
                    <div className="text-xs text-gray-500 mb-2">
                      <FormattedMessage id="pathBuilder.startShip" defaultMessage="Starting Ship" />
                    </div>
                    <div className="flex items-center gap-3">
                      <ShipImage ship={reviewStartShip} className="w-[72px] h-12" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{reviewStartShip.name}</div>
                        <div className="text-xs text-gray-500">{formatUsd(reviewStartShip.msrp / 100)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#121212] p-3">
                    <div className="text-xs text-gray-500 mb-2">
                      <FormattedMessage id="pathBuilder.targetShip" defaultMessage="Target Ship" />
                    </div>
                    <div className="flex items-center gap-3">
                      <ShipImage ship={reviewTargetShip} className="w-[72px] h-12" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{reviewTargetShip.name}</div>
                        <div className="text-xs text-gray-500">{formatUsd(reviewTargetShip.msrp / 100)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] grid-rows-[minmax(0,2fr)_minmax(0,1fr)] xl:grid-rows-1 gap-4">
                <div className="flex flex-col gap-3 border border-gray-200 p-3 min-h-0 overflow-hidden">
                  {reviewRoute ? (
                    <>
                      <div className="text-sm font-medium">
                        <FormattedMessage
                          id="pathBuilder.reviewSummary"
                          defaultMessage="Current route: {steps, number} steps, total {cost}"
                          values={{
                            steps: reviewRoute.edges.length,
                            cost: formatUsd(reviewRoute.totalCost)
                          }}
                        />
                      </div>
                      <div className="text-xs text-gray-500">
                        <FormattedMessage
                          id="pathBuilder.reviewSavings"
                          defaultMessage="Direct upgrade cost {directCost}. Current route saves {savings}."
                          values={{
                            directCost: formatUsd(directUpgradeCost),
                            savings: formatUsd(Math.max(0, directUpgradeCost - reviewRoute.totalCost))
                          }}
                        />
                      </div>

                      <div className="min-h-0 overflow-auto pr-1 flex flex-col gap-2">
                        {reviewRoute.edges.map((item, index) => (
                          <div key={`${item.edge.id}-${index}`} className="border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-[#121212]">
                            <div className="grid grid-cols-1 xl:grid-cols-[300px_250px_minmax(0,1fr)] gap-4 xl:gap-5">
                              <UpgradePreview fromShip={item.sourceShip} toShip={item.targetShip} className="w-full h-[150px] xl:w-[300px] xl:h-[150px] shrink-0" />
                              <div className="min-w-0 flex flex-col gap-2">
                                <div className="text-sm font-semibold">
                                  {index + 1}. {item.sourceShip.name} -&gt; {item.targetShip.name}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-xs px-2 py-[2px] ${getCcuTypeStyle(item.sourceType)}`}>
                                    {getCcuTypeLabel(item.sourceType)}
                                  </span>
                                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 px-2 py-[2px]">
                                    {formatUsd(item.cost)}
                                  </span>
                                </div>

                                {!!item.validityWindows?.length && (
                                  <div className="pt-1">
                                    <div className="text-xs text-gray-500 mb-1">
                                      <FormattedMessage
                                        id="pathBuilder.skuValidityTitle"
                                        defaultMessage="SKU validity"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      {item.validityWindows.map((window, windowIndex) => (
                                        <div key={`${item.key}-${window.sku}-${window.startTs}-${windowIndex}`} className="flex flex-col items-start gap-2 text-xs text-gray-600 dark:text-gray-300 3xl:flex-row 3xl:items-center 3xl:justify-between">
                                          <span>
                                            {intl.formatMessage(
                                              { id: 'pathBuilder.validityRange', defaultMessage: '{sku}: {start} - {end}' },
                                              {
                                                sku: window.sku,
                                                start: formatDate(window.startTs),
                                                end: window.endTs === null
                                                  ? intl.formatMessage({ id: 'pathBuilder.validityUntilNow', defaultMessage: 'Now' })
                                                  : formatDate(window.endTs)
                                              }
                                            )}
                                          </span>
                                          <Button
                                            size="small"
                                            variant="text"
                                            color="warning"
                                            className="!px-1.5 !min-w-0 whitespace-nowrap"
                                            disabled={isCalculating || excludedSkuIdSet.has(window.sku)}
                                            onClick={() => handleExcludeSku(window.sku)}
                                          >
                                            {excludedSkuIdSet.has(window.sku)
                                              ? intl.formatMessage({ id: 'pathBuilder.excludedSku', defaultMessage: 'Excluded' })
                                              : intl.formatMessage({ id: 'pathBuilder.excludeSku', defaultMessage: 'Exclude SKU' })}
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="warning"
                                    disabled={isCalculating}
                                    onClick={() => handleExcludeCcu(item)}
                                  >
                                    <FormattedMessage
                                      id="pathBuilder.excludeCcu"
                                      defaultMessage="Do not use this CCU"
                                    />
                                  </Button>
                                </div>
                              </div>

                              <div className="min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#0f1117] p-3 flex-1">
                                <div className="text-xs text-gray-500 mb-2">
                                  <FormattedMessage
                                    id="pathBuilder.stepPriceHistoryTitle"
                                    defaultMessage="{ship} price history"
                                    values={{ ship: item.targetShip.name }}
                                  />
                                </div>

                                {priceHistoryMap[item.targetShip.id]?.history?.length ? (
                                  <div className="h-[340px]">
                                    <PriceHistoryChart
                                      history={priceHistoryMap[item.targetShip.id]?.history || null}
                                      currentMsrp={item.targetShip.msrp}
                                      shipName={item.targetShip.name}
                                      showTitle={false}
                                      legendAlign="start"
                                      legendPosition="left"
                                      showSkuMetaInTooltip
                                      className="h-full"
                                      panelClassName="h-full flex flex-col bg-transparent pb-3 pl-3 pr-2"
                                    />
                                  </div>
                                ) : (
                                  <div className="h-[220px] border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-500 flex items-center justify-center">
                                    <FormattedMessage
                                      id="pathBuilder.stepPriceHistoryEmpty"
                                      defaultMessage="No price history data."
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="border border-amber-300 bg-amber-50 text-amber-900 p-3 text-sm">
                      <FormattedMessage
                        id="pathBuilder.noRouteAfterExclusion"
                        defaultMessage="No route is available with the current excluded CCUs. Re-enable one or more CCUs to continue."
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 border border-gray-200 p-3 min-h-0 overflow-hidden">
                  <div className="text-sm font-medium">
                    <FormattedMessage
                      id="pathBuilder.excludedTitle"
                      defaultMessage="Excluded items"
                    />
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto pr-1 flex flex-col gap-3">
                    {excludedSkuIds.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="text-xs text-gray-500">
                          <FormattedMessage
                            id="pathBuilder.excludedSkusTitle"
                            defaultMessage="Excluded SKUs"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {excludedSkuIds.map(skuId => (
                            <Chip
                              key={`excluded-sku-${skuId}`}
                              label={intl.formatMessage({ id: 'pathBuilder.skuChipLabel', defaultMessage: 'SKU {sku}' }, { sku: skuId })}
                              disabled={isCalculating}
                              onDelete={() => handleIncludeSkuAgain(skuId)}
                              variant="outlined"
                              size="small"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {excludedCcus.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="text-xs text-gray-500">
                          <FormattedMessage
                            id="pathBuilder.excludedCcusTitle"
                            defaultMessage="Excluded CCUs"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {excludedCcus.map(item => (
                            <Chip
                              key={item.key}
                              label={item.label}
                              disabled={isCalculating}
                              onDelete={() => handleIncludeCcuAgain(item.key)}
                              variant="outlined"
                              size="small"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {excludedCcus.length === 0 && excludedSkuIds.length === 0 && (
                      <div className="text-xs text-gray-500">
                        <FormattedMessage
                          id="pathBuilder.noExcluded"
                          defaultMessage="No exclusions yet."
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 p-4 flex justify-end gap-2 flex-wrap">
              <Button onClick={onClose} variant="outlined" disabled={isCalculating}>
                <FormattedMessage id="pathBuilder.cancel" defaultMessage="Cancel" />
              </Button>
              <Button onClick={() => setStep('configure')} variant="outlined" disabled={isCalculating}>
                <FormattedMessage id="pathBuilder.backToSettings" defaultMessage="Back to settings" />
              </Button>
              <Button
                onClick={() => {
                  if (!reviewRequest || isCalculating) return;
                  const nextExcludedCcus: ExcludedCcu[] = [];
                  const nextExcludedSkuIds: number[] = [];
                  setExcludedCcus(nextExcludedCcus);
                  setExcludedSkuIds(nextExcludedSkuIds);
                  void calculateRoute(reviewRequest, nextExcludedCcus, nextExcludedSkuIds, requiredHangarCcuKeys);
                }}
                variant="outlined"
                disabled={(excludedCcus.length === 0 && excludedSkuIds.length === 0) || isCalculating}
              >
                <FormattedMessage id="pathBuilder.clearExcluded" defaultMessage="Reset excluded CCUs" />
              </Button>
              <Button
                onClick={handleConfirmRoute}
                variant="contained"
                color="primary"
                disabled={!reviewRoute || isCalculating}
              >
                <FormattedMessage id="pathBuilder.addToCanvas" defaultMessage="Add to canvas" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
