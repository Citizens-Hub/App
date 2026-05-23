import type { IntlShape } from 'react-intl';

import { getMarketItemVisual } from '@/components/marketItemDisplay';
import type { ListingItem, Ship } from '@/types';
import { getShipDisplayName } from '@/utils/shipDisplay';

import { isStandaloneShipPackage } from './marketUtils';
import {
  formatCreditAmountSummary,
  formatCreditFaceValueSummary,
  formatMarketCcuResourceName,
  formatPackageContentsSummary,
  getMarketPackageKindLabel,
  formatMarketCreditName,
} from './marketI18n';

export function getLocalizedMarketItemShipNames(item: ListingItem, ships?: Ship[]) {
  const visual = getMarketItemVisual(item, ships);

  return {
    fromShipName: getShipDisplayName(visual.fromShip) || visual.fromShipName || item.fromShipName || '',
    toShipName: getShipDisplayName(visual.toShip) || visual.toShipName || item.toShipName || '',
    shipName: getShipDisplayName(visual.ship) || visual.shipName || item.shipName || '',
  };
}

export function getMarketItemDisplayName(intl: IntlShape, item: ListingItem, ships?: Ship[]) {
  const { fromShipName, toShipName, shipName } = getLocalizedMarketItemShipNames(item, ships);

  if (item.itemType === 'ccu') {
    return formatMarketCcuResourceName(intl, fromShipName || '-', toShipName || '-');
  }

  if (item.itemType === 'credit') {
    const creditAmount = item.creditAmount ?? item.creditOptions?.[0]?.amount;
    if (typeof creditAmount === 'number') {
      return formatMarketCreditName(intl);
    }
  }

  if ((isStandaloneShipPackage(item) || item.itemType === 'misc') && shipName) {
    return shipName;
  }

  return item.name;
}

export function getMarketItemSummary(
  intl: IntlShape,
  item: ListingItem,
  ships?: Ship[],
  // options?: { variantCount?: number | null },
) {
  const { fromShipName, toShipName, shipName } = getLocalizedMarketItemShipNames(item, ships);
  // const variantCount = options?.variantCount;

  if (item.itemType === 'ccu') {
    const parts = [
      `${fromShipName || '-'} → ${toShipName || '-'}`,
      // typeof variantCount === 'number' && variantCount > 1
      //   ? intl.formatMessage(
      //       { id: 'market.ccu.variantCount', defaultMessage: '{count, plural, one {# variant} other {# variants}}' },
      //       { count: variantCount },
      //     )
      //   : null,
    ].filter(Boolean);

    return parts.join(' · ');
  }

  if (item.itemType === 'package') {
    const parts = [
      shipName || item.shipName,
      getMarketPackageKindLabel(intl, item.packageKind),
      item.insuranceType,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(' · ');
    }

    const shipCount = item.packageShips?.length || 0;
    const extraCount = item.packageItems?.length || 0;
    if (shipCount || extraCount) {
      return formatPackageContentsSummary(intl, shipCount, extraCount);
    }
  }

  if (item.itemType === 'credit') {
    const minAmount = item.creditOptions?.[0]?.amount;
    const maxAmount = item.creditOptions?.[item.creditOptions.length - 1]?.amount;
    const parts = [
      typeof minAmount === 'number' && typeof maxAmount === 'number'
        ? formatCreditFaceValueSummary(intl, minAmount, maxAmount)
        : null,
      item.creditOptions?.length ? formatCreditAmountSummary(intl, item.creditOptions.length) : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(' · ');
    }
  }

  return item.description || item.externalRef || '';
}
