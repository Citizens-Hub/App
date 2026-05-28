export type PushSubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'not_configured' | 'permission_denied' | 'service_worker_unavailable' | 'request_failed' };

interface VapidPublicKeyResponse {
  configured?: boolean;
  publicKey?: string | null;
}

function base64urlToUint8Array(base64url: string): Uint8Array {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4);
  const binary = window.atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function isPushNotificationSupported() {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

async function getVapidPublicKey(apiBaseUrl: string): Promise<string | null> {
  const response = await fetch(`${apiBaseUrl}/api/push/vapid-public-key`);

  if (!response.ok) {
    throw new Error(`Failed to load VAPID public key: ${response.status}`);
  }

  const data = await response.json() as VapidPublicKeyResponse;

  return data.configured && data.publicKey ? data.publicKey : null;
}

function normalizePushSubscription(subscription: PushSubscription) {
  const subscriptionJson = subscription.toJSON();

  return {
    endpoint: subscriptionJson.endpoint,
    expirationTime: subscriptionJson.expirationTime ?? null,
    keys: subscriptionJson.keys,
  };
}

async function postSubscription(apiBaseUrl: string, token: string, subscription: PushSubscription) {
  const response = await fetch(`${apiBaseUrl}/api/push/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(normalizePushSubscription(subscription)),
  });

  if (!response.ok) {
    throw new Error(`Failed to save push subscription: ${response.status}`);
  }
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  return Notification.permission;
}

export async function enableOrderPushNotifications(apiBaseUrl: string, token: string): Promise<PushSubscribeResult> {
  if (!isPushNotificationSupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'permission_denied' };
  }

  try {
    const vapidPublicKey = await getVapidPublicKey(apiBaseUrl);
    if (!vapidPublicKey) {
      return { ok: false, reason: 'not_configured' };
    }

    const registration = await navigator.serviceWorker.ready;
    if (!registration.pushManager) {
      return { ok: false, reason: 'service_worker_unavailable' };
    }

    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription = existingSubscription || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64urlToUint8Array(vapidPublicKey),
    });

    await postSubscription(apiBaseUrl, token, subscription);

    return { ok: true };
  } catch (error) {
    console.warn('[PushNotifications] Failed to enable order push notifications.', error);
    return { ok: false, reason: 'request_failed' };
  }
}

export async function disableOrderPushNotifications(apiBaseUrl: string, token: string): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return true;
  }

  const endpoint = subscription.endpoint;
  const unsubscribed = await subscription.unsubscribe().catch(() => false);

  await fetch(`${apiBaseUrl}/api/push/subscriptions`, {
    method: 'DELETE',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ endpoint }),
  }).catch((error) => {
    console.warn('[PushNotifications] Failed to unregister push subscription.', error);
  });

  return unsubscribed;
}
