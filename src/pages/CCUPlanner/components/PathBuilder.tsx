import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Button, Chip, CircularProgress, Autocomplete, TextField, Switch, Slider } from '@mui/material';
import { Close } from '@mui/icons-material';
import { Edge, Node } from 'reactflow';
import { FormattedMessage, useIntl } from 'react-intl';
import { CcuEdgeData, CcuSourceType, CcuValidityWindow, PriceHistoryEntity, Ship } from '../../../types';
import { ChevronsRight } from 'lucide-react';
import { useCcuPlanner } from '../context/useCcuPlanner';
import {
  AutoPathBaseGraphOptions,
  AutoPathBuildRequest,
  AutoPathBuildPerfStats,
  AutoPathReviewEdge,
  AutoPathSessionData,
  PathGraphResult
} from '../services/PathBuilderService';
import PriceHistoryChart from '../../../components/PriceHistoryChart';

interface AutoPathNodeData {
  ship: Ship;
  [key: string]: unknown;
}

export interface ReviewedPathBuildResult {
  nodes: Node<AutoPathNodeData>[];
  edges: Edge<CcuEdgeData>[];
  perfStats?: AutoPathBuildPerfStats;
  mismatchMessage?: string | null;
}

interface PathBuilderProps {
  open: boolean;
  onClose: () => void;
  onCreatePath: (result: ReviewedPathBuildResult) => void;
}

type ReviewPathEdge = AutoPathReviewEdge;

interface ExcludedCcu {
  key: string;
  label: string;
}

interface HangarCcuOption {
  key: string;
  label: string;
}

interface GroupedSkuValidityWindow {
  sku: number;
  windows: CcuValidityWindow[];
}

interface OverlayPricePeriod {
  startTs: number;
  endTs: number | null;
  price: number;
}

interface ReviewRangeBounds {
  minTs: number;
  maxTs: number;
}

interface LtiShipSku {
  skuId: string;
  url: string;
  isWarbond: boolean;
  price?: {
    amount?: number;
    formatted?: string | null;
  } | null;
  stock?: {
    available?: boolean;
  } | null;
}

interface LtiShipEntry {
  shipId: number;
  shipName: string;
  shipTitle?: string;
  skus: LtiShipSku[];
}

interface LtiShipsResponse {
  success: boolean;
  data?: {
    updatedAt?: string;
    ships?: LtiShipEntry[];
  } | null;
}

interface LtiQuickSelectOption {
  key: string;
  displayName: string;
  ship: Ship | null;
  warbondUrl: string;
  warbondPrice: string | null;
}

type PriceHistoryEntry = PriceHistoryEntity['history'][number];

interface BaseGraphPrebuildWorkerRequest {
  type: 'prebuild';
  requestId: number;
  sessionData: AutoPathSessionData;
  options: AutoPathBaseGraphOptions;
}

interface BaseGraphPrebuildWorkerSuccess {
  type: 'success';
  requestId: number;
  key: string;
  graph: PathGraphResult;
}

interface BaseGraphPrebuildWorkerError {
  type: 'error';
  requestId: number;
  error: string;
}

type BaseGraphPrebuildWorkerMessage = BaseGraphPrebuildWorkerSuccess | BaseGraphPrebuildWorkerError;

function normalizeShipName(name: string): string {
  return name.trim().toUpperCase();
}

function buildHangarCcuKey(fromShipName: string, toShipName: string): string {
  return `${normalizeShipName(fromShipName)}->${normalizeShipName(toShipName)}`;
}

function buildRequiredHangarKeySet(keys: string[]): Set<string> {
  return new Set(keys.map(key => key.trim().toUpperCase()));
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
      <div className={`${className} ${placeholderClassName || ''} bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-400`}>
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
        <div className="absolute left-0 top-0 w-[35%] h-full flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700">N/A</div>
      )}

      {toImage ? (
        <img
          src={toImage}
          alt={toShip.name}
          className="absolute right-0 top-0 w-[65%] h-full object-cover shadow-[0_0_20px_0_rgba(0,0,0,0.22)]"
        />
      ) : (
        <div className="absolute right-0 top-0 w-[65%] h-full flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700">N/A</div>
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
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700/70';
    case CcuSourceType.HISTORICAL:
      return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700/70';
    case CcuSourceType.PRICE_INCREASE:
      return 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-700/70';
    case CcuSourceType.AVAILABLE_WB:
    case CcuSourceType.OFFICIAL_WB:
      return 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-700/70';
    case CcuSourceType.THIRD_PARTY:
      return 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-700/70';
    case CcuSourceType.SUBSCRIPTION:
      return 'bg-pink-50 text-pink-700 border border-pink-200 dark:bg-pink-900/30 dark:text-pink-200 dark:border-pink-700/70';
    case CcuSourceType.OFFICIAL:
    default:
      return 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800/50 dark:text-gray-200 dark:border-gray-700';
  }
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatUsdByLocale(value: number, locale: string): string {
  return value.toLocaleString(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDateByLocale(ts: number, locale: string): string {
  return new Date(ts).toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function parseDateRangeToTs(startDate: string, endDate: string): { startTs: number; endTs: number } | null {
  const startTs = new Date(`${startDate}T00:00:00`).getTime();
  const endTs = new Date(`${endDate}T23:59:59`).getTime();

  if (Number.isNaN(startTs) || Number.isNaN(endTs)) {
    return null;
  }

  return { startTs, endTs };
}

function toDayStartTs(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function toDayEndTs(ts: number): number {
  const date = new Date(ts);
  date.setHours(23, 59, 59, 0);
  return date.getTime();
}

function findFirstIndexAtOrAfter(sortedValues: number[], target: number): number {
  if (!sortedValues.length) {
    return 0;
  }

  let left = 0;
  let right = sortedValues.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (sortedValues[middle] < target) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }

  return Math.min(Math.max(left, 0), sortedValues.length - 1);
}

function findLastIndexAtOrBefore(sortedValues: number[], target: number): number {
  if (!sortedValues.length) {
    return 0;
  }

  let left = 0;
  let right = sortedValues.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (sortedValues[middle] <= target) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }

  return Math.min(Math.max(left - 1, 0), sortedValues.length - 1);
}

function groupValidityWindowsBySku(validityWindows?: CcuValidityWindow[]): GroupedSkuValidityWindow[] {
  if (!validityWindows?.length) {
    return [];
  }

  const groupedBySku = new Map<number, CcuValidityWindow[]>();
  validityWindows.forEach(window => {
    if (typeof window.sku !== 'number') {
      return;
    }
    const list = groupedBySku.get(window.sku) || [];
    list.push(window);
    groupedBySku.set(window.sku, list);
  });

  const mergeWindowEnd = (leftEnd: number | null, rightEnd: number | null): number | null => {
    if (leftEnd === null || rightEnd === null) {
      return null;
    }
    return Math.max(leftEnd, rightEnd);
  };

  return Array.from(groupedBySku.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sku, windows]) => {
      const sortedWindows = [...windows].sort((a, b) => a.startTs - b.startTs);
      const mergedWindows: CcuValidityWindow[] = [];

      sortedWindows.forEach(window => {
        const previousWindow = mergedWindows[mergedWindows.length - 1];
        if (!previousWindow) {
          mergedWindows.push({ ...window });
          return;
        }

        const previousEnd = previousWindow.endTs;
        if (previousEnd === null || window.startTs <= previousEnd) {
          previousWindow.endTs = mergeWindowEnd(previousEnd, window.endTs);
          return;
        }

        mergedWindows.push({ ...window });
      });

      return { sku, windows: mergedWindows };
    });
}

function clipValidityWindowsToRange(
  validityWindows: CcuValidityWindow[] | undefined,
  rangeStartTs: number,
  rangeEndTs: number
): CcuValidityWindow[] {
  if (!validityWindows?.length) {
    return [];
  }

  return validityWindows.flatMap(window => {
    if (typeof window.sku !== 'number') {
      return [];
    }

    const rawEndTs = window.endTs ?? Number.POSITIVE_INFINITY;
    if (rawEndTs < rangeStartTs || window.startTs > rangeEndTs) {
      return [];
    }

    const clippedStartTs = Math.max(window.startTs, rangeStartTs);
    const clippedEndTs = Math.min(rawEndTs, rangeEndTs);
    if (!Number.isFinite(clippedEndTs) || clippedEndTs < clippedStartTs) {
      return [];
    }

    return [{
      ...window,
      startTs: clippedStartTs,
      endTs: clippedEndTs
    }];
  });
}

function isWarbondEdition(edition?: string): boolean {
  if (!edition) return false;
  const lowerEdition = edition.toLowerCase();
  return lowerEdition.includes('warbond') || lowerEdition.includes('-wb') || lowerEdition.includes(' wb');
}

function isStandardEdition(edition?: string): boolean {
  if (!edition) return true;
  if (isWarbondEdition(edition)) return false;
  return edition.toLowerCase().includes('standard');
}

function isDiscountPriceEntry(entry: PriceHistoryEntry): boolean {
  if (typeof entry.msrp !== 'number') return false;
  if (typeof entry.baseMsrp === 'number' && entry.msrp < entry.baseMsrp) {
    return true;
  }
  return isWarbondEdition(entry.edition);
}

function isStandardOrNormalPriceEntry(entry: PriceHistoryEntry): boolean {
  if (typeof entry.msrp !== 'number') return false;
  if (isDiscountPriceEntry(entry)) return false;
  if (typeof entry.baseMsrp === 'number') {
    return entry.msrp >= entry.baseMsrp;
  }
  return isStandardEdition(entry.edition);
}

function buildStartShipStandardPricePeriods(history?: PriceHistoryEntity['history'] | null): OverlayPricePeriod[] {
  if (!history?.length) {
    return [];
  }

  const priceByStartTs = new Map<number, number>();
  [...history]
    .sort((a, b) => a.ts - b.ts)
    .forEach(entry => {
      if (entry.change !== '+' || !isStandardOrNormalPriceEntry(entry) || typeof entry.msrp !== 'number') {
        return;
      }

      const existing = priceByStartTs.get(entry.ts);
      if (existing === undefined || entry.msrp > existing) {
        priceByStartTs.set(entry.ts, entry.msrp);
      }
    });

  const sortedPoints = Array.from(priceByStartTs.entries()).sort((a, b) => a[0] - b[0]);
  if (!sortedPoints.length) {
    return [];
  }

  const periods: OverlayPricePeriod[] = [];
  let currentStartTs: number | null = null;
  let currentPriceCents: number | null = null;

  sortedPoints.forEach(([ts, priceCents]) => {
    if (currentPriceCents === null || currentStartTs === null) {
      currentStartTs = ts;
      currentPriceCents = priceCents;
      return;
    }

    const nextPriceCents = Math.max(currentPriceCents, priceCents);
    if (nextPriceCents === currentPriceCents) {
      return;
    }

    periods.push({
      startTs: currentStartTs,
      endTs: ts,
      price: currentPriceCents / 100
    });

    currentStartTs = ts;
    currentPriceCents = nextPriceCents;
  });

  if (currentPriceCents !== null && currentStartTs !== null) {
    periods.push({
      startTs: currentStartTs,
      endTs: null,
      price: currentPriceCents / 100
    });
  }

  return periods;
}

export default function PathBuilder({ open, onClose, onCreatePath }: PathBuilderProps) {
  const intl = useIntl();
  const isDevMode = import.meta.env.DEV;
  const ltiShipsEndpoint = `${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/lti-ships`;
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
  const [hoveredSkuContext, setHoveredSkuContext] = useState<{ stepKey: string; sku: number } | null>(null);
  const [requiredHangarCcuKeys, setRequiredHangarCcuKeys] = useState<string[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [useWasmPathBuilder, setUseWasmPathBuilder] = useState(() => {
    const stored = localStorage.getItem('useWasmPathBuilder');
    return stored === null ? true : stored === 'true';
  });
  const [comparePathBuilderPerf, setComparePathBuilderPerf] = useState(() => {
    if (!import.meta.env.DEV) return false;
    return localStorage.getItem('comparePathBuilderPerf') === 'true';
  });
  const [buildStepPerfStats, setBuildStepPerfStats] = useState<AutoPathBuildPerfStats | null>(null);
  const [buildStepMismatchMessage, setBuildStepMismatchMessage] = useState<string | null>(null);
  const [reviewRoute, setReviewRoute] = useState<{ nodeIds: string[]; edges: ReviewPathEdge[]; totalCost: number } | null>(null);
  const [reviewStepPerfStats, setReviewStepPerfStats] = useState<AutoPathBuildPerfStats | null>(null);
  const [reviewStepMismatchMessage, setReviewStepMismatchMessage] = useState<string | null>(null);
  const [ltiQuickOptions, setLtiQuickOptions] = useState<LtiQuickSelectOption[]>([]);
  const [ltiUpdatedAt, setLtiUpdatedAt] = useState<string | null>(null);
  const [isLtiLoading, setIsLtiLoading] = useState(false);
  const [ltiLoadError, setLtiLoadError] = useState(false);
  const [reviewRangeBounds, setReviewRangeBounds] = useState<ReviewRangeBounds | null>(null);
  const [reviewRangeDraftIndices, setReviewRangeDraftIndices] = useState<[number, number] | null>(null);
  const calculateTaskRef = useRef(0);
  const baseGraphPrebuildWorkerRef = useRef<Worker | null>(null);
  const baseGraphPrebuildTaskRef = useRef(0);

  const terminateBaseGraphPrebuildWorker = useCallback(() => {
    if (!baseGraphPrebuildWorkerRef.current) {
      return;
    }
    baseGraphPrebuildWorkerRef.current.terminate();
    baseGraphPrebuildWorkerRef.current = null;
  }, []);

  const selectableShips = useMemo(
    () => ships.filter(ship => ship.msrp > 1500 && ship.msrp < 100000).sort((a, b) => a.msrp - b.msrp),
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

  const ltiUpdatedAtLabel = useMemo(() => {
    if (!ltiUpdatedAt) {
      return null;
    }

    const ts = Date.parse(ltiUpdatedAt);
    if (Number.isNaN(ts)) {
      return ltiUpdatedAt;
    }

    return new Date(ts).toLocaleString(intl.locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [intl.locale, ltiUpdatedAt]);

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

  const excludedSkuIdSet = useMemo(
    () => new Set(excludedSkuIds),
    [excludedSkuIds]
  );

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

  const earliestHistoryStartTs = useMemo(() => {
    let minTs = Number.POSITIVE_INFINITY;

    Object.values(priceHistoryMap).forEach(entity => {
      const history = entity?.history || [];
      history.forEach(entry => {
        if (typeof entry.ts !== 'number' || !Number.isFinite(entry.ts)) {
          return;
        }
        minTs = Math.min(minTs, entry.ts);
      });
    });

    return Number.isFinite(minTs) ? toDayStartTs(minTs) : null;
  }, [priceHistoryMap]);

  const reviewTimelineDayTs = useMemo(() => {
    if (!reviewRequest) {
      return [];
    }

    const relatedShipIds = new Set<number>([reviewRequest.startShipId, reviewRequest.targetShipId]);
    reviewRoute?.edges.forEach(item => {
      relatedShipIds.add(item.sourceShip.id);
      relatedShipIds.add(item.targetShip.id);
    });

    let minTs = Number.POSITIVE_INFINITY;
    let maxTs = Number.NEGATIVE_INFINITY;

    relatedShipIds.forEach(shipId => {
      const history = priceHistoryMap[shipId]?.history;
      history?.forEach(entry => {
        if (typeof entry.ts !== 'number' || !Number.isFinite(entry.ts)) {
          return;
        }
        minTs = Math.min(minTs, entry.ts);
        maxTs = Math.max(maxTs, entry.ts);
      });
    });

    if (!Number.isFinite(minTs) || !Number.isFinite(maxTs)) {
      minTs = reviewRequest.rangeStartTs;
      maxTs = reviewRequest.rangeEndTs;
    }

    const boundedMinTs = reviewRangeBounds
      ? reviewRangeBounds.minTs
      : Math.min(minTs, reviewRequest.rangeStartTs);
    const boundedMaxTs = reviewRangeBounds
      ? reviewRangeBounds.maxTs
      : Math.max(maxTs, reviewRequest.rangeEndTs);
    const minDayTs = toDayStartTs(boundedMinTs);
    const maxDayTs = toDayStartTs(boundedMaxTs);

    const dayTs: number[] = [];
    const cursor = new Date(minDayTs);
    for (let guard = 0; guard < 10000 && cursor.getTime() <= maxDayTs; guard += 1) {
      dayTs.push(cursor.getTime());
      cursor.setDate(cursor.getDate() + 1);
    }

    if (!dayTs.length) {
      dayTs.push(minDayTs);
      if (maxDayTs !== minDayTs) {
        dayTs.push(maxDayTs);
      }
    }

    return dayTs;
  }, [priceHistoryMap, reviewRangeBounds, reviewRequest, reviewRoute]);

  useEffect(() => {
    if (!reviewRequest || !reviewTimelineDayTs.length) {
      setReviewRangeDraftIndices(null);
      return;
    }

    const startIndex = findFirstIndexAtOrAfter(reviewTimelineDayTs, reviewRequest.rangeStartTs);
    const endIndex = findLastIndexAtOrBefore(reviewTimelineDayTs, reviewRequest.rangeEndTs);
    const safeStartIndex = Math.max(0, Math.min(startIndex, reviewTimelineDayTs.length - 1));
    const safeEndIndex = Math.max(safeStartIndex, Math.min(endIndex, reviewTimelineDayTs.length - 1));

    setReviewRangeDraftIndices(previous => {
      if (previous && previous[0] === safeStartIndex && previous[1] === safeEndIndex) {
        return previous;
      }
      return [safeStartIndex, safeEndIndex];
    });
  }, [reviewRequest, reviewTimelineDayTs]);

  const sourceShipOverlaySeriesByShipId = useMemo(() => {
    const overlayMap = new Map<number, Array<{
      label: string;
      periods: OverlayPricePeriod[];
      color: string;
      borderDash: number[];
    }>>();

    if (!reviewRoute) {
      return overlayMap;
    }

    reviewRoute.edges.forEach(item => {
      const sourceShipId = item.sourceShip.id;
      if (overlayMap.has(sourceShipId)) {
        return;
      }

      const periods = buildStartShipStandardPricePeriods(priceHistoryMap[sourceShipId]?.history || null);
      if (!periods.length) {
        return;
      }

      overlayMap.set(sourceShipId, [{
        label: intl.formatMessage(
          {
            id: 'pathBuilder.startShipStandardPriceOverlay',
            defaultMessage: '{ship} standard price'
          },
          { ship: item.sourceShip.name }
        ),
        periods,
        color: 'rgb(71, 85, 105)',
        borderDash: [6, 4]
      }]);
    });

    return overlayMap;
  }, [intl, priceHistoryMap, reviewRoute]);

  useEffect(() => {
    if (!open) {
      calculateTaskRef.current = Date.now() + Math.random();
      baseGraphPrebuildTaskRef.current = Date.now() + Math.random();
      terminateBaseGraphPrebuildWorker();
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
    setHoveredSkuContext(null);
    setRequiredHangarCcuKeys([]);
    setIsCalculating(false);
    setBuildStepPerfStats(null);
    setBuildStepMismatchMessage(null);
    setReviewRoute(null);
    setReviewStepPerfStats(null);
    setReviewStepMismatchMessage(null);
    setReviewRangeBounds(null);
    setReviewRangeDraftIndices(null);
  }, [open, terminateBaseGraphPrebuildWorker]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const serviceData = getServiceData();
    void pathBuilderService.initializeAutoPathSession({
      ships,
      ...serviceData
    }).catch(error => {
      console.warn('[PathBuilder] failed to initialize auto-path session', error);
    });
  }, [open, ships, getServiceData, pathBuilderService]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const abortController = new AbortController();

    const loadLtiShips = async () => {
      setIsLtiLoading(true);
      setLtiLoadError(false);
      setLtiQuickOptions([]);
      setLtiUpdatedAt(null);

      try {
        const response = await fetch(ltiShipsEndpoint, {
          method: 'GET',
          signal: abortController.signal
        });
        if (!response.ok) {
          throw new Error(`LTI ships request failed: ${response.status}`);
        }

        const payload = await response.json() as LtiShipsResponse;
        if (!payload.success) {
          throw new Error('LTI ships response indicated failure');
        }

        const ltiShips = payload.data?.ships || [];
        const optionMap = new Map<string, LtiQuickSelectOption>();

        ltiShips.forEach(entry => {
          const warbondSku = entry.skus.find(
            sku => sku.isWarbond && Boolean(sku.url) && (sku.stock?.available ?? true)
          );
          if (!warbondSku) {
            return;
          }

          const displayName = entry.shipName || entry.shipTitle || `Ship ${entry.shipId}`;
          const normalizedName = normalizeShipName(displayName);
          const matchedShip = selectableShips.find(ship => ship.id === entry.shipId)
            ?? selectableShips.find(ship => normalizeShipName(ship.name) === normalizedName);
          const key = matchedShip ? `ship-${matchedShip.id}` : `external-${normalizedName}`;
          if (optionMap.has(key)) {
            return;
          }

          const warbondPrice = warbondSku.price?.formatted
            || (typeof warbondSku.price?.amount === 'number'
              ? formatUsdByLocale(warbondSku.price.amount / 100, intl.locale)
              : null);

          optionMap.set(key, {
            key,
            displayName: matchedShip?.name || displayName,
            ship: matchedShip || null,
            warbondUrl: warbondSku.url,
            warbondPrice
          });
        });

        const options = Array.from(optionMap.values()).sort((a, b) => {
          if (a.ship && b.ship) {
            return a.ship.msrp - b.ship.msrp;
          }
          if (a.ship) {
            return -1;
          }
          if (b.ship) {
            return 1;
          }
          return a.displayName.localeCompare(b.displayName);
        });

        setLtiQuickOptions(options);
        setLtiUpdatedAt(payload.data?.updatedAt || null);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        console.warn('[PathBuilder] failed to load LTI seed ships', error);
        setLtiLoadError(true);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLtiLoading(false);
        }
      }
    };

    void loadLtiShips();

    return () => {
      abortController.abort();
    };
  }, [intl.locale, ltiShipsEndpoint, open, selectableShips]);

  useEffect(() => {
    if (!open) {
      return;
    }

    terminateBaseGraphPrebuildWorker();
    pathBuilderService.clearAutoPathBaseGraphCache();

    const serviceData = getServiceData();
    const sessionData: AutoPathSessionData = {
      ships,
      ...serviceData
    };
    const options: AutoPathBaseGraphOptions = {
      rangeStartTs: 0,
      rangeEndTs: Number.MAX_SAFE_INTEGER,
      includeWarbond: true,
      includePriceIncrease: true,
      preferHangarCcu: true
    };
    const requestId = Date.now() + Math.random();
    baseGraphPrebuildTaskRef.current = requestId;

    const worker = new Worker(new URL('../workers/pathBuilderBaseGraph.worker.ts', import.meta.url), {
      type: 'module'
    });
    baseGraphPrebuildWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<BaseGraphPrebuildWorkerMessage>) => {
      const message = event.data;
      if (message.requestId !== requestId || baseGraphPrebuildTaskRef.current !== requestId) {
        return;
      }

      if (message.type === 'success') {
        const activeSessionData = pathBuilderService.getAutoPathSessionData();
        if (activeSessionData) {
          pathBuilderService.hydrateAutoPathBaseGraphCache({
            key: message.key,
            graph: message.graph,
            data: activeSessionData
          });
        }
      } else {
        console.warn('[PathBuilder] failed to prebuild global base graph in worker', message.error);
      }

      if (baseGraphPrebuildWorkerRef.current === worker) {
        worker.terminate();
        baseGraphPrebuildWorkerRef.current = null;
      }
    };

    worker.onerror = (error) => {
      if (baseGraphPrebuildTaskRef.current !== requestId) {
        return;
      }
      console.warn('[PathBuilder] worker error while prebuilding global base graph', error);
      if (baseGraphPrebuildWorkerRef.current === worker) {
        worker.terminate();
        baseGraphPrebuildWorkerRef.current = null;
      }
    };

    const payload: BaseGraphPrebuildWorkerRequest = {
      type: 'prebuild',
      requestId,
      sessionData,
      options
    };
    worker.postMessage(payload);

    return () => {
      if (baseGraphPrebuildWorkerRef.current === worker) {
        worker.terminate();
        baseGraphPrebuildWorkerRef.current = null;
      }
    };
  }, [open, ships, getServiceData, pathBuilderService, terminateBaseGraphPrebuildWorker]);

  useEffect(() => {
    setHoveredSkuContext(null);
  }, [reviewRoute]);

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
    return formatUsdByLocale(value, intl.locale);
  };

  const formatDate = useCallback((ts: number): string => {
    return formatDateByLocale(ts, intl.locale);
  }, [intl.locale]);

  const reviewPreviewRange = useMemo(() => {
    if (!reviewRequest) {
      return null;
    }

    if (reviewRangeDraftIndices && reviewTimelineDayTs.length > 0) {
      const maxIndex = reviewTimelineDayTs.length - 1;
      const startIndex = Math.max(0, Math.min(reviewRangeDraftIndices[0], maxIndex));
      const endIndex = Math.max(startIndex, Math.min(reviewRangeDraftIndices[1], maxIndex));

      return {
        startTs: toDayStartTs(reviewTimelineDayTs[startIndex]),
        endTs: toDayEndTs(reviewTimelineDayTs[endIndex])
      };
    }

    return {
      startTs: reviewRequest.rangeStartTs,
      endTs: reviewRequest.rangeEndTs
    };
  }, [reviewRangeDraftIndices, reviewRequest, reviewTimelineDayTs]);

  const formatPathBuilderPerfLog = (stats: AutoPathBuildPerfStats | null): string | null => {
    if (!stats) {
      return null;
    }

    const totalSegment = stats.totalElapsedMs !== undefined
      ? ` | Total ${stats.totalElapsedMs.toFixed(2)}ms`
      : '';

    const preprocessSegment = stats.preprocessElapsedMs !== undefined
      ? ` | Pre ${stats.preprocessElapsedMs.toFixed(2)}ms`
      : '';

    if (!comparePathBuilderPerf) {
      const elapsedMs = stats.mode === 'c-wasm' ? stats.cWasmElapsedMs : stats.jsElapsedMs;
      return `${stats.mode === 'c-wasm' ? 'C-WASM' : 'JS'} ${(elapsedMs ?? 0).toFixed(2)}ms${preprocessSegment}${totalSegment}`;
    }

    return `Consistency: ${stats.consistency === 'match' ? 'MATCH' : stats.consistency === 'mismatch' ? 'MISMATCH' : 'UNAVAILABLE'} | JS ${stats.jsElapsedMs?.toFixed(2) || '0.00'}ms | C-WASM ${stats.cWasmElapsedMs?.toFixed(2) || '0.00'}ms${stats.cWasmSpeedupRatio ? ` (${stats.cWasmSpeedupRatio.toFixed(2)}x)` : ''}${preprocessSegment}${totalSegment}`;
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

  const calculateRoute = useCallback(async (
    request: AutoPathBuildRequest,
    nextExcludedCcus: ExcludedCcu[],
    nextExcludedSkuIds: number[],
    nextRequiredHangarCcuKeys: string[],
    options?: { showNoPathAlert?: boolean; moveToReview?: boolean; perfStep?: 'build' | 'review' }
  ) => {
    const taskId = Date.now() + Math.random();
    calculateTaskRef.current = taskId;
    setIsCalculating(true);

    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      const executionOptions = {
        useWasmPathBuilder,
        comparePathBuilderPerf
      };
      const generated = options?.perfStep === 'review'
        ? await pathBuilderService.rebuildAutoPathFromCache({
          startShipId: request.startShipId,
          targetShipId: request.targetShipId,
          rangeStartTs: request.rangeStartTs,
          rangeEndTs: request.rangeEndTs,
          includeWarbond: request.includeWarbond,
          includePriceIncrease: request.includePriceIncrease,
          preferHangarCcu: request.preferHangarCcu,
          excludedCcuKeys: nextExcludedCcus.map(item => item.key),
          excludedSkuIds: nextExcludedSkuIds,
          requiredHangarCcuKeys: nextRequiredHangarCcuKeys,
          executionOptions
        })
        : await pathBuilderService.createAutoPath({
          request: {
            ...request,
            excludedCcuKeys: nextExcludedCcus.map(item => item.key),
            excludedSkuIds: nextExcludedSkuIds,
            requiredHangarCcuKeys: nextRequiredHangarCcuKeys
          },
          executionOptions
        });

      if (calculateTaskRef.current !== taskId) {
        return;
      }

      setReviewRequest(request);
      setGeneratedResult(generated);

      const nextReviewRoute = pathBuilderService.findBestReviewRoute({
        nodes: generated.nodes,
        edges: generated.edges,
        startShipId: request.startShipId,
        targetShipId: request.targetShipId,
        requiredHangarCcuKeys: buildRequiredHangarKeySet(nextRequiredHangarCcuKeys)
      });
      setReviewRoute(nextReviewRoute);

      if (options?.perfStep === 'build') {
        setBuildStepPerfStats(generated.perfStats || null);
        setBuildStepMismatchMessage(generated.mismatchMessage || null);
        setReviewStepPerfStats(null);
        setReviewStepMismatchMessage(null);
      } else if (options?.perfStep === 'review') {
        setReviewStepPerfStats(generated.perfStats || null);
        setReviewStepMismatchMessage(generated.mismatchMessage || null);
      }

      const hasRoute = Boolean(nextReviewRoute);
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
    } catch (error) {
      if (calculateTaskRef.current !== taskId) {
        return;
      }
      console.warn('[PathBuilder][Review] failed to recalculate route', error);
      setGeneratedResult(null);
      setReviewRoute(null);
      if (options?.perfStep === 'review') {
        setReviewStepPerfStats(null);
        setReviewStepMismatchMessage('Review route rebuild failed.');
      }
    } finally {
      if (calculateTaskRef.current === taskId) {
        setIsCalculating(false);
      }
    }
  }, [comparePathBuilderPerf, intl, pathBuilderService, showAlert, useWasmPathBuilder]);

  const applyReviewRangeFromIndices = useCallback((nextRangeIndices: [number, number]) => {
    if (!reviewRequest || isCalculating || !reviewTimelineDayTs.length) {
      return;
    }

    const maxIndex = reviewTimelineDayTs.length - 1;
    const normalizedStartIndex = Math.max(0, Math.min(nextRangeIndices[0], maxIndex));
    const normalizedEndIndex = Math.max(normalizedStartIndex, Math.min(nextRangeIndices[1], maxIndex));

    const nextRangeStartTs = toDayStartTs(reviewTimelineDayTs[normalizedStartIndex]);
    const nextRangeEndTs = toDayEndTs(reviewTimelineDayTs[normalizedEndIndex]);

    if (nextRangeStartTs === reviewRequest.rangeStartTs && nextRangeEndTs === reviewRequest.rangeEndTs) {
      return;
    }

    const nextRequest: AutoPathBuildRequest = {
      ...reviewRequest,
      rangeStartTs: nextRangeStartTs,
      rangeEndTs: nextRangeEndTs
    };

    setReviewRequest(nextRequest);
    void calculateRoute(nextRequest, excludedCcus, excludedSkuIds, requiredHangarCcuKeys, { perfStep: 'review' });
  }, [
    calculateRoute,
    excludedCcus,
    excludedSkuIds,
    isCalculating,
    requiredHangarCcuKeys,
    reviewRequest,
    reviewTimelineDayTs
  ]);

  const handleReviewRangeSliderChange = useCallback((_: unknown, value: number | number[]) => {
    if (!Array.isArray(value)) {
      return;
    }

    const nextStart = Math.floor(value[0] ?? 0);
    const nextEnd = Math.floor(value[1] ?? nextStart);
    setReviewRangeDraftIndices([Math.min(nextStart, nextEnd), Math.max(nextStart, nextEnd)]);
  }, []);

  const formatReviewRangeSliderValueLabel = useCallback((indexValue: number): string => {
    const roundedIndex = Math.max(0, Math.floor(indexValue));
    const ts = reviewTimelineDayTs[roundedIndex];
    if (typeof ts !== 'number') {
      return '';
    }
    return formatDate(ts);
  }, [formatDate, reviewTimelineDayTs]);

  const handleReviewRangeSliderCommit = useCallback((_: unknown, value: number | number[]) => {
    if (!Array.isArray(value)) {
      return;
    }

    const nextStart = Math.floor(value[0] ?? 0);
    const nextEnd = Math.floor(value[1] ?? nextStart);
    const normalizedRange: [number, number] = [Math.min(nextStart, nextEnd), Math.max(nextStart, nextEnd)];
    setReviewRangeDraftIndices(normalizedRange);
    applyReviewRangeFromIndices(normalizedRange);
  }, [applyReviewRangeFromIndices]);

  const handleGenerateForReview = async () => {
    const request = buildRequest();
    if (!request) {
      return;
    }

    setReviewRangeBounds({
      minTs: earliestHistoryStartTs ?? toDayStartTs(request.rangeStartTs),
      maxTs: toDayEndTs(Date.now())
    });

    const nextExcludedCcus: ExcludedCcu[] = [];
    const nextExcludedSkuIds: number[] = [];
    setExcludedCcus(nextExcludedCcus);
    setExcludedSkuIds(nextExcludedSkuIds);
    await calculateRoute(request, nextExcludedCcus, nextExcludedSkuIds, requiredHangarCcuKeys, {
      showNoPathAlert: true,
      moveToReview: true,
      perfStep: 'build'
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
    void calculateRoute(reviewRequest, nextExcludedCcus, excludedSkuIds, requiredHangarCcuKeys, { perfStep: 'review' });
  };

  const handleIncludeCcuAgain = (key: string) => {
    if (!reviewRequest || isCalculating) {
      return;
    }

    const nextExcludedCcus = excludedCcus.filter(item => item.key !== key);
    setExcludedCcus(nextExcludedCcus);
    void calculateRoute(reviewRequest, nextExcludedCcus, excludedSkuIds, requiredHangarCcuKeys, { perfStep: 'review' });
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
    void calculateRoute(reviewRequest, excludedCcus, nextExcludedSkuIds, requiredHangarCcuKeys, { perfStep: 'review' });
  };

  const handleIncludeSkuAgain = (skuId: number) => {
    if (!reviewRequest || isCalculating) {
      return;
    }

    const nextExcludedSkuIds = excludedSkuIds.filter(id => id !== skuId);
    setExcludedSkuIds(nextExcludedSkuIds);
    void calculateRoute(reviewRequest, excludedCcus, nextExcludedSkuIds, requiredHangarCcuKeys, { perfStep: 'review' });
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
        paper: {
          sx: { borderRadius: 0 },
          className: 'dark:bg-[#0b0f14] dark:text-gray-100'
        }
      }}
    >
      <DialogTitle className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 dark:bg-gray-900/80">
        <div className="flex items-center gap-2">
          <FormattedMessage id="pathBuilder.title" defaultMessage="Path Builder" />
        </div>
        <IconButton onClick={onClose} size="small" aria-label={intl.formatMessage({ id: 'pathBuilder.close', defaultMessage: 'Close' })}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent
        className="p-0 h-full flex flex-col dark:bg-[#0b0f14] dark:text-gray-100"
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
                  <div className="text-sm text-gray-500 dark:text-gray-300">
                    <FormattedMessage
                      id="pathBuilder.autoHint"
                      defaultMessage="Automatically generate a CCU path graph from your starting ship to your target ship using historical opportunities in the selected time range."
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3">
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
                        slotProps={{
                          listbox: {
                            style: { maxHeight: 320 }
                          },
                          popper: { sx: { zIndex: 1600, '& .MuiPaper-root': { borderRadius: 0 } } }
                        }}
                        renderOption={(props, option, state) => (
                          <li {...props} key={state.index}>
                            <div className="flex items-center gap-3 w-full py-1">
                              <ShipImage ship={option} className="w-12 h-12" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{option.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
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

                      <div className="mt-3 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/70 p-3">
                        {startShip ? (
                          <div className="flex items-center gap-3">
                            <ShipImage ship={startShip} className="w-16 h-12" />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{startShip.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{startShip.manufacturer.name}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            <FormattedMessage id="pathBuilder.selectStartShip" defaultMessage="Select starting ship" />
                          </div>
                        )}
                      </div>

                      <div className="mt-3 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/70 p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                            <FormattedMessage id="pathBuilder.ltiQuickSelect" defaultMessage="LTI Seed Ships (Quick Select)" />
                          </div>
                          {ltiUpdatedAtLabel && (
                            <div className="text-[11px] text-gray-500 dark:text-gray-400">
                              <FormattedMessage
                                id="pathBuilder.ltiUpdatedAt"
                                defaultMessage="Updated: {time}"
                                values={{ time: ltiUpdatedAtLabel }}
                              />
                            </div>
                          )}
                        </div>

                        {isLtiLoading ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <CircularProgress size={14} />
                            <FormattedMessage id="pathBuilder.ltiLoading" defaultMessage="Loading available LTI seed ships..." />
                          </div>
                        ) : ltiLoadError ? (
                          <div className="text-xs text-red-500">
                            <FormattedMessage id="pathBuilder.ltiLoadError" defaultMessage="Failed to load LTI seed ships." />
                          </div>
                        ) : ltiQuickOptions.length === 0 ? (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            <FormattedMessage id="pathBuilder.ltiEmpty" defaultMessage="No available LTI seed ships right now." />
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {ltiQuickOptions.map(option => (
                              <div
                                key={option.key}
                                role="button"
                                tabIndex={option.ship ? 0 : -1}
                                aria-disabled={!option.ship}
                                onClick={() => option.ship && setStartShipId(option.ship.id)}
                                onKeyDown={(event) => {
                                  if (!option.ship) {
                                    return;
                                  }
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setStartShipId(option.ship.id);
                                  }
                                }}
                                className={`flex items-center justify-between gap-3 border px-3 py-2 transition-colors ${option.ship?.id === startShipId
                                  ? 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30'
                                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
                                  } ${option.ship
                                    ? 'cursor-pointer hover:border-blue-300 dark:hover:border-blue-600'
                                    : 'cursor-default opacity-80'}`}
                              >
                                <div className="min-w-0 flex items-center gap-3">
                                  <ShipImage
                                    ship={option.ship}
                                    className="w-16 h-12 shrink-0"
                                    placeholderClassName="border border-gray-200 dark:border-gray-700"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold truncate">{option.displayName}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                      {option.ship ? (
                                        option.ship.manufacturer.name
                                      ) : (
                                        <FormattedMessage
                                          id="pathBuilder.ltiNotInList"
                                          defaultMessage="Not in selectable ship list"
                                        />
                                      )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-xs">
                                      {option.warbondPrice && (
                                        <span className="text-gray-600 dark:text-gray-300">{option.warbondPrice}</span>
                                      )}
                                      <span className="font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                                        LTI
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <Button
                                  size="small"
                                  variant="text"
                                  color="warning"
                                  component="a"
                                  href={option.warbondUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <FormattedMessage id="pathBuilder.openWarbond" defaultMessage="Open RSI Pledge Store" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3">
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
                        slotProps={{
                          listbox: { style: { maxHeight: 320 } },
                          popper: { sx: { zIndex: 1600, '& .MuiPaper-root': { borderRadius: 0 } } }
                        }}
                        renderOption={(props, option, state) => (
                          <li {...props} key={state.index}>
                            <div className="flex items-center gap-3 w-full py-1">
                              <ShipImage ship={option} className="w-12 h-12" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{option.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
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

                      <div className="mt-3 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/70 p-3">
                        {targetShip ? (
                          <div className="flex items-center gap-3">
                            <ShipImage ship={targetShip} className="w-16 h-12" />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{targetShip.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{targetShip.manufacturer.name}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            <FormattedMessage id="pathBuilder.selectTargetShip" defaultMessage="Select target ship" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3 flex flex-col gap-3">
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
                          className="border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-950/80 text-gray-900 dark:text-gray-100"
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
                          className="border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-950/80 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeWarbond}
                        onChange={(e) => setIncludeWarbond(e.target.checked)}
                      />
                      <span className="text-sm dark:text-gray-200">
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
                      <span className="text-sm dark:text-gray-200">
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
                      <span className="text-sm dark:text-gray-200">
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
                      <span className="text-sm dark:text-gray-200">
                        <FormattedMessage
                          id="pathBuilder.option.preferHangar"
                          defaultMessage="Prefer hangar CCUs when possible"
                        />
                      </span>
                    </label>

                    {isDevMode && (
                      <div className="pt-2 mt-1 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between gap-2">
                          <label htmlFor="useWasmPathBuilder" className="text-sm text-gray-600 dark:text-gray-400">
                            <FormattedMessage id="pathBuilder.useWasmPathBuilder" defaultMessage="Use WASM Path Builder" />
                          </label>
                          <Switch
                            id="useWasmPathBuilder"
                            checked={useWasmPathBuilder}
                            onChange={(e) => {
                              setUseWasmPathBuilder(e.target.checked);
                              localStorage.setItem('useWasmPathBuilder', e.target.checked.toString());
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <label htmlFor="comparePathBuilderPerf" className="text-sm text-gray-600 dark:text-gray-400">
                            <FormattedMessage id="pathBuilder.comparePathBuilderPerf" defaultMessage="Compare JS + C-WASM (Dev)" />
                          </label>
                          <Switch
                            id="comparePathBuilderPerf"
                            checked={comparePathBuilderPerf}
                            onChange={(e) => {
                              setComparePathBuilderPerf(e.target.checked);
                              localStorage.setItem('comparePathBuilderPerf', e.target.checked.toString());
                            }}
                          />
                        </div>

                        {buildStepPerfStats && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Step 1 (Build): {formatPathBuilderPerfLog(buildStepPerfStats)}
                          </div>
                        )}

                        {reviewStepPerfStats && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Step 2 (Review): {formatPathBuilderPerfLog(reviewStepPerfStats)}
                          </div>
                        )}

                        {buildStepMismatchMessage && (
                          <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Step 1 (Build): {buildStepMismatchMessage}
                          </div>
                        )}

                        {reviewStepMismatchMessage && (
                          <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Step 2 (Review): {reviewStepMismatchMessage}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3">
                    <div className="text-sm font-medium">
                      <FormattedMessage id="pathBuilder.requiredHangarTitle" defaultMessage="Required hangar CCUs" />
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2">
                      <FormattedMessage id="pathBuilder.requiredHangarHint" defaultMessage="These hangar CCUs must appear in the generated route." />
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

            <div className="border-t border-gray-200 dark:border-gray-700 dark:bg-gray-900/80 p-4 flex justify-end gap-2">
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
              {/* {isCalculating && (
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 p-2">
                  <CircularProgress size={16} />
                  <FormattedMessage
                    id="pathBuilder.recalculating"
                    defaultMessage="Recalculating route..."
                  />
                </div>
              )} */}

              <div className="text-sm text-gray-500 dark:text-gray-300">
                <FormattedMessage
                  id="pathBuilder.reviewHint"
                  defaultMessage="Review the generated route before adding it to the canvas. Excluding one CCU will automatically recalculate a new route."
                />
              </div>

              {isDevMode && (buildStepPerfStats || reviewStepPerfStats) && (
                <div className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 p-2">
                  {buildStepPerfStats && (
                    <div>Step 1 (Build): {formatPathBuilderPerfLog(buildStepPerfStats)}</div>
                  )}
                  {reviewStepPerfStats && (
                    <div>Step 2 (Review): {formatPathBuilderPerfLog(reviewStepPerfStats)}</div>
                  )}
                  {buildStepMismatchMessage && (
                    <div className="text-amber-600 dark:text-amber-400">Step 1 (Build): {buildStepMismatchMessage}</div>
                  )}
                  {reviewStepMismatchMessage && (
                    <div className="text-amber-600 dark:text-amber-400">Step 2 (Review): {reviewStepMismatchMessage}</div>
                  )}
                </div>
              )}

              {reviewStartShip && reviewTargetShip && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      <FormattedMessage id="pathBuilder.startShip" defaultMessage="Starting Ship" />
                    </div>
                    <div className="flex items-center gap-3">
                      <ShipImage ship={reviewStartShip} className="w-[72px] h-12" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{reviewStartShip.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{formatUsd(reviewStartShip.msrp / 100)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      <FormattedMessage id="pathBuilder.targetShip" defaultMessage="Target Ship" />
                    </div>
                    <div className="flex items-center gap-3">
                      <ShipImage ship={reviewTargetShip} className="w-[72px] h-12" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{reviewTargetShip.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{formatUsd(reviewTargetShip.msrp / 100)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {reviewRequest && reviewRangeDraftIndices && reviewTimelineDayTs.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 p-3">
                  {reviewTimelineDayTs.length > 1 ? (
                    <div className="pt-1">
                      <div className='px-2'>
                        <Slider
                          value={reviewRangeDraftIndices}
                          min={0}
                          max={reviewTimelineDayTs.length - 1}
                          step={1}
                          disableSwap
                          disabled={isCalculating}
                          onChange={handleReviewRangeSliderChange}
                          onChangeCommitted={handleReviewRangeSliderCommit}
                          valueLabelDisplay="auto"
                          valueLabelFormat={formatReviewRangeSliderValueLabel}
                          sx={{
                            mb: 0.5,
                            '& .MuiSlider-rail': {
                              opacity: 1,
                              backgroundColor: 'rgb(209 213 219)',
                              height: 3
                            },
                            '& .MuiSlider-track': {
                              height: 3
                            },
                            '& .MuiSlider-thumb': {
                              width: 14,
                              height: 14
                            }
                          }}
                        />
                      </div>
                      <div className="px-2 -mt-3">
                        <div className="flex items-end justify-between">
                          {Array.from({ length: 11 }).map((_, tickIndex) => (
                            <span
                              key={`review-ruler-tick-${tickIndex}`}
                              className={`block w-px bg-gray-300 dark:bg-gray-600 ${tickIndex % 5 === 0 ? 'h-3' : 'h-2'}`}
                            />
                          ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                          <span>{formatDate(reviewTimelineDayTs[0])}</span>
                          <span>{formatDate(toDayEndTs(reviewTimelineDayTs[reviewTimelineDayTs.length - 1]))}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-6 border-t border-gray-300 dark:border-gray-700" />
                  )}
                </div>
              )}

              <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] grid-rows-[minmax(0,2fr)_minmax(0,1fr)] xl:grid-rows-1 gap-4">
                <div className="flex flex-col gap-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3 min-h-0 overflow-hidden">
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
                      <div className="text-xs text-gray-500 dark:text-gray-400">
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
                        {reviewRoute.edges.map((item, index) => {
                          const stepKey = `${item.key}-${index}`;
                          const officialUpgradeCost = Math.max(0, (item.targetShip.msrp - item.sourceShip.msrp) / 100);
                          const stepSavedAmount = officialUpgradeCost - item.cost;
                          const stepSavedRatio = officialUpgradeCost > 0
                            ? (stepSavedAmount / officialUpgradeCost) * 100
                            : 0;
                          const clippedValidityWindows = reviewPreviewRange
                            ? clipValidityWindowsToRange(item.validityWindows, reviewPreviewRange.startTs, reviewPreviewRange.endTs)
                            : (item.validityWindows || []);
                          const groupedValidityWindows = groupValidityWindowsBySku(clippedValidityWindows);

                          return (
                            <div key={`${item.edge.id}-${index}`} className="border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-950/70">
                              <div className="grid grid-cols-1 xl:grid-cols-[360px_250px_minmax(0,1fr)] gap-4 xl:gap-5">
                                <div className='flex flex-col gap-4'>
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
                                    {officialUpgradeCost > 0 && (
                                      <span className={`text-xs font-medium px-2 py-[2px] ${stepSavedAmount >= 0 ? 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30' : 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/30'}`}>
                                        {intl.formatMessage({ id: 'pathBuilder.stepSavings', defaultMessage: 'Savings' })}: {`${formatUsd(stepSavedAmount)}`} ({`${stepSavedRatio > 0 ? '-' : ''}${stepSavedRatio.toFixed(2)}%`})
                                      </span>
                                    )}
                                  </div>
                                  <UpgradePreview fromShip={item.sourceShip} toShip={item.targetShip} className="w-full h-[160px] xl:w-[360px] xl:h-[180px] shrink-0" />
                                </div>
                                <div className="min-w-0 flex flex-col gap-2">
                                  {groupedValidityWindows.length > 0 && (
                                    <div className="pt-1">
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        <FormattedMessage
                                          id="pathBuilder.skuValidityTitle"
                                          defaultMessage="SKU validity"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        {groupedValidityWindows.map((skuGroup, groupIndex) => {
                                          const isHovered = hoveredSkuContext?.stepKey === stepKey && hoveredSkuContext.sku === skuGroup.sku;

                                          return (
                                            <div
                                              key={`${item.key}-${skuGroup.sku}-${groupIndex}`}
                                              className={`flex flex-col items-start gap-2 text-xs text-gray-600 dark:text-gray-300 p-1 3xl:flex-row 3xl:items-center 3xl:justify-between ${isHovered ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                                              onMouseEnter={() => setHoveredSkuContext({ stepKey, sku: skuGroup.sku })}
                                              onMouseLeave={() => {
                                                setHoveredSkuContext(prev =>
                                                  prev?.stepKey === stepKey && prev.sku === skuGroup.sku ? null : prev
                                                );
                                              }}
                                            >
                                              <div className="flex flex-col gap-1">
                                                <span className="font-medium text-gray-700 dark:text-gray-200">
                                                  {intl.formatMessage({ id: 'pathBuilder.skuChipLabel', defaultMessage: 'SKU {sku}' }, { sku: skuGroup.sku })}
                                                </span>
                                                {skuGroup.windows.map((window, windowIndex) => (
                                                  <span key={`${item.key}-${skuGroup.sku}-${window.startTs}-${windowIndex}`}>
                                                    {intl.formatMessage(
                                                      { id: 'pathBuilder.validityPeriod', defaultMessage: '{start} - {end}' },
                                                      {
                                                        start: formatDate(window.startTs),
                                                        end: window.endTs === null
                                                          ? intl.formatMessage({ id: 'pathBuilder.validityUntilNow', defaultMessage: 'Now' })
                                                          : formatDate(window.endTs)
                                                      }
                                                    )}
                                                  </span>
                                                ))}
                                              </div>
                                              <Button
                                                size="small"
                                                variant="outlined"
                                                color="error"
                                                className="!px-1.5 !min-w-0 whitespace-nowrap"
                                                disabled={isCalculating || excludedSkuIdSet.has(skuGroup.sku)}
                                                onClick={() => handleExcludeSku(skuGroup.sku)}
                                              >
                                                {excludedSkuIdSet.has(skuGroup.sku)
                                                  ? intl.formatMessage({ id: 'pathBuilder.excludedSku', defaultMessage: 'Excluded' })
                                                  : intl.formatMessage({ id: 'pathBuilder.excludeSku', defaultMessage: 'Exclude SKU' })}
                                              </Button>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  <div className='p-1'>
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

                                <div className="min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/80 p-3 flex-1">
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
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
                                        overlaySeries={sourceShipOverlaySeriesByShipId.get(item.sourceShip.id) || []}
                                        rangeStartTs={reviewPreviewRange?.startTs}
                                        rangeEndTs={reviewPreviewRange?.endTs}
                                        highlightedSkuId={hoveredSkuContext?.stepKey === stepKey ? hoveredSkuContext.sku : null}
                                        showRealTimeScaleToggle={false}
                                        showTitle={false}
                                        legendAlign="start"
                                        legendPosition="left"
                                        showSkuMetaInTooltip
                                        className="h-full"
                                        panelClassName="h-full flex flex-col bg-transparent pb-3 pl-3 pr-2"
                                      />
                                    </div>
                                  ) : (
                                    <div className="h-[220px] border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center">
                                      <FormattedMessage
                                        id="pathBuilder.stepPriceHistoryEmpty"
                                        defaultMessage="No price history data."
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200 p-3 text-sm">
                      <FormattedMessage
                        id="pathBuilder.noRouteAfterExclusion"
                        defaultMessage="No route is available with the current excluded CCUs. Re-enable one or more CCUs to continue."
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3 min-h-0 overflow-hidden">
                  <div className="text-sm font-medium">
                    <FormattedMessage
                      id="pathBuilder.excludedTitle"
                      defaultMessage="Excluded items"
                    />
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto pr-1 flex flex-col gap-3">
                    {excludedSkuIds.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          <FormattedMessage
                            id="pathBuilder.excludedSkusTitle"
                            defaultMessage="Excluded SKUs"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {excludedSkuIds.map((skuId, skuIndex) => (
                            <Chip
                              key={`excluded-sku-${skuId}-${skuIndex}`}
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
                        <div className="text-xs text-gray-500 dark:text-gray-400">
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
                      <div className="text-xs text-gray-500 dark:text-gray-400">
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

            <div className="border-t border-gray-200 dark:border-gray-700 dark:bg-gray-900/80 p-4 flex justify-end gap-2 flex-wrap">
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
                  void calculateRoute(reviewRequest, nextExcludedCcus, nextExcludedSkuIds, requiredHangarCcuKeys, { perfStep: 'review' });
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
