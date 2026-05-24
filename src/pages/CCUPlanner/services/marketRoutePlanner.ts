import {
  Ccu,
  CcuSourceType,
  HangarItem,
  ListingItem,
  LowestMarketCcuGroup,
  Ship,
} from '@/types';

export interface MarketRouteEdge {
  key: string;
  sourceShip: Ship;
  targetShip: Ship;
  sourceType: CcuSourceType;
  cost: number;
  listing?: LowestMarketCcuGroup['listing'];
}

export interface MarketRouteResult {
  edges: MarketRouteEdge[];
  totalCost: number;
  officialCount: number;
  marketCount: number;
  hangarCount: number;
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

export type CreditPoolOption = NonNullable<ListingItem['creditOptions']>[number];

export function normalizeMarketRouteShipName(name: string): string {
  return name.trim().toUpperCase();
}

export function hasCurrentOfficialSku(ship: Ship, ccus: Ccu[]): boolean {
  const ccuTarget = ccus.find(entry => entry.id === ship.id);
  return Boolean(ccuTarget?.skus.some(sku => sku.available && sku.price === ship.msrp));
}

export function getCurrentWarbondPriceCents(ship: Ship, ccus: Ccu[]): number | null {
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
      previousEdge
      && previousEdge.sourceType === CcuSourceType.OFFICIAL
      && edge.sourceType === CcuSourceType.OFFICIAL
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

export function getRequiredStoreCreditAmount(edges: MarketRouteEdge[]): number {
  const total = edges.reduce((sum, edge) => (
    edge.sourceType === CcuSourceType.OFFICIAL ? sum + edge.cost : sum
  ), 0);

  return Number(total.toFixed(2));
}

export function getRequiredCashAmount(edges: MarketRouteEdge[]): number {
  const total = edges.reduce((sum, edge) => (
    edge.sourceType === CcuSourceType.THIRD_PARTY
      || edge.sourceType === CcuSourceType.AVAILABLE_WB
      || edge.sourceType === CcuSourceType.OFFICIAL_WB
      ? sum + edge.cost
      : sum
  ), 0);

  return Number(total.toFixed(2));
}

export function findMatchingCreditPoolOptions(
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

    const isLowerPrice = state.price < bestPrice - 1e-6;
    const isSamePrice = Math.abs(state.price - bestPrice) <= 1e-6;
    const isCloserAmount = bestTotal === null || total < bestTotal;
    const isSameAmountWithFewerPacks = bestTotal !== null && total === bestTotal && state.count < bestCount;

    if (
      bestTotal === null
      || isLowerPrice
      || (isSamePrice && isCloserAmount)
      || (isSamePrice && isSameAmountWithFewerPacks)
    ) {
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

export function buildSelectedCreditListing(
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

export function buildCurrentMarketRoute(params: {
  startShip: Ship;
  targetShip: Ship;
  ships: Ship[];
  ccus: Ccu[];
  hangarItems?: HangarItem[];
  marketGroups: LowestMarketCcuGroup[];
}): MarketRouteResult | null {
  const { startShip, targetShip, ships, ccus, marketGroups } = params;
  const hangarItems = params.hangarItems || [];
  const candidateShips = ships
    .filter(ship => ship.msrp >= startShip.msrp && ship.msrp <= targetShip.msrp)
    .sort((left, right) => left.msrp - right.msrp || left.id - right.id);

  const shipById = new Map(candidateShips.map(ship => [ship.id, ship]));
  const shipIdByName = new Map<string, number>();
  candidateShips.forEach(ship => {
    const key = normalizeMarketRouteShipName(ship.name);
    if (!shipIdByName.has(key)) {
      shipIdByName.set(key, ship.id);
    }
  });

  const resolveShip = (shipId?: number, shipName?: string): Ship | null => {
    if (typeof shipId === 'number') {
      return shipById.get(shipId) || null;
    }

    if (shipName) {
      const resolvedId = shipIdByName.get(normalizeMarketRouteShipName(shipName));
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
  const sortedHangarItems = [...hangarItems].sort((left, right) => {
    const leftPrice = typeof left.price === 'number' && Number.isFinite(left.price) ? left.price : 0;
    const rightPrice = typeof right.price === 'number' && Number.isFinite(right.price) ? right.price : 0;

    return leftPrice - rightPrice;
  });

  sortedHangarItems.forEach((item, index) => {
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
      cost: typeof item.price === 'number' && Number.isFinite(item.price) ? Math.max(0, item.price) : 0,
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
