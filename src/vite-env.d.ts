/// <reference types="vite/client" />

declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_PUBLIC_API_ENDPOINT: string;
  readonly VITE_PUBLIC_CN_MIRROR?: string;
  readonly VITE_PUBLIC_TENCNET_CAPTCHA_APP_ID?: string;
  readonly VITE_PUBLIC_TENCENT_CAPTCHA_APP_ID?: string;
  readonly VITE_PUBLIC_TURNSTILE_SITE_KEY?: string;
}
