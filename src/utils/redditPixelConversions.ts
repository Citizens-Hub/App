import type { OrderCheckoutSessionStatus } from '@/types';

const DEFAULT_REDDIT_PIXEL_SIGNUP_EVENT_NAME = 'SignUp';
const DEFAULT_REDDIT_PIXEL_ADD_TO_CART_EVENT_NAME = 'AddToCart';
const DEFAULT_REDDIT_PIXEL_PURCHASE_EVENT_NAME = 'Purchase';
const DEFAULT_REDDIT_PIXEL_CURRENCY = 'USD';

const REDDIT_PIXEL_SIGNUP_EVENT_NAME = (
  import.meta.env.VITE_PUBLIC_REDDIT_PIXEL_SIGNUP_EVENT_NAME
  || DEFAULT_REDDIT_PIXEL_SIGNUP_EVENT_NAME
).trim();

const REDDIT_PIXEL_ADD_TO_CART_EVENT_NAME = (
  import.meta.env.VITE_PUBLIC_REDDIT_PIXEL_ADD_TO_CART_EVENT_NAME
  || DEFAULT_REDDIT_PIXEL_ADD_TO_CART_EVENT_NAME
).trim();

const REDDIT_PIXEL_PURCHASE_EVENT_NAME = (
  import.meta.env.VITE_PUBLIC_REDDIT_PIXEL_PURCHASE_EVENT_NAME
  || DEFAULT_REDDIT_PIXEL_PURCHASE_EVENT_NAME
).trim();

type RedditPixelConversionPayload = {
  eventName: string;
  conversionId: string;
  value?: number;
  currency?: string;
};

function createUniqueId() {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return randomId;
}

function createConversionId(prefix: string, stableId?: string | null) {
  const normalizedStableId = stableId?.trim();
  if (normalizedStableId) {
    return `${prefix}:${normalizedStableId}`;
  }

  const randomId = createUniqueId();

  return `${prefix}:${randomId}`;
}

function createEventConversionId(prefix: string, contextId?: string | null) {
  const normalizedContextId = contextId?.trim();
  if (normalizedContextId) {
    return `${prefix}:${normalizedContextId}:${createUniqueId()}`;
  }

  return createConversionId(prefix);
}

async function waitForRedditPixel(timeoutMs = 3000) {
  const startedAt = Date.now();

  while ((Date.now() - startedAt) < timeoutMs) {
    if (typeof window.rdt === 'function') {
      return true;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 50);
    });
  }

  return typeof window.rdt === 'function';
}

export async function sendRedditPixelConversion({
  eventName,
  conversionId,
  value,
  currency,
}: RedditPixelConversionPayload) {
  const normalizedEventName = eventName.trim();
  const normalizedConversionId = conversionId.trim();

  if (!normalizedEventName || !normalizedConversionId) {
    console.warn('Reddit Pixel conversion skipped because eventName or conversionId is missing.');
    return false;
  }

  const isRedditPixelReady = await waitForRedditPixel();
  if (!isRedditPixelReady || !window.rdt) {
    console.warn('Reddit Pixel conversion skipped because rdt is not ready.');
    return false;
  }

  const eventPayload: Record<string, number | string> = {
    conversionId: normalizedConversionId,
  };

  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    eventPayload.value = value;
  }

  const normalizedCurrency = currency?.trim().toUpperCase();
  if (normalizedCurrency) {
    eventPayload.currency = normalizedCurrency;
  }

  window.rdt('track', normalizedEventName, eventPayload);

  return true;
}

export function sendRedditPixelSignupConversion(userId?: string | null) {
  return sendRedditPixelConversion({
    eventName: REDDIT_PIXEL_SIGNUP_EVENT_NAME,
    conversionId: createConversionId('signup', userId),
  });
}

export function sendRedditPixelAddToCartConversion(resourceId?: string | null) {
  return sendRedditPixelConversion({
    eventName: REDDIT_PIXEL_ADD_TO_CART_EVENT_NAME,
    conversionId: createEventConversionId('add-to-cart', resourceId),
  });
}

export function sendRedditPixelPurchaseConversion(checkoutSessionStatus: OrderCheckoutSessionStatus) {
  const amount = checkoutSessionStatus.paymentInfo?.amountTotal ?? checkoutSessionStatus.paymentInfo?.amountCaptured;
  const currency = checkoutSessionStatus.paymentInfo?.currency || DEFAULT_REDDIT_PIXEL_CURRENCY;

  return sendRedditPixelConversion({
    eventName: REDDIT_PIXEL_PURCHASE_EVENT_NAME,
    conversionId: createConversionId('purchase', checkoutSessionStatus.orderId),
    value: typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : undefined,
    currency,
  });
}
