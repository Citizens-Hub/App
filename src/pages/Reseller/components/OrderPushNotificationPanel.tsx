import { useMemo, useState } from 'react';
import { Alert, Box, Button, Chip } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  enableOrderPushNotifications,
  getNotificationPermission,
  isPushNotificationSupported,
} from '@/utils/pushNotifications';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export default function OrderPushNotificationPanel() {
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const supported = useMemo(() => isPushNotificationSupported(), []);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => getNotificationPermission());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    severity: 'success' | 'warning' | 'error' | 'info';
    text: string;
  } | null>(null);

  const enabled = permission === 'granted';

  const handleEnable = async () => {
    setBusy(true);
    setMessage(null);

    const result = await enableOrderPushNotifications(API_BASE_URL, token);
    setPermission(getNotificationPermission());
    setBusy(false);

    if (result.ok) {
      setMessage({
        severity: 'success',
        text: intl.formatMessage({
          id: 'reseller.push.enabled',
          defaultMessage: 'Offline order push notifications are enabled for this browser.',
        }),
      });
      return;
    }

    const fallbackMessages: Record<typeof result.reason, string> = {
      unsupported: intl.formatMessage({
        id: 'reseller.push.unsupported',
        defaultMessage: 'This browser does not support Web Push notifications in the current context.',
      }),
      not_configured: intl.formatMessage({
        id: 'reseller.push.notConfigured',
        defaultMessage: 'Push notification keys are not configured on the server.',
      }),
      permission_denied: intl.formatMessage({
        id: 'reseller.push.permissionDenied',
        defaultMessage: 'Notification permission was denied. You can change it in your browser settings.',
      }),
      service_worker_unavailable: intl.formatMessage({
        id: 'reseller.push.serviceWorkerUnavailable',
        defaultMessage: 'The service worker is not ready yet. Reload the page and try again.',
      }),
      request_failed: intl.formatMessage({
        id: 'reseller.push.requestFailed',
        defaultMessage: 'Failed to enable push notifications. Please try again later.',
      }),
    };

    setMessage({
      severity: result.reason === 'permission_denied' || result.reason === 'unsupported' ? 'warning' : 'error',
      text: fallbackMessages[result.reason],
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mb: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', justifyContent: 'start' }}>
        <Chip
          color={enabled ? 'success' : 'default'}
          icon={enabled ? <NotificationsActiveIcon /> : <NotificationsOffIcon />}
          label={enabled
            ? <FormattedMessage id="reseller.push.statusEnabled" defaultMessage="Offline push enabled" />
            : <FormattedMessage id="reseller.push.statusDisabled" defaultMessage="Offline push disabled" />}
          sx={{ borderRadius: 1 }}
          variant={enabled ? 'filled' : 'outlined'}
        />
        <Button
          disabled={!supported || busy || enabled}
          onClick={handleEnable}
          size="small"
          startIcon={<NotificationsActiveIcon />}
          variant="outlined"
        >
          <FormattedMessage id="reseller.push.enable" defaultMessage="Enable order push" />
        </Button>
      </Box>
      {message && (
        <Alert severity={message.severity} sx={{ py: 0.5 }}>
          {message.text}
        </Alert>
      )}
    </Box>
  );
}
