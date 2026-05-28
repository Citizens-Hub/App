import { Box, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { OrderStatus } from '@/types';

interface OrderPaymentDeadlineProps {
  status: OrderStatus;
  expiresAt?: string | null;
  compact?: boolean;
  onExpired?: () => void;
  mode?: 'payment' | 'shipment';
}

function formatRemainingTime(remainingMs: number, locale: string) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours.toLocaleString(locale)}h`);
  }

  if (hours > 0 || minutes > 0) {
    parts.push(`${minutes.toLocaleString(locale)}m`);
  }

  parts.push(`${seconds.toLocaleString(locale)}s`);

  return parts.join(' ');
}

export default function OrderPaymentDeadline({
  status,
  expiresAt,
  compact = false,
  onExpired,
  mode = 'payment',
}: OrderPaymentDeadlineProps) {
  const intl = useIntl();
  const [now, setNow] = useState(() => Date.now());
  const hasTriggeredExpiryRef = useRef(false);
  const expiryTimestamp = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
  const hasDeadline =
    (mode === 'payment' ? status === OrderStatus.Pending : [OrderStatus.Paid, OrderStatus.Confirmed].includes(status))
    && !Number.isNaN(expiryTimestamp);
  const remainingMs = hasDeadline ? expiryTimestamp - now : 0;
  const isExpired = hasDeadline && remainingMs <= 0;
  const remainingText = hasDeadline
    ? formatRemainingTime(remainingMs, intl.locale)
    : '';
  const deadlineLabel = mode === 'payment'
    ? { id: 'orders.paymentDeadline', defaultMessage: 'Payment Expires in' }
    : { id: 'orders.shipmentDeadline', defaultMessage: 'Ships in' };
  const expiredLabel = mode === 'payment'
    ? { id: 'orders.paymentExpired', defaultMessage: 'Payment window expired' }
    : { id: 'orders.shipmentExpired', defaultMessage: 'Shipment promise overdue' };
  const activeColor = mode === 'payment' ? 'warning.main' : 'info.main';

  useEffect(() => {
    if (!hasDeadline) {
      return;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [expiresAt, hasDeadline]);

  useEffect(() => {
    if (!hasDeadline) {
      hasTriggeredExpiryRef.current = false;
      return;
    }

    if (!isExpired) {
      hasTriggeredExpiryRef.current = false;
      return;
    }

    if (hasTriggeredExpiryRef.current) {
      return;
    }

    hasTriggeredExpiryRef.current = true;
    onExpired?.();
  }, [hasDeadline, isExpired, onExpired]);

  if (!hasDeadline) {
    return null;
  }

  return (
    <Box
      sx={{
        mt: compact ? 0.75 : 0,
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 0.25 : 0.5,
      }}
    >
      <Typography
        variant={compact ? 'caption' : 'body2'}
        color="text.secondary"
      >
        <FormattedMessage {...deadlineLabel} />
        <span>{': '}</span>
        <Box
          component="span"
          sx={{ fontWeight: compact ? 500 : 600 }}
        >
          <Typography
            component="span"
            variant={compact ? 'caption' : 'body2'}
            color={isExpired ? 'error.main' : activeColor}
            sx={{ fontWeight: compact ? 500 : 600 }}
          >
            {isExpired ? (
              <FormattedMessage {...expiredLabel} />
            ) : (
              <FormattedMessage
                id="orders.paymentRemaining"
                defaultMessage="{time}"
                values={{ time: remainingText }}
              />
            )}
          </Typography>
        </Box>
      </Typography>
    </Box>
  );
}
