const GOOGLE_CUSTOMER_REVIEWS_BADGE_SCRIPT_ID = 'merchantWidgetScript';
const GOOGLE_CUSTOMER_REVIEWS_BADGE_SCRIPT_SRC = 'https://www.gstatic.com/shopping/merchant/merchantwidget.js';
const GOOGLE_CUSTOMER_REVIEWS_PLATFORM_SCRIPT_ID = 'googleCustomerReviewsPlatformScript';
const GOOGLE_CUSTOMER_REVIEWS_PLATFORM_SCRIPT_SRC = 'https://apis.google.com/js/platform.js';
const GOOGLE_CUSTOMER_REVIEWS_OPT_IN_TRACK_PREFIX = 'google-customer-reviews:opt-in:';
const DEFAULT_GOOGLE_CUSTOMER_REVIEWS_DELIVERY_DAYS = 1;
const scriptLoaders = new Map<string, Promise<void>>();

let googleCustomerReviewsBadgeStarted = false;

function parseMerchantId(rawValue: string | undefined) {
  const normalizedValue = rawValue?.trim() || '';
  if (!normalizedValue) {
    return null;
  }

  const merchantId = Number(normalizedValue);
  if (!Number.isInteger(merchantId) || merchantId <= 0) {
    console.warn('Google Customer Reviews merchant ID is invalid:', normalizedValue);
    return null;
  }

  return merchantId;
}

function readDeliveryDays(rawValue: string | undefined) {
  const normalizedValue = rawValue?.trim() || '';
  if (!normalizedValue) {
    return DEFAULT_GOOGLE_CUSTOMER_REVIEWS_DELIVERY_DAYS;
  }

  const deliveryDays = Number(normalizedValue);
  if (!Number.isFinite(deliveryDays) || deliveryDays <= 0) {
    return DEFAULT_GOOGLE_CUSTOMER_REVIEWS_DELIVERY_DAYS;
  }

  return Math.ceil(deliveryDays);
}

function getScriptPromise(scriptId: string, scriptSrc: string) {
  const existingPromise = scriptLoaders.get(scriptId);
  if (existingPromise) {
    return existingPromise;
  }

  const loaderPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        resolve();
        return;
      }

      const handleLoad = () => {
        existingScript.dataset.loaded = 'true';
        resolve();
      };
      const handleError = () => {
        reject(new Error(`Failed to load script: ${scriptSrc}`));
      };

      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = scriptSrc;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      reject(new Error(`Failed to load script: ${scriptSrc}`));
    }, { once: true });
    document.head.appendChild(script);
  });

  scriptLoaders.set(scriptId, loaderPromise);
  return loaderPromise;
}

function waitForSurveyOptInModule(timeoutMs = 5000) {
  const gapi = window.gapi;
  if (!gapi?.load) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);

    gapi.load('surveyoptin', () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      resolve(Boolean(window.gapi?.surveyoptin?.render));
    });
  });
}

function hasTrackedGoogleCustomerReviewsOptIn(checkoutSessionId?: string | null) {
  if (!checkoutSessionId) {
    return false;
  }

  return window.sessionStorage.getItem(`${GOOGLE_CUSTOMER_REVIEWS_OPT_IN_TRACK_PREFIX}${checkoutSessionId}`) === '1';
}

function markGoogleCustomerReviewsOptInTracked(checkoutSessionId?: string | null) {
  if (!checkoutSessionId) {
    return;
  }

  window.sessionStorage.setItem(`${GOOGLE_CUSTOMER_REVIEWS_OPT_IN_TRACK_PREFIX}${checkoutSessionId}`, '1');
}

export type GoogleCustomerReviewsOptInPayload = {
  checkoutSessionId?: string | null;
  orderId: string;
  email?: string | null;
  deliveryCountry?: string | null;
  estimatedDeliveryDate?: string | null;
  products?: Array<{ gtin: string }>;
};

export function getGoogleCustomerReviewsMerchantId() {
  return parseMerchantId(import.meta.env.VITE_PUBLIC_GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID);
}

export function isGoogleCustomerReviewsEnabled() {
  return getGoogleCustomerReviewsMerchantId() !== null;
}

export function getGoogleCustomerReviewsDeliveryDays() {
  return readDeliveryDays(import.meta.env.VITE_PUBLIC_GOOGLE_CUSTOMER_REVIEWS_DELIVERY_DAYS);
}

export function formatGoogleCustomerReviewsDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function startGoogleCustomerReviewsBadge() {
  const merchantId = getGoogleCustomerReviewsMerchantId();
  if (!merchantId || googleCustomerReviewsBadgeStarted) {
    return false;
  }

  try {
    await getScriptPromise(
      GOOGLE_CUSTOMER_REVIEWS_BADGE_SCRIPT_ID,
      GOOGLE_CUSTOMER_REVIEWS_BADGE_SCRIPT_SRC,
    );
  } catch (error) {
    console.warn('Failed to load Google Customer Reviews badge script.', error);
    return false;
  }

  if (!window.merchantwidget?.start) {
    return false;
  }

  const position = import.meta.env.VITE_PUBLIC_GOOGLE_CUSTOMER_REVIEWS_BADGE_POSITION?.trim() || 'BOTTOM_RIGHT';
  const region = import.meta.env.VITE_PUBLIC_GOOGLE_CUSTOMER_REVIEWS_BADGE_REGION?.trim() || undefined;

  googleCustomerReviewsBadgeStarted = true;
  window.merchantwidget.start({
    merchant_id: merchantId,
    position,
    ...(region ? { region } : {}),
  });

  return true;
}

export async function renderGoogleCustomerReviewsOptIn(payload: GoogleCustomerReviewsOptInPayload) {
  const merchantId = getGoogleCustomerReviewsMerchantId();
  if (!merchantId) {
    return false;
  }

  if (hasTrackedGoogleCustomerReviewsOptIn(payload.checkoutSessionId)) {
    return true;
  }

  const orderId = payload.orderId.trim();
  const email = payload.email?.trim() || '';
  const deliveryCountry = payload.deliveryCountry?.trim().toUpperCase() || '';
  const estimatedDeliveryDate = payload.estimatedDeliveryDate?.trim() || '';

  if (!orderId || !email || !deliveryCountry || !estimatedDeliveryDate) {
    return false;
  }

  try {
    await getScriptPromise(
      GOOGLE_CUSTOMER_REVIEWS_PLATFORM_SCRIPT_ID,
      GOOGLE_CUSTOMER_REVIEWS_PLATFORM_SCRIPT_SRC,
    );
  } catch (error) {
    console.warn('Failed to load Google Customer Reviews opt-in script.', error);
    return false;
  }

  const surveyOptInReady = await waitForSurveyOptInModule();
  if (!surveyOptInReady || !window.gapi?.surveyoptin?.render) {
    return false;
  }

  window.gapi.surveyoptin.render({
    merchant_id: merchantId,
    order_id: orderId,
    email,
    delivery_country: deliveryCountry,
    estimated_delivery_date: estimatedDeliveryDate,
    ...(payload.products?.length ? { products: payload.products } : {}),
  });

  markGoogleCustomerReviewsOptInTracked(payload.checkoutSessionId);
  return true;
}
