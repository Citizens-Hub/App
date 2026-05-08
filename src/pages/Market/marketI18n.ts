import type { IntlShape } from 'react-intl';

import type { MarketBrowseCategory, MarketItemType, MarketSkuTagCode } from '@/types';

const USD_CURRENCY_OPTIONS = {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} as const;

export function formatUsdPrice(locale: string, value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return value.toLocaleString(locale, USD_CURRENCY_OPTIONS);
}

export function getMarketItemTypeLabel(intl: IntlShape, itemType?: MarketItemType | string | null) {
  switch (itemType) {
    case 'ccu':
      return intl.formatMessage({ id: 'market.filter.ccu', defaultMessage: 'CCU' });
    case 'package':
      return intl.formatMessage({ id: 'market.filter.package', defaultMessage: 'Package' });
    case 'credit':
      return intl.formatMessage({ id: 'market.filter.credit', defaultMessage: 'Credit' });
    case 'misc':
      return intl.formatMessage({ id: 'market.filter.misc', defaultMessage: 'Misc' });
    default:
      return itemType || '';
  }
}

export function getMarketPackageKindLabel(intl: IntlShape, packageKind?: string | null) {
  switch (packageKind) {
    case 'standalone_ship':
      return intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' });
    case 'bundle':
      return intl.formatMessage({ id: 'market.filter.bundle', defaultMessage: 'Bundle' });
    default:
      return packageKind || '';
  }
}

export function getMarketBrowseCategoryLabel(intl: IntlShape, browseCategory?: MarketBrowseCategory | string | null) {
  switch (browseCategory) {
    case 'standalone_ship':
      return intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' });
    case 'ship_package':
      return intl.formatMessage({ id: 'market.filter.shipPackage', defaultMessage: 'Ship Package' });
    case 'paint':
      return intl.formatMessage({ id: 'market.filter.paint', defaultMessage: 'Paint' });
    case 'other':
      return intl.formatMessage({ id: 'market.filter.other', defaultMessage: 'Other' });
    default:
      return browseCategory || '';
  }
}

export function getMarketTagLabel(intl: IntlShape, tag?: MarketSkuTagCode | string | null) {
  switch (tag) {
    case 'oc':
      return intl.formatMessage({ id: 'market.tag.oc', defaultMessage: 'OC' });
    case 'concierge':
      return intl.formatMessage({ id: 'market.tag.concierge', defaultMessage: 'Concierge' });
    default:
      return tag ? tag.toUpperCase() : '';
  }
}

export function formatMarketShipCount(intl: IntlShape, count: number) {
  return intl.formatMessage(
    { id: 'market.detail.shipCount', defaultMessage: '{count, plural, one {# ship} other {# ships}}' },
    { count },
  );
}

export function formatMarketExtraCount(intl: IntlShape, count: number) {
  return intl.formatMessage(
    { id: 'market.detail.extraCount', defaultMessage: '{count, plural, one {# extra} other {# extras}}' },
    { count },
  );
}

export function formatPackageContentsSummary(intl: IntlShape, shipCount: number, extraCount: number) {
  return [
    shipCount > 0 ? formatMarketShipCount(intl, shipCount) : null,
    extraCount > 0 ? formatMarketExtraCount(intl, extraCount) : null,
  ].filter(Boolean).join(' · ');
}

export function formatCreditAmountSummary(intl: IntlShape, count: number) {
  return intl.formatMessage(
    { id: 'market.credit.amountSummary', defaultMessage: '{count, plural, one {# amount} other {# amounts}}' },
    { count },
  );
}

export function formatCreditFaceValueSummary(intl: IntlShape, minAmount: number, maxAmount: number) {
  if (minAmount === maxAmount) {
    return intl.formatMessage(
      { id: 'market.credit.selectedFaceValue', defaultMessage: 'Selected face value {amount}' },
      { amount: formatUsdPrice(intl.locale, minAmount) },
    );
  }

  return intl.formatMessage(
    { id: 'market.credit.supportedFaceValues', defaultMessage: 'Supported face values {min} - {max}' },
    {
      min: formatUsdPrice(intl.locale, minAmount),
      max: formatUsdPrice(intl.locale, maxAmount),
    },
  );
}

export function formatCreditOptionLabel(intl: IntlShape, amount: number, price: number) {
  return intl.formatMessage(
    { id: 'market.credit.optionLabel', defaultMessage: '{amount} for {price}' },
    {
      amount: formatUsdPrice(intl.locale, amount),
      price: formatUsdPrice(intl.locale, price),
    },
  );
}

export function formatCreditPriceFormula(intl: IntlShape, amount: number, discountRateBps: number) {
  return intl.formatMessage(
    { id: 'market.credit.priceFormula', defaultMessage: '{minimumCharge} + {discountRate} × ({faceValue} - {minimumCharge})' },
    {
      minimumCharge: formatUsdPrice(intl.locale, 20),
      discountRate: (discountRateBps / 10000).toLocaleString(intl.locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      faceValue: formatUsdPrice(intl.locale, amount),
    },
  );
}

export function formatMarketPriceFrom(intl: IntlShape, price: number) {
  return intl.formatMessage(
    { id: 'market.price.from', defaultMessage: 'From {price}' },
    { price: formatUsdPrice(intl.locale, price) },
  );
}

export function formatMarketCcuResourceName(intl: IntlShape, fromShipName: string, toShipName: string) {
  return intl.formatMessage(
    { id: 'market.ccu.resourceName', defaultMessage: 'Upgrade - {fromShipName} to {toShipName}' },
    { fromShipName, toShipName },
  );
}

export function formatMarketDiscount(intl: IntlShape, discount: number | string) {
  return intl.formatMessage(
    { id: 'market.discountOff', defaultMessage: '{discount}% off' },
    { discount },
  );
}

export function formatMarketCreditName(intl: IntlShape) {
  return intl.formatMessage(
    { id: 'market.credit.name', defaultMessage: 'Store Credit' },
  );
}

export function formatMarketCreditResourceName(intl: IntlShape, amount: number) {
  return intl.formatMessage(
    { id: 'market.credit.resourceName', defaultMessage: 'Store Credit {amount}' },
    { amount: formatUsdPrice(intl.locale, amount) },
  );
}

export function formatMarketSellerFallbackName(intl: IntlShape, sellerId: string) {
  return intl.formatMessage(
    { id: 'market.sellerFallbackName', defaultMessage: 'Seller {sellerId}' },
    { sellerId },
  );
}
