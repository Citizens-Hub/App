import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import type { CaptchaVerificationPayload } from '@/types';

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TENCENT_CAPTCHA_SCRIPT_SRC = 'https://ca.turing.captcha.qcloud.com/TJNCaptcha-global.js';
const TENCENT_CAPTCHA_APP_ID =
  import.meta.env.VITE_PUBLIC_TENCNET_CAPTCHA_APP_ID ||
  import.meta.env.VITE_PUBLIC_TENCENT_CAPTCHA_APP_ID;

const scriptLoaders = new Map<string, Promise<void>>();

export interface CaptchaWidgetHandle {
  reset: () => void;
}

interface CaptchaWidgetProps {
  enabled?: boolean;
  onChange: (payload: CaptchaVerificationPayload | null) => void;
  onError: () => void;
}

type TurnstileApi = {
  render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove?: (widgetId: string) => void;
};

type TencentCaptchaResult = {
  ret: number;
  ticket?: string;
  randstr?: string;
  errorCode?: number;
  errorMessage?: string;
};

type TencentCaptchaInstance = {
  show: () => void;
  destroy?: () => void;
  reload?: () => void;
};

type TencentCaptchaConstructor = new (
  container: string | HTMLElement,
  appId: string,
  callback: (result: TencentCaptchaResult) => void,
  options?: Record<string, unknown>,
) => TencentCaptchaInstance;

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    TencentCaptcha?: TencentCaptchaConstructor;
  }
}

function isCnMirrorEnabled(): boolean {
  return import.meta.env.VITE_PUBLIC_CN_MIRROR === 'true';
}

function getCaptchaProvider(): CaptchaVerificationPayload['captchaProvider'] {
  return isCnMirrorEnabled() ? 'tencent' : 'turnstile';
}

function getGlobalApi(globalKey: 'turnstile' | 'TencentCaptcha') {
  return globalKey === 'turnstile' ? window.turnstile : window.TencentCaptcha;
}

function loadScript(src: string, globalKey: 'turnstile' | 'TencentCaptcha'): Promise<void> {
  if (getGlobalApi(globalKey)) {
    return Promise.resolve();
  }

  const cachedLoader = scriptLoaders.get(src);
  if (cachedLoader) {
    return cachedLoader;
  }

  const loader = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[data-captcha-script="${src}"]`);

    const handleLoad = () => {
      if (existingScript) {
        existingScript.dataset.loaded = 'true';
      }

      if (getGlobalApi(globalKey)) {
        resolve();
        return;
      }

      reject(new Error(`Captcha script loaded without exposing ${globalKey}`));
    };

    const handleError = () => {
      if (existingScript) {
        existingScript.dataset.loaded = 'error';
      }

      scriptLoaders.delete(src);
      reject(new Error(`Failed to load captcha script: ${src}`));
    };

    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        handleLoad();
        return;
      }

      if (existingScript.dataset.loaded === 'error') {
        handleError();
        return;
      }

      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.captchaScript = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      handleLoad();
    }, { once: true });
    script.addEventListener('error', () => {
      script.dataset.loaded = 'error';
      handleError();
    }, { once: true });
    document.head.appendChild(script);
  });

  scriptLoaders.set(src, loader);
  return loader;
}

const CaptchaWidget = forwardRef<CaptchaWidgetHandle, CaptchaWidgetProps>(function CaptchaWidget(
  { enabled = true, onChange, onError },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const tencentCaptchaRef = useRef<TencentCaptchaInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  const provider = getCaptchaProvider();

  useEffect(() => {
    onChangeRef.current = onChange;
    onErrorRef.current = onError;
  }, [onChange, onError]);

  const emitChange = useCallback((payload: CaptchaVerificationPayload | null) => {
    onChangeRef.current(payload);
  }, []);

  const emitError = useCallback(() => {
    onErrorRef.current();
  }, []);

  const destroyCaptcha = useCallback(() => {
    const widgetId = turnstileWidgetIdRef.current;
    if (widgetId && window.turnstile?.remove) {
      window.turnstile.remove(widgetId);
    }

    turnstileWidgetIdRef.current = null;

    if (tencentCaptchaRef.current?.destroy) {
      tencentCaptchaRef.current.destroy();
    }

    tencentCaptchaRef.current = null;

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
  }, []);

  const resetCaptcha = useCallback(() => {
    emitChange(null);

    if (provider === 'turnstile') {
      const widgetId = turnstileWidgetIdRef.current;
      if (widgetId && window.turnstile) {
        window.turnstile.reset(widgetId);
      }
      return;
    }

    if (tencentCaptchaRef.current?.reload) {
      tencentCaptchaRef.current.reload();
      return;
    }

    destroyCaptcha();
  }, [destroyCaptcha, emitChange, provider]);

  useImperativeHandle(ref, () => ({
    reset: resetCaptcha,
  }), [resetCaptcha]);

  useEffect(() => {
    if (!enabled) {
      emitChange(null);
      destroyCaptcha();
      return;
    }

    let cancelled = false;

    const renderCaptcha = async () => {
      try {
        emitChange(null);
        destroyCaptcha();

        const container = containerRef.current;
        if (!container) {
          return;
        }

        if (provider === 'turnstile') {
          await loadScript(TURNSTILE_SCRIPT_SRC, 'turnstile');

          if (cancelled || !window.turnstile) {
            return;
          }

          turnstileWidgetIdRef.current = window.turnstile.render(container, {
            sitekey: import.meta.env.VITE_PUBLIC_TURNSTILE_SITE_KEY,
            callback: (token: string) => {
              emitChange({
                captchaProvider: 'turnstile',
                turnstileToken: token,
              });
            },
            'expired-callback': () => {
              emitChange(null);
            },
            'error-callback': () => {
              emitChange(null);
              emitError();
            },
          });
          return;
        }

        if (!TENCENT_CAPTCHA_APP_ID) {
          emitError();
          return;
        }

        await loadScript(TENCENT_CAPTCHA_SCRIPT_SRC, 'TencentCaptcha');

        if (cancelled || !window.TencentCaptcha) {
          return;
        }

        tencentCaptchaRef.current = new window.TencentCaptcha(
          container,
          TENCENT_CAPTCHA_APP_ID,
          (result) => {
            if (result.ticket && result.randstr) {
              emitChange({
                captchaProvider: 'tencent',
                tencentCaptchaTicket: result.ticket,
                tencentCaptchaRandstr: result.randstr,
              });
              return;
            }

            emitChange(null);

            if (result.ret !== 2) {
              emitError();
            }
          },
        );

        tencentCaptchaRef.current.show();
      } catch (error) {
        console.error('Failed to initialize captcha widget', error);
        emitChange(null);
        emitError();
      }
    };

    void renderCaptcha();

    return () => {
      cancelled = true;
      destroyCaptcha();
    };
  }, [destroyCaptcha, emitChange, emitError, enabled, provider]);

  return <div ref={containerRef} />;
});

export default CaptchaWidget;
