export type ExtensionHttpRequestResponseType = 'json' | 'text' | 'blob' | 'arraybuffer' | 'formData';

export interface ExtensionHttpRequestPayload {
  url: string;
  responseType: ExtensionHttpRequestResponseType;
  method: string;
  data: null | object | object[] | string;
  headers?: Record<string, string>;
}

interface ExtensionResponseMessage {
  requestId?: string;
  value?: unknown;
  error?: unknown;
}

interface RequestViaExtensionOptions {
  timeoutMs?: number;
  timeoutMessage?: string;
  requestIdPrefix?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export function requestViaExtension(
  request: ExtensionHttpRequestPayload,
  options: RequestViaExtensionOptions = {},
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestIdPrefix = options.requestIdPrefix || 'extension-http-request';
  const timeoutMessage = options.timeoutMessage || 'The extension request timed out.';

  return new Promise((resolve, reject) => {
    const requestId = `${requestIdPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const cleanup = (timeoutId: number, listener: (event: MessageEvent) => void) => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', listener);
    };

    const listener = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'ccuPlannerAppIntegrationResponse') return;

      const message = event.data?.message as ExtensionResponseMessage | undefined;
      if (!message || message.requestId !== requestId) return;

      cleanup(timeoutId, listener);

      if (message.error) {
        const errorMessage = message.error instanceof Error
          ? message.error.message
          : typeof message.error === 'string'
            ? message.error
            : (
              typeof message.error === 'object'
              && message.error !== null
              && 'message' in message.error
              && typeof (message.error as { message?: unknown }).message === 'string'
            )
              ? (message.error as { message: string }).message
              : String(message.error);
        reject(new Error(errorMessage));
        return;
      }

      resolve(message.value ?? null);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId, listener);
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    window.addEventListener('message', listener);

    window.postMessage({
      type: 'ccuPlannerAppIntegrationRequest',
      message: {
        type: 'httpRequest',
        request,
        requestId,
      },
    }, '*');
  });
}
