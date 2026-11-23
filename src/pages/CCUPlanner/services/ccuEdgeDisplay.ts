import { CcuSourceType, type CcuEdgeData, type HangarItem } from '@/types';
import { getHangarCcuBalances, isReservableHangarItem } from './plannerHangarItems';

export const CCU_OUT_OF_STOCK_COLOR = '#ef4444';

interface EdgeDisplayOptions {
  data: Pick<CcuEdgeData, 'sourceShip' | 'targetShip' | 'sourceType'>;
  price: number;
  isCompleted: boolean;
  hasCompletedHangarAllocation?: boolean;
  isUsedUp?: boolean;
  hangarItems: readonly HangarItem[];
  pooledHangarItems: readonly HangarItem[];
}

export function getCcuEdgeDisplayWarning({ data, price, isCompleted, hasCompletedHangarAllocation, isUsedUp, hangarItems, pooledHangarItems }: EdgeDisplayOptions) {
  if (data.sourceType !== CcuSourceType.HANGER) {
    return { showsPriceWarning: price === 0 && data.targetShip?.msrp !== 0, isHangarOutOfStock: false };
  }

  const { sourceShip, targetShip } = data;
  if (isCompleted && hasCompletedHangarAllocation) {
    return { showsPriceWarning: false, isHangarOutOfStock: false };
  }

  // An old completed edge without an assignable lot still belongs to the completed route,
  // but does not have a verified reservation. Check the whole pool, not the selected owner.
  const checkPool = isCompleted || hangarItems !== pooledHangarItems;
  // A selected account may still show an owned unit when a legacy reservation exhausted the pooled stock.
  const isHangarOutOfStock = (!isCompleted && isUsedUp === true) || (checkPool &&
    sourceShip !== undefined && targetShip !== undefined &&
    !getHangarCcuBalances(sourceShip, targetShip, pooledHangarItems.filter(isReservableHangarItem))
      .some(balance => balance.remaining > 0));
  return { showsPriceWarning: isHangarOutOfStock, isHangarOutOfStock };
}
