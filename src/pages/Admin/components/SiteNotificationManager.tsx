import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { useAdminSiteNotification } from '@/hooks';
import { SiteNotificationSeverity } from '@/types';
import { RootState } from '@/store';
import { useSWRConfig } from 'swr';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

type SiteNotificationFormState = {
  title: string;
  message: string;
  severity: SiteNotificationSeverity;
  enabled: boolean;
};

const DEFAULT_FORM_STATE: SiteNotificationFormState = {
  title: '',
  message: '',
  severity: 'info',
  enabled: true,
};

const SEVERITY_OPTIONS: SiteNotificationSeverity[] = ['info', 'success', 'warning', 'error'];

export default function SiteNotificationManager() {
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const { mutate: mutateCache } = useSWRConfig();
  const { data, error, isLoading, mutate } = useAdminSiteNotification();
  const [formState, setFormState] = useState<SiteNotificationFormState>(DEFAULT_FORM_STATE);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const notification = data?.data.notification;

    if (!notification) {
      setFormState(DEFAULT_FORM_STATE);
      return;
    }

    setFormState({
      title: notification.title || '',
      message: notification.message,
      severity: notification.severity,
      enabled: notification.enabled,
    });
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/site-notification`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formState),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to save site notification');
      }

      await Promise.all([
        mutate(result, { revalidate: false }),
        mutateCache(`${API_BASE_URL}/api/site-notification`, {
          success: true,
          data: {
            notification: result?.data?.notification?.enabled
              ? result.data.notification
              : null,
          },
        }, { revalidate: false }),
      ]);
      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.siteNotification.saveSuccess',
          defaultMessage: 'Site notification saved.',
        }),
      });
    } catch (saveError) {
      console.error(saveError);
      setFlash({
        severity: 'error',
        text: saveError instanceof Error
          ? saveError.message
          : intl.formatMessage({
              id: 'admin.siteNotification.saveError',
              defaultMessage: 'Failed to save site notification.',
            }),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/site-notification`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to clear site notification');
      }

      setFormState(DEFAULT_FORM_STATE);
      await Promise.all([
        mutate({ success: true, data: { notification: null } }, { revalidate: false }),
        mutateCache(`${API_BASE_URL}/api/site-notification`, {
          success: true,
          data: {
            notification: null,
          },
        }, { revalidate: false }),
      ]);
      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.siteNotification.clearSuccess',
          defaultMessage: 'Site notification cleared.',
        }),
      });
    } catch (clearError) {
      console.error(clearError);
      setFlash({
        severity: 'error',
        text: clearError instanceof Error
          ? clearError.message
          : intl.formatMessage({
              id: 'admin.siteNotification.clearError',
              defaultMessage: 'Failed to clear site notification.',
            }),
      });
    } finally {
      setClearing(false);
    }
  };

  if (isLoading) {
    return <Typography><FormattedMessage id="common.loading" defaultMessage="Loading..." /></Typography>;
  }

  return (
    <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <FormattedMessage id="admin.siteNotification.title" defaultMessage="Site Notification" />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <FormattedMessage
              id="admin.siteNotification.description"
              defaultMessage="Publish one global site-wide notification from KV without creating any database records."
            />
          </Typography>
        </Box>

        {error ? (
          <Alert severity="error">
            <FormattedMessage id="admin.siteNotification.loadError" defaultMessage="Failed to load site notification." />
          </Alert>
        ) : null}

        {flash ? <Alert severity={flash.severity}>{flash.text}</Alert> : null}

        {data?.data.notification ? (
          <Alert severity={data.data.notification.enabled ? 'success' : 'warning'}>
            <FormattedMessage
              id="admin.siteNotification.currentStatus"
              defaultMessage="Current notification updated at {updatedAt} and is {status}."
              values={{
                updatedAt: new Date(data.data.notification.updatedAt).toLocaleString(intl.locale),
                status: data.data.notification.enabled
                  ? intl.formatMessage({ id: 'admin.siteNotification.status.enabled', defaultMessage: 'enabled' })
                  : intl.formatMessage({ id: 'admin.siteNotification.status.disabled', defaultMessage: 'disabled' }),
              }}
            />
          </Alert>
        ) : (
          <Alert severity="info">
            <FormattedMessage id="admin.siteNotification.empty" defaultMessage="No site notification is currently stored." />
          </Alert>
        )}

        <TextField
          label={intl.formatMessage({ id: 'admin.siteNotification.field.title', defaultMessage: 'Title' })}
          value={formState.title}
          onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
          placeholder={intl.formatMessage({
            id: 'admin.siteNotification.field.titlePlaceholder',
            defaultMessage: 'Optional short heading',
          })}
        />

        <TextField
          label={intl.formatMessage({ id: 'admin.siteNotification.field.message', defaultMessage: 'Message' })}
          value={formState.message}
          onChange={(event) => setFormState((current) => ({ ...current, message: event.target.value }))}
          multiline
          minRows={4}
          required
          helperText={intl.formatMessage({
            id: 'admin.siteNotification.field.messageHelp',
            defaultMessage: 'Shown to all users. Line breaks are preserved.',
          })}
        />

        <TextField
          select
          label={intl.formatMessage({ id: 'admin.siteNotification.field.severity', defaultMessage: 'Severity' })}
          value={formState.severity}
          onChange={(event) => setFormState((current) => ({ ...current, severity: event.target.value as SiteNotificationSeverity }))}
          sx={{ maxWidth: 240 }}
        >
          {SEVERITY_OPTIONS.map((severity) => (
            <MenuItem key={severity} value={severity}>
              {intl.formatMessage({
                id: `admin.siteNotification.severity.${severity}`,
                defaultMessage: severity,
              })}
            </MenuItem>
          ))}
        </TextField>

        <Box display="flex" alignItems="center" gap={2}>
          <Switch
            checked={formState.enabled}
            onChange={(event) => setFormState((current) => ({ ...current, enabled: event.target.checked }))}
          />
          <Typography>
            <FormattedMessage id="admin.siteNotification.field.enabled" defaultMessage="Enable this notification immediately" />
          </Typography>
        </Box>

        <Box display="flex" gap={2} flexWrap="wrap">
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={saving || !formState.message.trim()}
          >
            <FormattedMessage id="admin.siteNotification.save" defaultMessage="Save Notification" />
          </Button>
          <Button
            variant="outlined"
            color="error"
            onClick={() => void handleClear()}
            disabled={clearing}
          >
            <FormattedMessage id="admin.siteNotification.clear" defaultMessage="Clear Notification" />
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
