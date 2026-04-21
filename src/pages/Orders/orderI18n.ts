import type { IntlShape } from 'react-intl';

import { getMarketItemVisual } from '@/components/marketItemDisplay';
import { OrderStatus, type Order, type OrderItem, type Ship } from '@/types';
import { getShipDisplayName } from '@/utils/shipDisplay';

import {
  formatMarketCcuResourceName,
  formatMarketCreditResourceName,
  formatUsdPrice,
  getMarketPackageKindLabel,
} from '../Market/marketI18n';

type OrderMarketItemLike = OrderItem['marketItem'] | null | undefined;

export function formatOrderUsdPrice(locale: string, value?: number | null) {
  return formatUsdPrice(locale, value);
}

export function getOrderChargedAmount(order: Order) {
  return order.price - order.items.reduce((acc, item) => acc + item.price * (item.cancelledQuantity || 0), 0);
}

export function formatOrderChargedLabel(intl: IntlShape, order: Order) {
  if (order.status === OrderStatus.Paid || order.status === OrderStatus.Finished) {
    return formatOrderUsdPrice(intl.locale, getOrderChargedAmount(order));
  }

  if (order.status === OrderStatus.Canceled) {
    return intl.formatMessage({
      id: 'orders.notCharged',
      defaultMessage: 'Not charged',
    });
  }

  return intl.formatMessage({
    id: 'orders.awaitingPayment',
    defaultMessage: 'Awaiting payment',
  });
}

export function getLocalizedOrderItemShipNames(item: OrderMarketItemLike, ships?: Ship[]) {
  if (!item) {
    return {
      fromShipName: '',
      toShipName: '',
      shipName: '',
    };
  }

  const visual = getMarketItemVisual(item, ships);

  return {
    fromShipName: getShipDisplayName(visual.fromShip) || visual.fromShipName || item.fromShipName || '',
    toShipName: getShipDisplayName(visual.toShip) || visual.toShipName || item.toShipName || '',
    shipName: getShipDisplayName(visual.ship) || visual.shipName || item.shipName || '',
  };
}

export function getOrderItemDisplayName(intl: IntlShape, item: OrderMarketItemLike, ships?: Ship[]) {
  if (!item) {
    return intl.formatMessage({
      id: 'orders.unavailableItem',
      defaultMessage: 'Unavailable or delisted item',
    });
  }

  const { fromShipName, toShipName, shipName } = getLocalizedOrderItemShipNames(item, ships);

  if (item.itemType === 'ccu') {
    return formatMarketCcuResourceName(intl, fromShipName || '-', toShipName || '-');
  }

  if (item.itemType === 'credit') {
    const creditAmount = item.creditAmount ?? item.creditOptions?.[0]?.amount;
    if (typeof creditAmount === 'number') {
      return formatMarketCreditResourceName(intl, creditAmount);
    }
  }

  if ((item.itemType === 'package' && item.packageKind === 'standalone_ship') || item.itemType === 'misc') {
    if (shipName) {
      return shipName;
    }
  }

  return item.name || item.skuId || intl.formatMessage({
    id: 'orders.unavailableItem',
    defaultMessage: 'Unavailable or delisted item',
  });
}

export function formatOrderCcuRoute(intl: IntlShape, item: OrderMarketItemLike, ships?: Ship[]) {
  const { fromShipName, toShipName } = getLocalizedOrderItemShipNames(item, ships);

  if (!fromShipName && !toShipName) {
    return '';
  }

  return intl.formatMessage(
    { id: 'orders.ccuRoute', defaultMessage: '{fromShipName} → {toShipName}' },
    {
      fromShipName: fromShipName || '-',
      toShipName: toShipName || '-',
    },
  );
}

export function formatOrderPackageSummary(intl: IntlShape, item: OrderMarketItemLike) {
  if (!item || item.itemType !== 'package') {
    return '';
  }

  return [getMarketPackageKindLabel(intl, item.packageKind), item.insuranceType]
    .filter(Boolean)
    .join(' · ');
}

export function formatOrderLeadSummary(intl: IntlShape, count: number) {
  return intl.formatMessage(
    {
      id: 'orders.orderLeadSummary',
      defaultMessage: '{count, plural, one {# item in this order} other {# items in this order}}',
    },
    { count },
  );
}

export function formatOrderItemQuantitySummary(
  intl: IntlShape,
  active: number,
  total: number,
  price: number,
) {
  return intl.formatMessage(
    {
      id: 'orders.itemQuantitySummary',
      defaultMessage: '{active} / {total} · {price} each',
    },
    {
      active,
      total,
      price: formatOrderUsdPrice(intl.locale, price),
    },
  );
}

export function formatOrderMoreItemsLabel(intl: IntlShape, count: number) {
  return intl.formatMessage(
    {
      id: 'orders.moreItems',
      defaultMessage: '+ {count, plural, one {# more item} other {# more items}}',
    },
    { count },
  );
}

export function formatOrderItemCountLabel(intl: IntlShape, count: number) {
  return intl.formatMessage(
    {
      id: 'orderDetail.itemCountSummary',
      defaultMessage: '{count, plural, one {# item} other {# items}}',
    },
    { count },
  );
}

export function formatOrderActiveItemsSummary(intl: IntlShape, active: number, total: number) {
  return intl.formatMessage(
    {
      id: 'orderDetail.activeItemsSummary',
      defaultMessage: '{active} / {total} active',
    },
    {
      active,
      total,
    },
  );
}
