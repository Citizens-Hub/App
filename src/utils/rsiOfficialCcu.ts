import { Ccu, CcuEdgeData, CcuSourceType } from '@/types';
import { requestViaExtension } from '@/utils/extensionHttpRequest';

const RSI_SET_AUTH_TOKEN_URL = 'https://robertsspaceindustries.com/api/account/v2/setAuthToken';
const RSI_SET_UPGRADE_CONTEXT_TOKEN_URL = 'https://robertsspaceindustries.com/api/ship-upgrades/setContextToken';
const RSI_UPGRADE_GRAPHQL_URL = 'https://robertsspaceindustries.com/pledge-store/api/upgrade/graphql';
const RSI_CART_TOKEN_URL = 'https://robertsspaceindustries.com/api/store/v2/cart/token';
const DEFAULT_EXTENSION_TIMEOUT_MS = 20_000;

type RsiAddToCartEnvelope = {
  data?: Array<{
    data?: {
      addToCart?: {
        jwt?: string | null;
      } | null;
    } | null;
    errors?: Array<{
      message?: string;
    }> | null;
  } | null> | null;
};

export type ResolvedCurrentRsiCcuSku = {
  skuId: number;
  targetPriceCents: number;
};

function getTargetCcuSkus(targetShipId: number | undefined, ccus: Ccu[]) {
  if (!targetShipId) {
    return [];
  }

  return ccus.find((entry) => entry.id === targetShipId)?.skus || [];
}

function formatGraphqlErrors(errors?: Array<{ message?: string }> | null) {
  const messages = (errors || [])
    .map((entry) => entry.message?.trim())
    .filter((value): value is string => Boolean(value));

  return messages.length ? messages.join('\n') : 'RSI upgrade add-to-cart failed.';
}

export function resolveCurrentRsiCcuSkuForEdge(
  edgeData: Pick<
    CcuEdgeData,
    'sourceShip' | 'targetShip' | 'sourceType' | 'selectedTargetPriceCents'
  > | null | undefined,
  ccus: Ccu[],
): ResolvedCurrentRsiCcuSku | null {
  const sourceShip = edgeData?.sourceShip;
  const targetShip = edgeData?.targetShip;
  const sourceType = edgeData?.sourceType ?? CcuSourceType.OFFICIAL;

  if (!sourceShip?.id || !targetShip?.id) {
    return null;
  }

  if (sourceShip.msrp < 2000) {
    return null;
  }

  const availableSkus = getTargetCcuSkus(targetShip.id, ccus)
    .filter((sku) => sku.available && sku.price > sourceShip.msrp);

  if (!availableSkus.length) {
    return null;
  }

  if (sourceType === CcuSourceType.OFFICIAL) {
    const officialSku = availableSkus.find((sku) => sku.price === targetShip.msrp);
    if (!officialSku) {
      return null;
    }

    return {
      skuId: officialSku.id,
      targetPriceCents: officialSku.price,
    };
  }

  if (sourceType === CcuSourceType.AVAILABLE_WB) {
    if (typeof edgeData?.selectedTargetPriceCents === 'number') {
      const exactSku = availableSkus.find((sku) => sku.price === edgeData.selectedTargetPriceCents);
      if (exactSku) {
        return {
          skuId: exactSku.id,
          targetPriceCents: exactSku.price,
        };
      }
    }

    const cheapestWbSku = availableSkus
      .filter((sku) => sku.price < targetShip.msrp)
      .sort((left, right) => left.price - right.price)[0];

    if (!cheapestWbSku) {
      return null;
    }

    return {
      skuId: cheapestWbSku.id,
      targetPriceCents: cheapestWbSku.price,
    };
  }

  if (
    sourceType === CcuSourceType.OFFICIAL_WB
    && typeof edgeData?.selectedTargetPriceCents === 'number'
  ) {
    const exactManualWbSku = availableSkus.find((sku) => sku.price === edgeData.selectedTargetPriceCents);
    if (!exactManualWbSku) {
      return null;
    }

    return {
      skuId: exactManualWbSku.id,
      targetPriceCents: exactManualWbSku.price,
    };
  }

  return null;
}

async function postJsonViaExtension(
  url: string,
  data: null | object | object[],
  options: {
    timeoutMs?: number;
    timeoutMessage?: string;
    requestIdPrefix: string;
  },
) {
  return requestViaExtension({
    url,
    responseType: 'json',
    method: 'post',
    data,
  }, {
    timeoutMs: options.timeoutMs ?? DEFAULT_EXTENSION_TIMEOUT_MS,
    timeoutMessage: options.timeoutMessage,
    requestIdPrefix: options.requestIdPrefix,
  });
}

export async function addRsiOfficialCcuToCartViaExtension(
  params: {
    fromShipId: number;
    toSkuId: number;
  },
  options: {
    timeoutMs?: number;
    requestIdPrefix?: string;
    timeoutMessage?: string;
  } = {},
) {
  const requestIdPrefix = options.requestIdPrefix || 'rsi-official-ccu-add-to-cart';
  const timeoutMs = options.timeoutMs ?? DEFAULT_EXTENSION_TIMEOUT_MS;
  const timeoutMessage = options.timeoutMessage || 'The browser extension request timed out while adding a CCU to the RSI cart.';

  await postJsonViaExtension(
    RSI_SET_AUTH_TOKEN_URL,
    null,
    {
      timeoutMs,
      timeoutMessage,
      requestIdPrefix: `${requestIdPrefix}-set-auth-token`,
    },
  );

  await postJsonViaExtension(
    RSI_SET_UPGRADE_CONTEXT_TOKEN_URL,
    {},
    {
      timeoutMs,
      timeoutMessage,
      requestIdPrefix: `${requestIdPrefix}-set-context-token`,
    },
  );

  const addToCartResponse = await postJsonViaExtension(
    RSI_UPGRADE_GRAPHQL_URL,
    [{
      operationName: 'addToCart',
      variables: {
        from: params.fromShipId,
        to: params.toSkuId,
      },
      query: 'mutation addToCart($from: Int!, $to: Int!) {\n  addToCart(from: $from, to: $to) {\n    jwt\n  }\n}\n',
    }],
    {
      timeoutMs,
      timeoutMessage,
      requestIdPrefix: `${requestIdPrefix}-graphql`,
    },
  ) as RsiAddToCartEnvelope;

  const batchItem = Array.isArray(addToCartResponse.data) ? addToCartResponse.data[0] : null;
  if (batchItem?.errors?.length) {
    throw new Error(formatGraphqlErrors(batchItem.errors));
  }

  const jwt = batchItem?.data?.addToCart?.jwt?.trim() || '';
  if (!jwt) {
    throw new Error('RSI upgrade add-to-cart did not return a cart JWT.');
  }

  await postJsonViaExtension(
    RSI_CART_TOKEN_URL,
    { jwt },
    {
      timeoutMs,
      timeoutMessage,
      requestIdPrefix: `${requestIdPrefix}-cart-token`,
    },
  );

  return {
    jwt,
  };
}
