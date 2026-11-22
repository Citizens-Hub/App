import type { CCUItem } from '@/store/upgradesStore';
import type { HangarItem } from '@/types';

export function toPlannerHangarItems(rows: readonly CCUItem[]): HangarItem[] {
  return rows
    .filter(row => !row.isBuyBack && !row.isSubscription)
    .map((row, index) => ({
      id: index,
      name: row.name,
      type: 'ccu',
      fromShip: row.parsed.from,
      toShip: row.parsed.to,
      price: row.value,
      quantity: row.quantity || 1
    }));
}
