import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Button, Chip, CircularProgress, Autocomplete, TextField, Switch, Slider } from '@mui/material';
import { Close } from '@mui/icons-material';
import { Edge, Node } from 'reactflow';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { Ccu, CcuEdgeData, CcuSourceType, CcuValidityWindow, HangarItem, ListingItem, LowestMarketCcuGroup, LowestMarketCcuResponse, PriceHistoryEntity, Ship } from '../../../types';
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
import { useApi } from '@/hooks/swr/useApi';
import { useCartStore } from '@/hooks/useCartStore';
import { buildMarketResource } from '@/components/marketItemDisplay';

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

export interface ReviewedPathCreateOptions {
  targetMode?: 'append' | 'newTab';
}

interface PathBuilderProps {
  open: boolean;
  onClose: () => void;
  onCreatePath: (result: ReviewedPathBuildResult, options?: ReviewedPathCreateOptions) => void;
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

interface MarketRouteEdge {
  key: string;
  sourceShip: Ship;
  targetShip: Ship;
  sourceType: CcuSourceType;
  cost: number;
  listing?: LowestMarketCcuGroup['listing'];
}

interface MarketRouteScore {
  availableWbCount: number;
  officialCount: number;
  marketCount: number;
  hangarCount: number;
  warbondCost: number;
  totalCost: number;
  stepCount: number;
}

interface MarketRouteResult {
  edges: MarketRouteEdge[];
  totalCost: number;
  officialCount: number;
  marketCount: number;
  hangarCount: number;
}

const MARKET_ROUTE_NODE_GAP_X = 420;
const MARKET_ROUTE_NODE_Y = 120;

interface OverlayPricePeriod {
  startTs: number;
  endTs: number | null;
  price: number;
}

interface ReviewRangeBounds {
  minTs: number;
  maxTs: number;
}

type CreditPoolOption = NonNullable<ListingItem['creditOptions']>[number];

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
      <div className={`${className} ${placeholderClassName || ''} bg-gray-200 dark:bg-neutral-700 flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-400`}>
        N/A
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={ship?.name || 'ship'}
      className={`${className} object-cover border border-gray-200 dark:border-neutral-700`}
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
    <div className={`relative overflow-hidden border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-[#1b1b1b] ${className || 'w-[180px] h-[72px]'}`}>
      {fromImage ? (
        <img
          src={fromImage}
          alt={fromShip.name}
          className="absolute left-0 top-0 w-[35%] h-full object-cover"
        />
      ) : (
        <div className="absolute left-0 top-0 w-[35%] h-full flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-neutral-700">N/A</div>
      )}

      {toImage ? (
        <img
          src={toImage}
          alt={toShip.name}
          className="absolute right-0 top-0 w-[65%] h-full object-cover shadow-[0_0_20px_0_rgba(0,0,0,0.22)]"
        />
      ) : (
        <div className="absolute right-0 top-0 w-[65%] h-full flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-neutral-700">N/A</div>
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
      return 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-neutral-900/50 dark:text-gray-200 dark:border-neutral-700';
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

function hasCurrentOfficialSku(ship: Ship, ccus: Ccu[]): boolean {
  const ccuTarget = ccus.find(entry => entry.id === ship.id);
  return Boolean(ccuTarget?.skus.some(sku => sku.available && sku.price === ship.msrp));
}

function getCurrentWarbondPriceCents(ship: Ship, ccus: Ccu[]): number | null {
  const ccuWarbondPrices = ccus.find(entry => entry.id === ship.id)?.skus
    .filter(sku => sku.available && sku.price < ship.msrp)
    .map(sku => sku.price) || [];

  if (!ccuWarbondPrices.length) {
    return null;
  }

  return Math.min(...ccuWarbondPrices);
}

function compareMarketRouteScore(left: MarketRouteScore, right: MarketRouteScore): number {
  if (left.hangarCount !== right.hangarCount) {
    return right.hangarCount - left.hangarCount;
  }

  if (left.availableWbCount !== right.availableWbCount) {
    return right.availableWbCount - left.availableWbCount;
  }

  if (left.marketCount !== right.marketCount) {
    return right.marketCount - left.marketCount;
  }

  if (left.officialCount !== right.officialCount) {
    return right.officialCount - left.officialCount;
  }

  if (Math.abs(left.warbondCost - right.warbondCost) > 1e-6) {
    return left.warbondCost - right.warbondCost;
  }

  if (Math.abs(left.totalCost - right.totalCost) > 1e-6) {
    return left.totalCost - right.totalCost;
  }

  return left.stepCount - right.stepCount;
}

function mergeSequentialOfficialEdges(edges: MarketRouteEdge[]): MarketRouteEdge[] {
  if (edges.length <= 1) {
    return edges;
  }

  const mergedEdges: MarketRouteEdge[] = [];

  edges.forEach(edge => {
    const previousEdge = mergedEdges[mergedEdges.length - 1];
    if (
      previousEdge &&
      previousEdge.sourceType === CcuSourceType.OFFICIAL &&
      edge.sourceType === CcuSourceType.OFFICIAL
    ) {
      previousEdge.targetShip = edge.targetShip;
      previousEdge.cost += edge.cost;
      previousEdge.key = `official:${previousEdge.sourceShip.id}->${edge.targetShip.id}:merged`;
      return;
    }

    mergedEdges.push({ ...edge });
  });

  return mergedEdges;
}

function summarizeMarketRouteEdges(edges: MarketRouteEdge[]): Omit<MarketRouteResult, 'edges'> {
  return edges.reduce<Omit<MarketRouteResult, 'edges'>>((summary, edge) => {
    summary.totalCost += edge.cost;

    if (edge.sourceType === CcuSourceType.HANGER) {
      summary.hangarCount += 1;
    } else if (edge.sourceType === CcuSourceType.THIRD_PARTY) {
      summary.marketCount += 1;
    } else if (edge.sourceType === CcuSourceType.OFFICIAL) {
      summary.officialCount += 1;
    }

    return summary;
  }, {
    totalCost: 0,
    officialCount: 0,
    marketCount: 0,
    hangarCount: 0,
  });
}

function getRequiredStoreCreditAmount(edges: MarketRouteEdge[]): number {
  const total = edges.reduce((sum, edge) => (
    edge.sourceType === CcuSourceType.OFFICIAL ? sum + edge.cost : sum
  ), 0);

  return Number(total.toFixed(2));
}

function findMatchingCreditPoolOptions(
  creditListing: ListingItem | undefined,
  requiredAmount: number,
): CreditPoolOption[] | null {
  if (requiredAmount <= 0 || creditListing?.itemType !== 'credit' || !creditListing.creditOptions?.length) {
    return null;
  }

  const options = [...creditListing.creditOptions]
    .filter((option) => option.amount > 0 && option.price > 0)
    .sort((left, right) => left.amount - right.amount || left.price - right.price);

  if (!options.length) {
    return null;
  }

  const targetAmount = Math.max(1, Math.ceil(requiredAmount - 1e-6));
  const maxOptionAmount = options[options.length - 1].amount;
  const searchLimit = targetAmount + maxOptionAmount;
  const bestStates = new Map<number, { price: number; count: number; previousTotal: number; optionIndex: number }>();
  bestStates.set(0, { price: 0, count: 0, previousTotal: -1, optionIndex: -1 });

  for (let total = 0; total <= searchLimit; total += 1) {
    const currentState = bestStates.get(total);
    if (!currentState) {
      continue;
    }

    options.forEach((option, optionIndex) => {
      const nextTotal = total + option.amount;
      if (nextTotal > searchLimit) {
        return;
      }

      const nextState = {
        price: Number((currentState.price + option.price).toFixed(2)),
        count: currentState.count + 1,
        previousTotal: total,
        optionIndex,
      };
      const existingState = bestStates.get(nextTotal);
      const shouldReplace = !existingState
        || nextState.price < existingState.price - 1e-6
        || (Math.abs(nextState.price - existingState.price) <= 1e-6 && nextState.count < existingState.count);

      if (shouldReplace) {
        bestStates.set(nextTotal, nextState);
      }
    });
  }

  let bestTotal: number | null = null;
  let bestPrice = Number.POSITIVE_INFINITY;
  let bestCount = Number.POSITIVE_INFINITY;

  for (let total = targetAmount; total <= searchLimit; total += 1) {
    const state = bestStates.get(total);
    if (!state) {
      continue;
    }

    const betterTotal = bestTotal === null || total < bestTotal;
    const equalTotalBetterPrice = bestTotal !== null
      && total === bestTotal
      && (state.price < bestPrice - 1e-6
        || (Math.abs(state.price - bestPrice) <= 1e-6 && state.count < bestCount));

    if (betterTotal || equalTotalBetterPrice) {
      bestTotal = total;
      bestPrice = state.price;
      bestCount = state.count;
    }
  }

  if (bestTotal === null) {
    return null;
  }

  const selectedOptions: CreditPoolOption[] = [];
  let cursorTotal = bestTotal;
  while (cursorTotal > 0) {
    const state = bestStates.get(cursorTotal);
    if (!state || state.optionIndex < 0 || state.previousTotal < 0) {
      return null;
    }

    selectedOptions.push(options[state.optionIndex]);
    cursorTotal = state.previousTotal;
  }

  return selectedOptions.reverse();
}

function buildSelectedCreditListing(
  creditListing: ListingItem,
  option: CreditPoolOption,
): ListingItem {
  return {
    ...creditListing,
    skuId: `credit-pool:${option.amount}`,
    name: `Store Credit $${option.amount}`,
    price: option.price,
    creditAmount: option.amount,
    discountRateBps: option.discountRateBps,
    sellerCount: option.sellerCount,
    creditOptions: undefined,
  };
}

function buildCurrentMarketRoute(params: {
  startShip: Ship;
  targetShip: Ship;
  ships: Ship[];
  ccus: Ccu[];
  hangarItems: HangarItem[];
  marketGroups: LowestMarketCcuGroup[];
}): MarketRouteResult | null {
  const { startShip, targetShip, ships, ccus, hangarItems, marketGroups } = params;
  const candidateShips = ships
    .filter(ship => ship.msrp >= startShip.msrp && ship.msrp <= targetShip.msrp)
    .sort((left, right) => left.msrp - right.msrp || left.id - right.id);

  const shipById = new Map(candidateShips.map(ship => [ship.id, ship]));
  const shipIdByName = new Map<string, number>();
  candidateShips.forEach(ship => {
    const key = normalizeShipName(ship.name);
    if (!shipIdByName.has(key)) {
      shipIdByName.set(key, ship.id);
    }
  });

  const resolveShip = (shipId?: number, shipName?: string): Ship | null => {
    if (typeof shipId === 'number') {
      return shipById.get(shipId) || null;
    }

    if (shipName) {
      const resolvedId = shipIdByName.get(normalizeShipName(shipName));
      if (typeof resolvedId === 'number') {
        return shipById.get(resolvedId) || null;
      }
    }

    return null;
  };

  const outgoingEdges = new Map<number, MarketRouteEdge[]>();
  const addEdge = (edge: MarketRouteEdge) => {
    if (edge.targetShip.msrp <= edge.sourceShip.msrp) {
      return;
    }

    const sourceEdges = outgoingEdges.get(edge.sourceShip.id) || [];
    sourceEdges.push(edge);
    outgoingEdges.set(edge.sourceShip.id, sourceEdges);
  };

  const hangarEdgeKeys = new Set<string>();
  hangarItems.forEach((item, index) => {
    if (!item.fromShip || !item.toShip) {
      return;
    }

    const sourceShip = resolveShip(undefined, item.fromShip);
    const nextShip = resolveShip(undefined, item.toShip);
    if (!sourceShip || !nextShip) {
      return;
    }

    const key = `${sourceShip.id}->${nextShip.id}`;
    if (hangarEdgeKeys.has(key)) {
      return;
    }

    hangarEdgeKeys.add(key);
    addEdge({
      key: `hangar:${key}:${index}`,
      sourceShip,
      targetShip: nextShip,
      sourceType: CcuSourceType.HANGER,
      cost: 0,
    });
  });

  marketGroups.forEach(group => {
    const sourceShip = resolveShip(group.fromShipId, group.fromShipName);
    const nextShip = resolveShip(group.toShipId, group.toShipName);
    if (!sourceShip || !nextShip) {
      return;
    }

    addEdge({
      key: `market:${group.listing.skuId}`,
      sourceShip,
      targetShip: nextShip,
      sourceType: CcuSourceType.THIRD_PARTY,
      cost: group.listing.price,
      listing: group.listing,
    });
  });

  const hasOfficialSkuByShipId = new Map<number, boolean>();
  const warbondPriceByShipId = new Map<number, number | null>();
  candidateShips.forEach(ship => {
    hasOfficialSkuByShipId.set(ship.id, hasCurrentOfficialSku(ship, ccus));
    warbondPriceByShipId.set(ship.id, getCurrentWarbondPriceCents(ship, ccus));
  });

  candidateShips.forEach(sourceShip => {
    candidateShips.forEach(nextShip => {
      if (nextShip.msrp <= sourceShip.msrp) {
        return;
      }

      if (hasOfficialSkuByShipId.get(nextShip.id)) {
        addEdge({
          key: `official:${sourceShip.id}->${nextShip.id}`,
          sourceShip,
          targetShip: nextShip,
          sourceType: CcuSourceType.OFFICIAL,
          cost: Math.max(0, (nextShip.msrp - sourceShip.msrp) / 100),
        });
      }

      const warbondPriceCents = warbondPriceByShipId.get(nextShip.id) ?? null;
      if (warbondPriceCents === null || sourceShip.msrp >= warbondPriceCents) {
        return;
      }

      addEdge({
        key: `available-wb:${sourceShip.id}->${nextShip.id}:${warbondPriceCents}`,
        sourceShip,
        targetShip: nextShip,
        sourceType: CcuSourceType.AVAILABLE_WB,
        cost: Math.max(0, (warbondPriceCents - sourceShip.msrp) / 100),
      });
    });
  });

  const bestScoreByShipId = new Map<number, MarketRouteScore>();
  const previousEdgeByShipId = new Map<number, { previousShipId: number; edge: MarketRouteEdge }>();
  bestScoreByShipId.set(startShip.id, {
    availableWbCount: 0,
    officialCount: 0,
    marketCount: 0,
    hangarCount: 0,
    warbondCost: 0,
    totalCost: 0,
    stepCount: 0,
  });

  candidateShips.forEach(ship => {
    const currentScore = bestScoreByShipId.get(ship.id);
    if (!currentScore) {
      return;
    }

    const edges = outgoingEdges.get(ship.id) || [];
    edges.forEach(edge => {
      const nextScore: MarketRouteScore = {
        availableWbCount: currentScore.availableWbCount + (edge.sourceType === CcuSourceType.AVAILABLE_WB ? 1 : 0),
        officialCount: currentScore.officialCount + (edge.sourceType === CcuSourceType.OFFICIAL ? 1 : 0),
        marketCount: currentScore.marketCount + (edge.sourceType === CcuSourceType.THIRD_PARTY ? 1 : 0),
        hangarCount: currentScore.hangarCount + (edge.sourceType === CcuSourceType.HANGER ? 1 : 0),
        warbondCost: currentScore.warbondCost + (edge.sourceType === CcuSourceType.AVAILABLE_WB ? edge.cost : 0),
        totalCost: currentScore.totalCost + edge.cost,
        stepCount: currentScore.stepCount + 1,
      };

      const existingScore = bestScoreByShipId.get(edge.targetShip.id);
      if (!existingScore || compareMarketRouteScore(nextScore, existingScore) < 0) {
        bestScoreByShipId.set(edge.targetShip.id, nextScore);
        previousEdgeByShipId.set(edge.targetShip.id, {
          previousShipId: ship.id,
          edge,
        });
      }
    });
  });

  const finalScore = bestScoreByShipId.get(targetShip.id);
  if (!finalScore) {
    return null;
  }

  const routeEdges: MarketRouteEdge[] = [];
  const backtrackVisited = new Set<number>();
  let cursorShipId = targetShip.id;

  while (cursorShipId !== startShip.id) {
    if (backtrackVisited.has(cursorShipId)) {
      return null;
    }

    backtrackVisited.add(cursorShipId);
    const previousEdge = previousEdgeByShipId.get(cursorShipId);
    if (!previousEdge) {
      return null;
    }

    routeEdges.push(previousEdge.edge);
    cursorShipId = previousEdge.previousShipId;
  }

  routeEdges.reverse();
  if (!routeEdges.length) {
    return null;
  }

  const mergedRouteEdges = mergeSequentialOfficialEdges(routeEdges);
  const routeSummary = summarizeMarketRouteEdges(mergedRouteEdges);

  return {
    edges: mergedRouteEdges,
    totalCost: routeSummary.totalCost,
    officialCount: routeSummary.officialCount,
    marketCount: routeSummary.marketCount,
    hangarCount: routeSummary.hangarCount,
  };
}

export default function PathBuilder({ open, onClose, onCreatePath }: PathBuilderProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const isDevMode = import.meta.env.DEV;
  const ltiShipsEndpoint = `${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/lti-ships`;
  const { addToCart, emptyCart } = useCartStore();
  const {
    ships,
    ccus,
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
  const [marketRouteWindowOpen, setMarketRouteWindowOpen] = useState(false);
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

  const marketRouteApiPath = useMemo(() => {
    if (step !== 'review' || !reviewRequest) {
      return null;
    }

    return '/api/market/ccu/lowest';
  }, [reviewRequest, step]);

  const {
    data: marketRouteData,
  } = useApi<LowestMarketCcuResponse>(marketRouteApiPath, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const marketRoute = useMemo(() => {
    if (!reviewStartShip || !reviewTargetShip) {
      return null;
    }

    return buildCurrentMarketRoute({
      startShip: reviewStartShip,
      targetShip: reviewTargetShip,
      ships,
      ccus,
      hangarItems,
      marketGroups: marketRouteData?.items || [],
    });
  }, [ccus, hangarItems, marketRouteData?.items, reviewStartShip, reviewTargetShip, ships]);

  const marketRouteMarketEdges = useMemo(
    () => marketRoute?.edges.filter(edge => edge.sourceType === CcuSourceType.THIRD_PARTY && edge.listing) || [],
    [marketRoute]
  );

  const hasMarketAssistedRoute = marketRouteMarketEdges.length > 0;
  const marketRouteRequiredStoreCredit = useMemo(
    () => marketRoute ? getRequiredStoreCreditAmount(marketRoute.edges) : 0,
    [marketRoute]
  );

  const marketRouteCreditApiPath = useMemo(() => {
    if (step !== 'review' || !hasMarketAssistedRoute || marketRouteRequiredStoreCredit <= 0) {
      return null;
    }

    return '/api/market/item/credit-pool';
  }, [hasMarketAssistedRoute, marketRouteRequiredStoreCredit, step]);

  const {
    data: marketRouteCreditListing,
    error: marketRouteCreditError,
  } = useApi<ListingItem>(marketRouteCreditApiPath, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const isMarketRouteCreditLoading = Boolean(
    marketRouteCreditApiPath
    && !marketRouteCreditListing
    && !marketRouteCreditError
  );

  const marketRouteSelectedCreditOptions = useMemo(
    () => findMatchingCreditPoolOptions(marketRouteCreditListing, marketRouteRequiredStoreCredit),
    [marketRouteCreditListing, marketRouteRequiredStoreCredit]
  );

  const marketRouteSavingsVsDirectUpgrade = useMemo(() => {
    if (!marketRoute) {
      return null;
    }

    return directUpgradeCost - marketRoute.totalCost;
  }, [directUpgradeCost, marketRoute]);

  const marketRouteHeadline = useMemo(() => {
    if (!marketRoute || !reviewTargetShip) {
      return '';
    }

    if (marketRouteSavingsVsDirectUpgrade !== null && marketRouteSavingsVsDirectUpgrade > 0) {
      return intl.formatMessage(
        {
          id: 'pathBuilder.marketRouteHeadlineBetter',
          defaultMessage: 'Upgrade to {target} now and save {difference}.'
        },
        {
          target: reviewTargetShip.name,
          difference: formatUsdByLocale(marketRouteSavingsVsDirectUpgrade, intl.locale)
        }
      );
    }

    return intl.formatMessage(
      {
        id: 'pathBuilder.marketRouteHeadlineDefault',
        defaultMessage: 'Upgrade to {target} now'
      },
      {
        target: reviewTargetShip.name
      }
    );
  }, [intl, marketRoute, marketRouteSavingsVsDirectUpgrade, reviewTargetShip]);

  const marketRouteCanvasResult = useMemo<ReviewedPathBuildResult | null>(() => {
    if (!marketRoute || marketRoute.edges.length === 0) {
      return null;
    }

    const nodeIds: string[] = [];
    const routeShips: Ship[] = [marketRoute.edges[0].sourceShip];
    marketRoute.edges.forEach(edge => {
      routeShips.push(edge.targetShip);
    });

    const nodes: Node<AutoPathNodeData>[] = routeShips.map((ship, index) => {
      const nodeId = `market-route-ship-${ship.id}-${index}`;
      nodeIds.push(nodeId);

      return {
        id: nodeId,
        type: 'ship',
        position: {
          x: index * MARKET_ROUTE_NODE_GAP_X,
          y: MARKET_ROUTE_NODE_Y
        },
        data: {
          ship,
          id: nodeId
        }
      };
    });

    const edges: Edge<CcuEdgeData>[] = marketRoute.edges.map((edge, index) => ({
      id: `market-route-edge-${edge.sourceShip.id}-${edge.targetShip.id}-${index}`,
      source: nodeIds[index],
      target: nodeIds[index + 1],
      type: 'ccu',
      data: {
        price: edge.cost,
        sourceShip: edge.sourceShip,
        targetShip: edge.targetShip,
        sourceType: edge.sourceType
      }
    }));

    return { nodes, edges };
  }, [marketRoute]);

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
    setMarketRouteWindowOpen(false);
  }, [open, terminateBaseGraphPrebuildWorker]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (step !== 'review') {
      setMarketRouteWindowOpen(false);
      return;
    }

    if (!hasMarketAssistedRoute) {
      setMarketRouteWindowOpen(false);
      return;
    }

    setMarketRouteWindowOpen(true);
  }, [hasMarketAssistedRoute, open, step]);

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

  const formatUsd = useCallback((value: number): string => {
    return formatUsdByLocale(value, intl.locale);
  }, [intl.locale]);

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

  const getMarketRouteTypeLabel = (sourceType: CcuSourceType): string => {
    if (sourceType === CcuSourceType.THIRD_PARTY) {
      return intl.formatMessage({
        id: 'pathBuilder.marketRouteStoreLabel',
        defaultMessage: 'Store'
      });
    }

    return getCcuTypeLabel(sourceType);
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

  const handleAddMarketRouteToCart = useCallback(() => {
    if (!marketRouteMarketEdges.length || !marketRouteCanvasResult) {
      return;
    }

    const selectedCreditResources: Array<ReturnType<typeof buildMarketResource>> = [];
    if (marketRouteRequiredStoreCredit > 0) {
      if (isMarketRouteCreditLoading) {
        showAlert(
          intl.formatMessage({
            id: 'pathBuilder.marketRouteCreditLoading',
            defaultMessage: 'Store Credit options are still loading. Try again in a moment.'
          }),
          'warning'
        );
        return;
      }

      if (!marketRouteSelectedCreditOptions?.length || !marketRouteCreditListing) {
        showAlert(
          intl.formatMessage(
            {
              id: 'pathBuilder.marketRouteCreditUnavailable',
              defaultMessage: 'No combination of Store Credit amounts can cover the required normal-upgrade spend of {amount}.'
            },
            {
              amount: formatUsd(marketRouteRequiredStoreCredit)
            }
          ),
          'warning'
        );
        return;
      }

      marketRouteSelectedCreditOptions.forEach((option) => {
        selectedCreditResources.push(
          buildMarketResource(
            buildSelectedCreditListing(marketRouteCreditListing, option),
            ships,
          ),
        );
      });
    }

    const plannedListingQuantities = new Map<string, number>();

    for (const edge of marketRouteMarketEdges) {
      const listing = edge.listing;
      if (!listing) {
        continue;
      }

      const availableStock = Math.max(listing.stock - listing.lockedStock, 0);
      const nextQuantity = (plannedListingQuantities.get(listing.skuId) || 0) + 1;
      plannedListingQuantities.set(listing.skuId, nextQuantity);

      if (availableStock < nextQuantity) {
        showAlert(
          intl.formatMessage({
            id: 'cart.stockLimit',
            defaultMessage: 'Cannot add more than available stock'
          }),
          'warning'
        );
        return;
      }
    }

    emptyCart();

    marketRouteMarketEdges.forEach(edge => {
      if (!edge.listing) {
        return;
      }

      addToCart(buildMarketResource(edge.listing, ships));
    });

    selectedCreditResources.forEach((resource) => {
      addToCart(resource);
    });

    onCreatePath(marketRouteCanvasResult, { targetMode: 'newTab' });
    setMarketRouteWindowOpen(false);
    onClose();
    navigate('/checkout');
    showAlert(
      intl.formatMessage({
        id: 'market.addedToCart',
        defaultMessage: 'Added to cart'
      }),
      'success'
    );
  }, [
    addToCart,
    emptyCart,
    intl,
    isMarketRouteCreditLoading,
    marketRouteCanvasResult,
    marketRouteCreditListing,
    marketRouteMarketEdges,
    marketRouteRequiredStoreCredit,
    marketRouteSelectedCreditOptions,
    navigate,
    onClose,
    onCreatePath,
    ships,
    showAlert,
    formatUsd,
  ]);

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
      fullScreen
      slotProps={{
        paper: {
          sx: (theme) => ({
            ...(theme.palette.mode === 'dark'
              ? {
                backgroundColor: '#121212',
                backgroundImage: 'none',
                color: '#f3f4f6'
              }
              : {})
          }),
          className: 'dark:bg-[#121212] dark:text-gray-100'
        }
      }}
    >
      <DialogTitle className="flex justify-between items-center border-b border-gray-200 dark:border-neutral-700 dark:bg-[#121212]">
        <div className="flex items-center gap-2">
          <FormattedMessage id="pathBuilder.title" defaultMessage="Path Builder" />
        </div>
        <IconButton onClick={onClose} size="small" aria-label={intl.formatMessage({ id: 'pathBuilder.close', defaultMessage: 'Close' })}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent
        className="p-0 h-full flex flex-col dark:bg-[#121212] dark:text-gray-100"
        sx={{
          p: 0,
          overflow: 'hidden',
          backgroundColor: (theme) => (theme.palette.mode === 'dark' ? '#121212' : undefined),
          backgroundImage: (theme) => (theme.palette.mode === 'dark' ? 'none' : undefined),
          '& .MuiChip-root': { borderRadius: 0 },
          '& .MuiOutlinedInput-root': { borderRadius: 0 }
        }}
      >
        {step === 'configure' ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-auto p-2 sm:p-4">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4">
                <div className="xl:col-span-2 flex flex-col gap-3 sm:gap-4">
                  <div className="text-sm text-gray-500 dark:text-gray-300">
                    <FormattedMessage
                      id="pathBuilder.autoHint"
                      defaultMessage="Automatically generate a CCU path graph from your starting ship to your target ship using historical opportunities in the selected time range."
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                    <div className="joyride-path-builder-start-ship border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 sm:p-3">
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

                      <div className="mt-3 border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 p-2 sm:p-3">
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

                      <div className="mt-3 border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 p-2 sm:p-3 flex flex-col gap-2">
                        <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
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
                                className={`flex flex-col items-stretch sm:flex-row sm:items-center sm:justify-between gap-3 border px-3 py-2 transition-colors ${option.ship?.id === startShipId
                                  ? 'border-blue-400 bg-blue-50 dark:border-neutral-600 dark:bg-neutral-900'
                                  : 'border-gray-200 bg-white dark:border-neutral-700 dark:bg-[#121212]'
                                  } ${option.ship
                                    ? 'cursor-pointer hover:border-blue-300 dark:hover:border-gray-600'
                                    : 'cursor-default opacity-80'}`}
                              >
                                <div className="min-w-0 flex items-center gap-3">
                                  <ShipImage
                                    ship={option.ship}
                                    className="w-16 h-12 shrink-0"
                                    placeholderClassName="border border-gray-200 dark:border-neutral-700"
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
                                  className="!self-start sm:!self-auto"
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

                    <div className="joyride-path-builder-target-ship border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 sm:p-3">
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

                      <div className="mt-3 border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 p-2 sm:p-3">
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

                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 sm:p-3 flex flex-col gap-3">
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
                          className="border border-gray-300 dark:border-neutral-600 px-3 py-2 bg-white dark:bg-[#121212] text-gray-900 dark:text-gray-100"
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
                          className="border border-gray-300 dark:border-neutral-600 px-3 py-2 bg-white dark:bg-[#121212] text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="joyride-path-builder-options flex flex-col gap-2 border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 sm:p-3">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
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

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
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

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
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

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
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
                      <div className="pt-2 mt-1 border-t border-gray-200 dark:border-neutral-700">
                        <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-2">
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

                        <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-2">
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

                  <div className="border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 sm:p-3">
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

            <div className="border-t border-gray-200 dark:border-neutral-700 dark:bg-[#121212] p-3 sm:p-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button onClick={onClose} variant="outlined" disabled={isCalculating} className="w-full sm:w-auto">
                <FormattedMessage id="pathBuilder.cancel" defaultMessage="Cancel" />
              </Button>
              <Button onClick={handleGenerateForReview} variant="contained" color="primary" disabled={isCalculating} className="joyride-path-builder-create w-full sm:w-auto">
                {isCalculating ? (
                  <span className="flex items-center gap-2">
                    <CircularProgress size={16} color="inherit" />
                    <span>{intl.formatMessage({ id: 'pathBuilder.calculating', defaultMessage: 'Calculating...' })}</span>
                  </span>
                ) : (
                  <FormattedMessage id="pathBuilder.createPath" defaultMessage="Create path" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="relative flex-1 min-h-0 overflow-auto xl:overflow-hidden touch-pan-y p-2 sm:p-4 pb-3 sm:pb-4 flex flex-col gap-3 sm:gap-4">
              {/* {isCalculating && (
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 dark:text-gray-200 dark:bg-neutral-900 dark:border-neutral-700 p-2">
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
                <div className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 p-2">
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
                  <div className="border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 p-3">
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

                  <div className="border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 p-3">
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
                <div className="border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 p-3">
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
                    <div className="h-6 border-t border-gray-300 dark:border-neutral-700" />
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:gap-4 xl:min-h-0 xl:flex-1 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:grid-rows-1">
                <div className="flex flex-col gap-3 border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 sm:p-3 xl:min-h-0 xl:overflow-hidden">
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

                      <div className="flex flex-col gap-2 xl:min-h-0 xl:overflow-auto">
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
                            <div key={`${item.edge.id}-${index}`} className="border border-gray-200 dark:border-neutral-700 p-2 sm:p-3 bg-white dark:bg-neutral-900">
                              <div className="grid grid-cols-1 xl:grid-cols-[360px_250px_minmax(0,1fr)] gap-3 sm:gap-4 xl:gap-5">
                                <div className='flex flex-col gap-3 sm:gap-4'>
                                  <div className="text-sm font-semibold">
                                    {index + 1}. {item.sourceShip.name} -&gt; {item.targetShip.name}
                                  </div>

                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-xs px-2 py-[2px] ${getCcuTypeStyle(item.sourceType)}`}>
                                      {getCcuTypeLabel(item.sourceType)}
                                    </span>
                                    <span className="text-xs font-medium text-blue-700 dark:text-gray-200 bg-blue-50 dark:bg-neutral-900 px-2 py-[2px]">
                                      {formatUsd(item.cost)}
                                    </span>
                                    {officialUpgradeCost > 0 && (
                                      <span className={`text-xs font-medium px-2 py-[2px] ${stepSavedAmount >= 0 ? 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30' : 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/30'}`}>
                                        {intl.formatMessage({ id: 'pathBuilder.stepSavings', defaultMessage: 'Savings' })}: {`${formatUsd(stepSavedAmount)}`} ({`${stepSavedRatio > 0 ? '-' : ''}${stepSavedRatio.toFixed(2)}%`})
                                      </span>
                                    )}
                                  </div>
                                  <UpgradePreview fromShip={item.sourceShip} toShip={item.targetShip} className="w-full h-[128px] sm:h-[160px] xl:w-[360px] xl:h-[180px] shrink-0" />
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
                                              className={`flex flex-col items-start gap-2 text-xs text-gray-600 dark:text-gray-300 p-1 3xl:flex-row 3xl:items-center 3xl:justify-between ${isHovered ? 'bg-blue-50 dark:bg-neutral-900/70' : ''}`}
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

                                <div className="min-w-0 border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-[#121212] p-2 sm:p-3 flex-1">
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                    <FormattedMessage
                                      id="pathBuilder.stepPriceHistoryTitle"
                                      defaultMessage="{ship} price history"
                                      values={{ ship: item.targetShip.name }}
                                    />
                                  </div>

                                  {priceHistoryMap[item.targetShip.id]?.history?.length ? (
                                    <div className="h-[220px] sm:h-[300px] xl:h-[340px]">
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
                                        panelClassName="h-full flex flex-col bg-transparent pb-2 sm:pb-3 pl-2 sm:pl-3 pr-1 sm:pr-2"
                                      />
                                    </div>
                                  ) : (
                                    <div className="h-[220px] border border-dashed border-gray-300 dark:border-neutral-600 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center">
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

                <div className="flex flex-col gap-2 border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 sm:p-3 xl:min-h-0 xl:overflow-auto">
                  <div className="text-sm font-medium">
                    <FormattedMessage
                      id="pathBuilder.excludedTitle"
                      defaultMessage="Excluded items"
                    />
                  </div>
                  <div className="flex flex-col gap-3">
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

              {reviewRequest && reviewStartShip && reviewTargetShip && hasMarketAssistedRoute && marketRoute && (
                <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex justify-end sm:inset-x-4 sm:bottom-4">
                  {marketRouteWindowOpen ? (
                    <div className="pointer-events-auto flex max-h-[min(72vh,680px)] w-full max-w-[460px] flex-col overflow-hidden border border-emerald-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] dark:border-emerald-800 dark:bg-[#121212]">
                      <div className="flex items-start justify-between gap-3 border-b border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                        <div className="min-w-0">
                          {/* <div className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                            <FormattedMessage
                              id="pathBuilder.marketRouteTitle"
                              defaultMessage="Market-Assisted Route"
                            />
                          </div> */}
                          <div className="mt-1 text-sm font-semibold leading-6 text-emerald-950 dark:text-emerald-50">
                            {marketRouteHeadline}
                          </div>
                        </div>
                        <IconButton
                          onClick={() => setMarketRouteWindowOpen(false)}
                          size="small"
                          aria-label={intl.formatMessage({ id: 'pathBuilder.marketRouteClose', defaultMessage: 'Close' })}
                        >
                          <Close fontSize="small" />
                        </IconButton>
                      </div>

                      <div className="border-b border-gray-200 p-3 dark:border-neutral-700">
                        {/* <div className="text-xs text-gray-600 dark:text-gray-300">
                          <FormattedMessage
                            id="pathBuilder.marketRouteHint"
                            defaultMessage="Priority order: hangar CCUs first, then cheapest listed market CCUs, and only then current official SKU upgrades."
                          />
                        </div> */}
                        {/* <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <FormattedMessage
                            id="pathBuilder.marketRouteCtaHint"
                            defaultMessage="Inspect the floating plan here and add every required market CCU to the cart in one click."
                          />
                        </div> */}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="border border-emerald-200 bg-emerald-50/70 px-2 py-[2px] text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                            <FormattedMessage
                              id="pathBuilder.marketRouteSummary"
                              defaultMessage="{steps, number} steps"
                              values={{ steps: marketRoute.edges.length, cost: formatUsd(marketRoute.totalCost) }}
                            />
                          </span>
                          <span className="border border-gray-200 bg-gray-50 px-2 py-[2px] text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200">
                            <FormattedMessage
                              id="pathBuilder.marketRouteHangarCount"
                              defaultMessage="Hangar {count}"
                              values={{ count: marketRoute.hangarCount }}
                            />
                          </span>
                          <span className="border border-gray-200 bg-gray-50 px-2 py-[2px] text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200">
                            <FormattedMessage
                              id="pathBuilder.marketRouteMarketCount"
                              defaultMessage="Market {count}"
                              values={{ count: marketRoute.marketCount }}
                            />
                          </span>
                          <span className="border border-gray-200 bg-gray-50 px-2 py-[2px] text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200">
                            <FormattedMessage
                              id="pathBuilder.marketRouteOfficialCount"
                              defaultMessage="Official fallback {count}"
                              values={{ count: marketRoute.officialCount }}
                            />
                          </span>
                        </div>
                        <div className="mt-3">
                          <Button
                            variant="contained"
                            color="success"
                            onClick={handleAddMarketRouteToCart}
                            disabled={marketRouteMarketEdges.length === 0}
                            fullWidth
                          >
                            <FormattedMessage
                              id='pathBuilder.marketRouteAddToCart'
                              defaultMessage='Add market CCUs to cart'
                            />
                          </Button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-auto p-3">
                        <div className="flex flex-col gap-3">
                          {marketRoute.edges.map((edge, index) => (
                            <div
                              key={`${edge.key}-${index}`}
                              className="flex flex-col gap-3 border border-gray-200 bg-gray-50/70 p-3 dark:border-neutral-700 dark:bg-neutral-900"
                            >
                              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {index + 1}. {edge.sourceShip.name} -&gt; {edge.targetShip.name}
                              </div>

                              <UpgradePreview
                                fromShip={edge.sourceShip}
                                toShip={edge.targetShip}
                                className="h-[104px] w-full shrink-0"
                              />

                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-xs px-2 py-[2px] ${getCcuTypeStyle(edge.sourceType)}`}>
                                  {getMarketRouteTypeLabel(edge.sourceType)}
                                </span>
                                <span className="text-xs px-2 py-[2px] border border-gray-200 bg-white text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200">
                                  {formatUsd(edge.cost)}
                                </span>
                                {/* {edge.listing && (
                                  <span className="text-xs px-2 py-[2px] border border-gray-200 bg-white text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200">
                                    SKU {edge.listing.skuId}
                                  </span>
                                )} */}
                              </div>

                              {/* <div className="text-xs text-gray-600 dark:text-gray-300">
                                {edge.listing ? (
                                  <FormattedMessage
                                    id="pathBuilder.marketRouteListingHint"
                                    defaultMessage="This step can be purchased immediately from the market at the current lowest listed price."
                                  />
                                ) : edge.sourceType === CcuSourceType.HANGER ? (
                                  <FormattedMessage
                                    id="pathBuilder.marketRouteHangarHint"
                                    defaultMessage="This step will be covered by a hangar CCU you already own."
                                  />
                                ) : (
                                  <FormattedMessage
                                    id="pathBuilder.marketRouteOfficialHint"
                                    defaultMessage="This step falls back to the current official upgrade because no suitable market listing is available."
                                  />
                                )}
                              </div> */}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className='m-4'>
                      <Button
                        variant="contained"
                        color="success"
                        onClick={() => setMarketRouteWindowOpen(true)}
                        className="pointer-events-auto"
                      >
                        <FormattedMessage
                          id="pathBuilder.marketRouteOpen"
                          defaultMessage="Instant upgrade"
                        />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-0 sm:mt-3 border-t border-gray-200 dark:border-neutral-700 dark:bg-[#121212] p-3 sm:p-4 flex flex-col sm:flex-row sm:justify-end gap-2">
              <Button
                onClick={handleConfirmRoute}
                variant="contained"
                color="primary"
                disabled={!reviewRoute || isCalculating}
                className="w-full sm:w-auto"
              >
                <FormattedMessage id="pathBuilder.addToCanvas" defaultMessage="Add to canvas" />
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
                className="w-full sm:w-auto"
              >
                <FormattedMessage id="pathBuilder.clearExcluded" defaultMessage="Reset excluded CCUs" />
              </Button>
              <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-2">
                <Button onClick={() => setStep('configure')} variant="outlined" disabled={isCalculating} className="w-full sm:w-auto">
                  <FormattedMessage id="pathBuilder.backToSettings" defaultMessage="Back to settings" />
                </Button>
                <Button onClick={onClose} variant="outlined" disabled={isCalculating} className="w-full sm:w-auto">
                  <FormattedMessage id="pathBuilder.cancel" defaultMessage="Cancel" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>

    </Dialog>
  );
}
