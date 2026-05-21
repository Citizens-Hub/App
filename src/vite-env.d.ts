/// <reference types="vite/client" />

declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_PUBLIC_API_ENDPOINT: string;
  readonly VITE_PUBLIC_IMAGES_ENDPOINT?: string;
  readonly VITE_PUBLIC_MODEL_ENDPOINT?: string;
  readonly VITE_PUBLIC_CN_MIRROR?: string;
  readonly VITE_PUBLIC_TENCNET_CAPTCHA_APP_ID?: string;
  readonly VITE_PUBLIC_TENCENT_CAPTCHA_APP_ID?: string;
  readonly VITE_PUBLIC_TURNSTILE_SITE_KEY?: string;
  readonly VITE_PUBLIC_RECAPTCHA_V3_SITE_KEY?: string;
  readonly VITE_PUBLIC_GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID?: string;
  readonly VITE_PUBLIC_GOOGLE_CUSTOMER_REVIEWS_BADGE_POSITION?: string;
  readonly VITE_PUBLIC_GOOGLE_CUSTOMER_REVIEWS_BADGE_REGION?: string;
  readonly VITE_PUBLIC_GOOGLE_CUSTOMER_REVIEWS_DELIVERY_DAYS?: string;
}
