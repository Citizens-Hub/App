import type { OrderCheckoutSessionStatus } from '@/types';

const DEFAULT_GOOGLE_ADS_SIGNUP_SEND_TO = 'AW-17708781265/bfJ7CJTBvrIcENGdmvxB';
const DEFAULT_GOOGLE_ADS_ADD_TO_CART_SEND_TO = 'AW-17708781265/0hzHCJHBvrIcENGdmvxB';
const DEFAULT_GOOGLE_ADS_PURCHASE_SEND_TO = 'AW-17708781265/ydRzCJftvakcENGdmvxB';
const DEFAULT_GOOGLE_ADS_EVENT_VALUE = 0;
const DEFAULT_GOOGLE_ADS_EVENT_CURRENCY = 'USD';

const GOOGLE_ADS_SIGNUP_SEND_TO = (
  import.meta.env.VITE_PUBLIC_GOOGLE_ADS_SIGNUP_SEND_TO
  || DEFAULT_GOOGLE_ADS_SIGNUP_SEND_TO
).trim();

const GOOGLE_ADS_ADD_TO_CART_SEND_TO = (
  import.meta.env.VITE_PUBLIC_GOOGLE_ADS_ADD_TO_CART_SEND_TO
  || DEFAULT_GOOGLE_ADS_ADD_TO_CART_SEND_TO
).trim();

const GOOGLE_ADS_PURCHASE_SEND_TO = (
  import.meta.env.VITE_PUBLIC_GOOGLE_ADS_PURCHASE_SEND_TO
  || DEFAULT_GOOGLE_ADS_PURCHASE_SEND_TO
).trim();

type GoogleAdsConversionPayload = {
  sendTo: string;
  value?: number;
  currency?: string;
  transactionId?: string;
};

async function waitForGoogleTag(timeoutMs = 3000) {
  const startedAt = Date.now();

  while ((Date.now() - startedAt) < timeoutMs) {
    if (typeof window.gtag === 'function') {
      return true;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 50);
    });
  }

  return typeof window.gtag === 'function';
}

export async function sendGoogleAdsConversion({
  sendTo,
  value,
  currency,
  transactionId,
}: GoogleAdsConversionPayload) {
  const normalizedSendTo = sendTo.trim();

  if (!normalizedSendTo || normalizedSendTo === '-') {
    console.warn('Google Ads conversion send_to is not configured.');
    return false;
  }

  const isGoogleTagReady = await waitForGoogleTag();
  if (!isGoogleTagReady || !window.gtag) {
    console.warn('Google Ads conversion skipped because gtag is not ready.');
    return false;
  }

  const eventPayload: Record<string, number | string> = {
    send_to: normalizedSendTo,
  };

  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    eventPayload.value = value;
  }

  const normalizedCurrency = currency?.trim().toUpperCase();
  if (normalizedCurrency) {
    eventPayload.currency = normalizedCurrency;
  }

  const normalizedTransactionId = transactionId?.trim();
  if (normalizedTransactionId) {
    eventPayload.transaction_id = normalizedTransactionId;
  }

  window.gtag('event', 'conversion', eventPayload);

  return true;
}

export function sendGoogleAdsSignupConversion() {
  return sendGoogleAdsConversion({
    sendTo: GOOGLE_ADS_SIGNUP_SEND_TO,
    value: DEFAULT_GOOGLE_ADS_EVENT_VALUE,
    currency: DEFAULT_GOOGLE_ADS_EVENT_CURRENCY,
  });
}

export function sendGoogleAdsAddToCartConversion() {
  return sendGoogleAdsConversion({
    sendTo: GOOGLE_ADS_ADD_TO_CART_SEND_TO,
    value: DEFAULT_GOOGLE_ADS_EVENT_VALUE,
    currency: DEFAULT_GOOGLE_ADS_EVENT_CURRENCY,
  });
}

export function sendGoogleAdsPurchaseConversion(checkoutSessionStatus: OrderCheckoutSessionStatus) {
  const amount = checkoutSessionStatus.paymentInfo?.amountTotal ?? checkoutSessionStatus.paymentInfo?.amountCaptured;
  const currency = checkoutSessionStatus.paymentInfo?.currency || 'USD';

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    return Promise.resolve(false);
  }

  return sendGoogleAdsConversion({
    sendTo: GOOGLE_ADS_PURCHASE_SEND_TO,
    value: amount,
    currency,
    transactionId: checkoutSessionStatus.orderId,
  });
}
