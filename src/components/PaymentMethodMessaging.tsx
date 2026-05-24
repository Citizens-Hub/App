import { Elements, PaymentMethodMessagingElement } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim();
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

type PaymentMethodMessagingProps = {
  amount: number;
  className?: string;
};

export default function PaymentMethodMessaging({ amount }: PaymentMethodMessagingProps) {
  const amountInCents = Math.round(amount * 100);
  if (!stripePromise || !Number.isFinite(amountInCents) || amountInCents <= 0) {
    return null;
  }

  return (
    <Elements stripe={stripePromise}>
      <PaymentMethodMessagingElement
        options={{
          amount: amountInCents,
          currency: 'USD',
        }}
      />
    </Elements>
  );
}
