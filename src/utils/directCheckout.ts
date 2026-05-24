import { MarketCartItem } from '@/types';

const DIRECT_CHECKOUT_ITEMS_STORAGE_KEY = 'checkout:direct-items';
export const DIRECT_CHECKOUT_SEARCH_PARAM = 'direct';

export function getDirectCheckoutPath() {
  return `/checkout?${DIRECT_CHECKOUT_SEARCH_PARAM}=1`;
}

export function saveDirectCheckoutItems(items: MarketCartItem[]) {
  try {
    window.sessionStorage.setItem(DIRECT_CHECKOUT_ITEMS_STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('Failed to save direct checkout items:', error);
  }
}

export function readDirectCheckoutItems(): MarketCartItem[] {
  try {
    const rawValue = window.sessionStorage.getItem(DIRECT_CHECKOUT_ITEMS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter((item): item is MarketCartItem => (
      Boolean(item)
        && typeof item === 'object'
        && typeof (item as Partial<MarketCartItem>).skuId === 'string'
        && typeof (item as Partial<MarketCartItem>).quantity === 'number'
    ));
  } catch (error) {
    console.warn('Failed to read direct checkout items:', error);
    return [];
  }
}

export function clearDirectCheckoutItems() {
  try {
    window.sessionStorage.removeItem(DIRECT_CHECKOUT_ITEMS_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear direct checkout items:', error);
  }
}
