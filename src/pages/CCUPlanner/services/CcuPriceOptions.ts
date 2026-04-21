import {
  Ccu,
  CcuSourceType,
  CcuValidityWindow,
  PriceHistoryEntity,
  Ship
} from '../../../types';

interface SourceStandardPriceWindow {
  sku: number;
  priceCents: number;
  startTs: number;
  endTs: number | null;
}

interface HistoricalUpgradePricingOption {
  sourcePriceCents: number;
  validityWindows: CcuValidityWindow[];
}

export interface CcuConcretePricingOption {
  key: string;
  sourceType: CcuSourceType;
  customPrice: number;
  targetPriceCents?: number;
  sourcePriceCents?: number;
  validityWindows?: CcuValidityWindow[];
}

interface ConcretePricingParams {
  sourceShip: Ship;
  targetShip: Ship;
  ccus: Ccu[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
}

function buildPricingPairKey(targetPriceCents: number, sourcePriceCents: number): string {
  return `${targetPriceCents}:${sourcePriceCents}`;
}

function buildConcretePricingOptionKey(option: {
  sourceType: CcuSourceType;
  targetPriceCents?: number;
  sourcePriceCents?: number;
  customPrice: number;
}): string {
  const targetPrice = option.targetPriceCents ?? 'na';
  const sourcePrice = option.sourcePriceCents ?? 'na';
  return `option:${option.sourceType}:${targetPrice}:${sourcePrice}:${option.customPrice}`;
}

export function isWarbondEdition(edition?: string): boolean {
  if (!edition) return false;
  const lowerEdition = edition.toLowerCase();
  return lowerEdition.includes('warbond') || lowerEdition.includes('-wb') || lowerEdition.includes(' wb');
}

export function isStandardEdition(edition?: string): boolean {
  if (!edition) return true;
  if (isWarbondEdition(edition)) return false;
  return edition.toLowerCase().includes('standard');
}

function isDiscountPriceEntry(entry: PriceHistoryEntity['history'][number]): boolean {
  if (typeof entry.msrp !== 'number') return false;
  if (typeof entry.baseMsrp === 'number' && entry.msrp < entry.baseMsrp) {
    return true;
  }
  return isWarbondEdition(entry.edition);
}

function isStandardOrNormalPriceEntry(entry: PriceHistoryEntity['history'][number]): boolean {
  if (typeof entry.msrp !== 'number') return false;
  if (isDiscountPriceEntry(entry)) return false;
  if (typeof entry.baseMsrp === 'number') {
    return entry.msrp >= entry.baseMsrp;
  }
  return isStandardEdition(entry.edition);
}

function sortConcretePricingOptions(left: CcuConcretePricingOption, right: CcuConcretePricingOption): number {
  if (left.customPrice !== right.customPrice) {
    return left.customPrice - right.customPrice;
  }

  const leftTargetPrice = left.targetPriceCents ?? Number.MAX_SAFE_INTEGER;
  const rightTargetPrice = right.targetPriceCents ?? Number.MAX_SAFE_INTEGER;
  if (leftTargetPrice !== rightTargetPrice) {
    return leftTargetPrice - rightTargetPrice;
  }

  const leftSourcePrice = left.sourcePriceCents ?? Number.MIN_SAFE_INTEGER;
  const rightSourcePrice = right.sourcePriceCents ?? Number.MIN_SAFE_INTEGER;
  if (leftSourcePrice !== rightSourcePrice) {
    return rightSourcePrice - leftSourcePrice;
  }

  return left.key.localeCompare(right.key);
}

function findAllHistoryPriceOptions(
  history: PriceHistoryEntity['history'],
  predicate: (entry: PriceHistoryEntity['history'][number]) => boolean
): number[] {
  const prices = history
    .filter(entry =>
      entry.change === '+' &&
      typeof entry.sku === 'number' &&
      typeof entry.msrp === 'number' &&
      predicate(entry)
    )
    .map(entry => entry.msrp as number);

  return [...new Set(prices)].sort((a, b) => a - b);
}

function collectSkuValidityWindowsForPrice(params: {
  history: PriceHistoryEntity['history'];
  priceCents: number;
  predicate: (entry: PriceHistoryEntity['history'][number]) => boolean;
}): CcuValidityWindow[] {
  const { history, priceCents, predicate } = params;
  const openBySku = new Map<number, number>();
  const windows: CcuValidityWindow[] = [];

  const pushWindow = (sku: number, startTs: number, endTs: number | null) => {
    if (endTs !== null && startTs >= endTs) {
      return;
    }

    windows.push({
      sku,
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

function collectSourceStandardPriceWindows(params: {
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

      if (!isStandardOrNormalPriceEntry(entry) || typeof entry.msrp !== 'number') {
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

function mergeValidityWindowEnd(leftEnd: number | null, rightEnd: number | null): number | null {
  if (leftEnd === null || rightEnd === null) {
    return null;
  }
  return Math.max(leftEnd, rightEnd);
}

function mergeSkuValidityWindows(windows: CcuValidityWindow[]): CcuValidityWindow[] {
  if (!windows.length) {
    return [];
  }

  const sortedWindows = [...windows].sort((a, b) => {
    if (a.sku !== b.sku) {
      return a.sku - b.sku;
    }
    if (a.startTs !== b.startTs) {
      return a.startTs - b.startTs;
    }
    const aEnd = a.endTs ?? Number.POSITIVE_INFINITY;
    const bEnd = b.endTs ?? Number.POSITIVE_INFINITY;
    return aEnd - bEnd;
  });

  const mergedWindows: CcuValidityWindow[] = [];
  sortedWindows.forEach(window => {
    const previousWindow = mergedWindows[mergedWindows.length - 1];
    if (!previousWindow || previousWindow.sku !== window.sku) {
      mergedWindows.push({ ...window });
      return;
    }

    const previousEnd = previousWindow.endTs;
    if (previousEnd === null || window.startTs <= previousEnd) {
      previousWindow.endTs = mergeValidityWindowEnd(previousEnd, window.endTs);
      return;
    }

    mergedWindows.push({ ...window });
  });

  return mergedWindows;
}

function collectHistoricalUpgradePricingOptions(params: {
  sourceShipId: number;
  targetPriceCents: number;
  targetValidityWindows: CcuValidityWindow[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
}): HistoricalUpgradePricingOption[] {
  const { sourceShipId, targetPriceCents, targetValidityWindows, priceHistoryMap } = params;
  if (!targetValidityWindows.length) {
    return [];
  }

  const sourceHistory = priceHistoryMap[sourceShipId]?.history || [];
  const sourceStandardWindows = collectSourceStandardPriceWindows({
    history: sourceHistory
  });
  if (!sourceStandardWindows.length) {
    return [];
  }

  const optionsBySourcePrice = new Map<number, CcuValidityWindow[]>();
  targetValidityWindows.forEach(targetWindow => {
    const targetWindowEndTs = targetWindow.endTs ?? Number.POSITIVE_INFINITY;
    sourceStandardWindows.forEach(sourceWindow => {
      if (sourceWindow.priceCents >= targetPriceCents) {
        return;
      }

      const sourceWindowEndTs = sourceWindow.endTs ?? Number.POSITIVE_INFINITY;
      const overlapStartTs = Math.max(targetWindow.startTs, sourceWindow.startTs);
      const overlapEndTs = Math.min(targetWindowEndTs, sourceWindowEndTs);
      if (Number.isFinite(overlapEndTs) && overlapStartTs >= overlapEndTs) {
        return;
      }

      const priceWindows = optionsBySourcePrice.get(sourceWindow.priceCents) || [];
      priceWindows.push({
        sku: targetWindow.sku,
        startTs: overlapStartTs,
        endTs: Number.isFinite(overlapEndTs) ? overlapEndTs : null
      });
      optionsBySourcePrice.set(sourceWindow.priceCents, priceWindows);
    });
  });

  return Array.from(optionsBySourcePrice.entries())
    .map(([sourcePriceCents, validityWindows]) => ({
      sourcePriceCents,
      validityWindows: mergeSkuValidityWindows(validityWindows)
    }))
    .filter(option => option.validityWindows.length > 0)
    .sort((left, right) => right.sourcePriceCents - left.sourcePriceCents);
}

export function getAvailableWbPricingOptions(params: ConcretePricingParams): CcuConcretePricingOption[] {
  const { sourceShip, targetShip, ccus } = params;
  const targetCcu = ccus.find(c => c.id === targetShip.id);
  const optionsByTargetPrice = new Map<number, CcuConcretePricingOption>();

  (targetCcu?.skus || [])
    .filter(sku => sku.available && sku.price !== targetShip.msrp && sku.price > sourceShip.msrp)
    .forEach(sku => {
      if (optionsByTargetPrice.has(sku.price)) {
        return;
      }

      const option: CcuConcretePricingOption = {
        key: buildConcretePricingOptionKey({
          sourceType: CcuSourceType.AVAILABLE_WB,
          targetPriceCents: sku.price,
          sourcePriceCents: sourceShip.msrp,
          customPrice: Math.max(0, (sku.price - sourceShip.msrp) / 100)
        }),
        sourceType: CcuSourceType.AVAILABLE_WB,
        customPrice: Math.max(0, (sku.price - sourceShip.msrp) / 100),
        targetPriceCents: sku.price,
        sourcePriceCents: sourceShip.msrp
      };

      optionsByTargetPrice.set(sku.price, option);
    });

  return Array.from(optionsByTargetPrice.values()).sort(sortConcretePricingOptions);
}

function getHistoricalLikePricingOptions(
  params: ConcretePricingParams,
  sourceType: CcuSourceType.HISTORICAL | CcuSourceType.PRICE_INCREASE
): CcuConcretePricingOption[] {
  const { sourceShip, targetShip, priceHistoryMap } = params;
  const targetHistory = priceHistoryMap[targetShip.id]?.history || [];
  const targetPricePredicate = sourceType === CcuSourceType.HISTORICAL
    ? isDiscountPriceEntry
    : isStandardOrNormalPriceEntry;

  return findAllHistoryPriceOptions(targetHistory, targetPricePredicate)
    .filter(price => sourceType !== CcuSourceType.PRICE_INCREASE || price < targetShip.msrp)
    .flatMap(targetPriceCents => {
      const targetValidityWindows = collectSkuValidityWindowsForPrice({
        history: targetHistory,
        priceCents: targetPriceCents,
        predicate: targetPricePredicate
      });

      return collectHistoricalUpgradePricingOptions({
        sourceShipId: sourceShip.id,
        targetPriceCents,
        targetValidityWindows,
        priceHistoryMap
      }).flatMap(pricingOption => {
        const customPrice = (targetPriceCents - pricingOption.sourcePriceCents) / 100;
        if (customPrice <= 0) {
          return [];
        }

        const option: CcuConcretePricingOption = {
          key: buildConcretePricingOptionKey({
            sourceType,
            targetPriceCents,
            sourcePriceCents: pricingOption.sourcePriceCents,
            customPrice
          }),
          sourceType,
          customPrice,
          targetPriceCents,
          sourcePriceCents: pricingOption.sourcePriceCents,
          validityWindows: pricingOption.validityWindows
        };

        return [option];
      });
    })
    .sort(sortConcretePricingOptions);
}

export function getHistoricalPricingOptions(params: ConcretePricingParams): CcuConcretePricingOption[] {
  return getHistoricalLikePricingOptions(params, CcuSourceType.HISTORICAL);
}

export function getExpectedWbPricingOptions(params: ConcretePricingParams): CcuConcretePricingOption[] {
  const { sourceShip, targetShip, priceHistoryMap } = params;
  const currentSourcePriceCents = sourceShip.msrp;
  if (currentSourcePriceCents <= 0) {
    return [];
  }

  const targetHistory = priceHistoryMap[targetShip.id]?.history || [];
  if (!targetHistory.length) {
    return [];
  }

  const existingPairKeys = new Set(
    [
      ...getAvailableWbPricingOptions(params),
      ...getHistoricalPricingOptions(params)
    ]
      .filter(option =>
        typeof option.targetPriceCents === 'number' &&
        typeof option.sourcePriceCents === 'number'
      )
      .map(option => buildPricingPairKey(option.targetPriceCents as number, option.sourcePriceCents as number))
  );

  // Expected WB uses historical target WB prices against the current source ship value,
  // but only when the exact pair has not existed in current or historical pricing data.
  return findAllHistoryPriceOptions(targetHistory, isDiscountPriceEntry)
    .filter(targetPriceCents => targetPriceCents > currentSourcePriceCents)
    .filter(targetPriceCents => !existingPairKeys.has(buildPricingPairKey(targetPriceCents, currentSourcePriceCents)))
    .map(targetPriceCents => {
      const customPrice = (targetPriceCents - currentSourcePriceCents) / 100;
      return {
        key: buildConcretePricingOptionKey({
          sourceType: CcuSourceType.EXPECTED_WB,
          targetPriceCents,
          sourcePriceCents: currentSourcePriceCents,
          customPrice
        }),
        sourceType: CcuSourceType.EXPECTED_WB,
        customPrice,
        targetPriceCents,
        sourcePriceCents: currentSourcePriceCents
      };
    })
    .sort(sortConcretePricingOptions);
}

export function getPriceIncreasePricingOptions(params: ConcretePricingParams): CcuConcretePricingOption[] {
  return getHistoricalLikePricingOptions(params, CcuSourceType.PRICE_INCREASE);
}

export function getConcretePricingOptionsForType(
  params: ConcretePricingParams & { sourceType: CcuSourceType }
): CcuConcretePricingOption[] {
  switch (params.sourceType) {
    case CcuSourceType.AVAILABLE_WB:
      return getAvailableWbPricingOptions(params);
    case CcuSourceType.HISTORICAL:
      return getHistoricalPricingOptions(params);
    case CcuSourceType.EXPECTED_WB:
      return getExpectedWbPricingOptions(params);
    case CcuSourceType.PRICE_INCREASE:
      return getPriceIncreasePricingOptions(params);
    default:
      return [];
  }
}

export function getPreferredConcretePricingOption(
  params: ConcretePricingParams & { sourceType: CcuSourceType }
): CcuConcretePricingOption | undefined {
  return getConcretePricingOptionsForType(params)[0];
}

export function findMatchingConcretePricingOption(
  params: ConcretePricingParams & {
    sourceType: CcuSourceType;
    selectedTargetPriceCents?: number;
    selectedSourcePriceCents?: number;
    customPrice?: number;
  }
): CcuConcretePricingOption | undefined {
  const options = getConcretePricingOptionsForType(params);
  if (!options.length) {
    return undefined;
  }

  if (typeof params.selectedTargetPriceCents === 'number') {
    const exactMatch = options.find(option =>
      option.targetPriceCents === params.selectedTargetPriceCents &&
      (
        params.selectedSourcePriceCents === undefined ||
        option.sourcePriceCents === params.selectedSourcePriceCents
      )
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  if (typeof params.customPrice === 'number') {
    const customPriceMatch = options.find(option => option.customPrice === params.customPrice);
    if (customPriceMatch) {
      return customPriceMatch;
    }
  }

  return options[0];
}
