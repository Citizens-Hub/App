import { useMemo } from 'react';
import useSWR from 'swr';
import { CartItem, MarketCartItem } from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export interface MarketCartValidationItem {
  skuId: string;
  requestedQuantity: number;
  availableStock: number;
  valid: boolean;
  reason?: 'unavailable' | 'out_of_stock' | 'insufficient_stock' | string | null;
}

export interface MarketCartValidationResponse {
  items: MarketCartValidationItem[];
}

type CartValidationInputItem = {
  skuId: string;
  quantity: number;
};

function normalizeCartItems(items: Array<CartItem | MarketCartItem>): CartValidationInputItem[] {
  return items
    .map((item) => {
      if ('resource' in item) {
        return {
          skuId: item.resource.id,
          quantity: item.quantity || 1,
        };
      }

      return {
        skuId: item.skuId,
        quantity: item.quantity || 1,
      };
    })
    .filter((item) => item.skuId);
}

export function useMarketCartValidation(
  items: Array<CartItem | MarketCartItem>,
  options?: { enabled?: boolean },
) {
  const normalizedItems = useMemo(() => normalizeCartItems(items), [items]);
  const enabled = options?.enabled !== false && normalizedItems.length > 0;
  const requestKey = enabled
    ? [
        `${API_BASE_URL}/api/market/cart/validate`,
        normalizedItems.map((item) => `${item.skuId}:${item.quantity}`).sort().join('|'),
      ] as const
    : null;

  const result = useSWR<MarketCartValidationResponse>(requestKey, async ([url]) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: normalizedItems,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cart validation failed: ${response.status}`);
    }

    return response.json();
  }, {
    revalidateOnFocus: true,
    refreshInterval: 30_000,
  });

  const itemMap = useMemo(() => new Map(
    (result.data?.items || []).map((item) => [item.skuId, item]),
  ), [result.data]);
  const invalidItems = result.data?.items.filter((item) => !item.valid) || [];

  return {
    ...result,
    itemMap,
    invalidItems,
    hasInvalidItems: invalidItems.length > 0,
  };
}

