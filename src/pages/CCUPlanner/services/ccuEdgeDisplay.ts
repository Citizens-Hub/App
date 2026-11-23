import { CcuSourceType, type CcuEdgeData, type HangarItem } from '@/types';
import { getHangarCcuBalances } from './plannerHangarItems';

export const CCU_OUT_OF_STOCK_COLOR = '#ef4444';

interface EdgeDisplayOptions {
  data: Pick<CcuEdgeData, 'sourceShip' | 'targetShip' | 'sourceType'>;
  price: number;
  isCompleted: boolean;
  isUsedUp?: boolean;
  hangarItems: readonly HangarItem[];
  pooledHangarItems: readonly HangarItem[];
}

export function getCcuEdgeDisplayWarning({ data, price, isCompleted, isUsedUp, hangarItems, pooledHangarItems }: EdgeDisplayOptions) {
  if (data.sourceType !== CcuSourceType.HANGER) {
    return { showsPriceWarning: price === 0 && data.targetShip?.msrp !== 0, isHangarOutOfStock: false };
  }

  const { sourceShip, targetShip } = data;
  // A selected account may still show an owned unit when a legacy reservation exhausted the pooled stock.
  const isHangarOutOfStock = !isCompleted && (isUsedUp === true || (
    hangarItems !== pooledHangarItems && sourceShip !== undefined && targetShip !== undefined &&
    !getHangarCcuBalances(sourceShip, targetShip, pooledHangarItems).some(balance => balance.remaining > 0)
  ));
  return { showsPriceWarning: isHangarOutOfStock, isHangarOutOfStock };
}
