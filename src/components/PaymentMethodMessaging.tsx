import { useMemo } from 'react';
import { Elements, PaymentMethodMessagingElement } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import type { StripeElementsOptions } from '@stripe/stripe-js';
import { useLocale } from '@/contexts/LocaleContext';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim();
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

type PaymentMethodMessagingProps = {
  amount: number;
  className?: string;
};

function toStripeLocale(locale: string): StripeElementsOptions['locale'] {
  if (locale === 'zh-CN') return 'zh';
  if (locale === 'zh-HK') return 'zh-HK';
  if (locale === 'ja-JP') return 'ja';
  if (locale === 'de-DE') return 'de';
  return 'en';
}

export default function PaymentMethodMessaging({ amount }: PaymentMethodMessagingProps) {
  const { locale } = useLocale();
  const amountInCents = Math.round(amount * 100);
  const elementsOptions = useMemo<StripeElementsOptions>(() => ({
    locale: toStripeLocale(locale),
    appearance: {
      variables: {
        colorText: '#0f172a',
        colorTextSecondary: '#475569',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSizeBase: '14px',
        spacingUnit: '4px',
      },
      rules: {
        '.PaymentMethodMessaging': {
          textAlign: 'left',
        },
      },
    },
  }), [locale]);

  if (!stripePromise || !Number.isFinite(amountInCents) || amountInCents <= 0) {
    return null;
  }

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <PaymentMethodMessagingElement
        options={{
          amount: amountInCents,
          currency: 'USD',
        }}
      />
    </Elements>
  );
}
