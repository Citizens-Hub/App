import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useSelector } from 'react-redux';
import { FormattedMessage, useIntl } from 'react-intl';
import { RootState } from '@/store';
import { useAuthApi } from '@/hooks';

type AdminGoogleAdsAudienceRun = {
  id: string;
  mode: string;
  status: string;
  dryRun: boolean;
  requestId: string | null;
  totalCandidates: number;
  totalUploaded: number;
  totalSkipped: number;
  totalFailed: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
};

type AdminGoogleAdsAudienceRunsResponse = {
  success: boolean;
  data: {
    audience: {
      id: string;
      audienceKey: string;
      displayName: string;
      description: string | null;
      googleAudienceId: string | null;
      status: string;
    } | null;
    runs: AdminGoogleAdsAudienceRun[];
    recommendedAudiences?: Array<{
      audienceKey: string;
      displayName: string;
      description: string;
      segment: 'all_consented_users' | 'paid_buyers';
    }>;
  };
};

type AdminGoogleAdsOauthStatusResponse = {
  success: boolean;
  data: {
    configured: boolean;
    connected: boolean;
    connectedEmail: string | null;
    updatedAt: string | null;
    scope: string | null;
    apiBaseUrl: string;
    parentAccountPath: string | null;
    quotaProjectId: string | null;
    accountType: string | null;
    accountId: string | null;
  };
};

type GoogleAudienceDryRunPayloadPreview = {
  termsOfService?: {
    customerMatchTermsOfServiceStatus?: string;
  };
  audienceMembers?: Array<{
    userData?: {
      userIdentifiers?: Array<{
        hashedEmail?: string;
      }>;
    };
  }>;
};

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export default function GoogleAdsAudienceManager() {
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const [audienceKey, setAudienceKey] = useState('all_consented_users');
  const [displayName, setDisplayName] = useState('All Consented Users');
  const [description, setDescription] = useState('Citizens Hub registered users who consented to audience matching.');
  const [segment, setSegment] = useState<'all_consented_users' | 'paid_buyers'>('all_consented_users');
  const [includePaymentReview, setIncludePaymentReview] = useState(false);
  const [submitting, setSubmitting] = useState<'dry' | 'live' | null>(null);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const [previewPayload, setPreviewPayload] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<'connect' | 'disconnect' | null>(null);
  const [projectId, setProjectId] = useState('');
  const [accountType, setAccountType] = useState('GOOGLE_ADS');
  const [accountId, setAccountId] = useState('');
  const [connectionSettingsSaving, setConnectionSettingsSaving] = useState(false);

  const runsPath = useMemo(
    () => `/api/admin/google-ads/audiences/customer-match/runs?audienceKey=${encodeURIComponent(audienceKey)}`,
    [audienceKey],
  );

  const { data, mutate, isLoading, error } = useAuthApi<AdminGoogleAdsAudienceRunsResponse>(runsPath, {
    revalidateOnFocus: true,
  });
  const { data: oauthStatus, mutate: mutateOauthStatus } = useAuthApi<AdminGoogleAdsOauthStatusResponse>('/api/admin/google-ads/oauth/status', {
    revalidateOnFocus: true,
  });

  useEffect(() => {
    if (!oauthStatus?.data) {
      return;
    }

    setProjectId((current) => current || oauthStatus.data.quotaProjectId || '');
    setAccountId((current) => current || oauthStatus.data.accountId || '');
    setAccountType((current) => (current === 'GOOGLE_ADS' && oauthStatus.data.accountType) ? oauthStatus.data.accountType : current);
  }, [oauthStatus]);

  const applyRecommendedAudience = (value: {
    audienceKey: string;
    displayName: string;
    description: string;
    segment: 'all_consented_users' | 'paid_buyers';
  }) => {
    setAudienceKey(value.audienceKey);
    setDisplayName(value.displayName);
    setDescription(value.description);
    setSegment(value.segment);
  };

  const handleSync = async (dryRun: boolean) => {
    setSubmitting(dryRun ? 'dry' : 'live');
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/google-ads/audiences/customer-match/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          audienceKey,
          displayName,
          description,
          segment,
          includePaymentReview,
          dryRun,
          mode: 'full',
        }),
      });

      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        message?: string;
        data?: {
          counts?: { uniqueEmails?: number };
          toGooglePayload?: GoogleAudienceDryRunPayloadPreview | null;
        };
      } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || 'Audience sync failed');
      }

      setFlash({
        severity: 'success',
        text: dryRun
          ? intl.formatMessage({
              id: 'admin.googleAdsAudience.dryRunSuccess',
              defaultMessage: 'Dry run completed. Unique candidate emails: {count}.',
            }, { count: payload.data?.counts?.uniqueEmails ?? 0 })
          : intl.formatMessage({
              id: 'admin.googleAdsAudience.syncSuccess',
              defaultMessage: 'Customer Match batch submitted successfully.',
            }),
      });
      setPreviewPayload(dryRun ? JSON.stringify(payload.data?.toGooglePayload || null, null, 2) : null);

      await mutate();
    } catch (submitError) {
      setFlash({
        severity: 'error',
        text: submitError instanceof Error ? submitError.message : 'Audience sync failed',
      });
    } finally {
      setSubmitting(null);
    }
  };

  const handleConnectGoogle = async () => {
    setOauthLoading('connect');
    setFlash(null);

    try {
      const authorizeUrl = new URL(`${API_BASE_URL}/api/admin/google-ads/oauth/authorize-url`);
      authorizeUrl.searchParams.set('frontendOrigin', window.location.origin);

      const response = await fetch(authorizeUrl.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => null) as { success?: boolean; message?: string; data?: { authorizeUrl?: string } } | null;
      if (!response.ok || !payload?.success || !payload.data?.authorizeUrl) {
        throw new Error(payload?.message || 'Failed to create Google authorization URL');
      }

      window.location.assign(payload.data.authorizeUrl);
    } catch (connectError) {
      setFlash({
        severity: 'error',
        text: connectError instanceof Error ? connectError.message : 'Failed to create Google authorization URL',
      });
      setOauthLoading(null);
    }
  };

  const handleDisconnectGoogle = async () => {
    setOauthLoading('disconnect');
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/google-ads/oauth/disconnect`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || 'Failed to disconnect Google authorization');
      }

      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.googleAdsAudience.disconnectSuccess',
          defaultMessage: 'Google authorization disconnected.',
        }),
      });
      await mutateOauthStatus();
    } catch (disconnectError) {
      setFlash({
        severity: 'error',
        text: disconnectError instanceof Error ? disconnectError.message : 'Failed to disconnect Google authorization',
      });
    } finally {
      setOauthLoading(null);
    }
  };

  const handleSaveConnectionSettings = async () => {
    setConnectionSettingsSaving(true);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/google-ads/oauth/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: projectId.trim() || null,
          accountType: accountType.trim() || null,
          accountId: accountId.trim() || null,
        }),
      });

      const payload = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || 'Failed to save Google Data Manager settings');
      }

      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.googleAdsAudience.connectionSettingsSaved',
          defaultMessage: 'Google Data Manager settings saved.',
        }),
      });
      await mutateOauthStatus();
    } catch (saveError) {
      setFlash({
        severity: 'error',
        text: saveError instanceof Error ? saveError.message : 'Failed to save Google Data Manager settings',
      });
    } finally {
      setConnectionSettingsSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <FormattedMessage id="admin.googleAdsAudience.title" defaultMessage="Google Ads Customer Match" />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <FormattedMessage
              id="admin.googleAdsAudience.description"
              defaultMessage="Manually build or refresh a Google Customer Match audience from consented paid buyers. Run a dry run first to inspect candidate volume before sending a live batch."
            />
          </Typography>
        </Box>

        {flash && <Alert severity={flash.severity}>{flash.text}</Alert>}
        {error && (
          <Alert severity="error">
            <FormattedMessage id="admin.googleAdsAudience.loadError" defaultMessage="Failed to load audience sync history." />
          </Alert>
        )}

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            <FormattedMessage id="admin.googleAdsAudience.oauthTitle" defaultMessage="Google Authorization" />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <FormattedMessage
              id="admin.googleAdsAudience.oauthDescription"
              defaultMessage="Authorize Google once from the admin panel so Citizens Hub can refresh Data Manager access tokens automatically."
            />
          </Typography>
          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }} gap={2} sx={{ mt: 1.5 }}>
            <TextField
              label={intl.formatMessage({ id: 'admin.googleAdsAudience.projectId', defaultMessage: 'Google Cloud Project ID' })}
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              size="small"
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.googleAdsAudience.accountType', defaultMessage: 'Account Type' })}
              value={accountType}
              onChange={(event) => setAccountType(event.target.value)}
              size="small"
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.googleAdsAudience.accountId', defaultMessage: 'Google Ads Account ID' })}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              size="small"
            />
          </Box>
          <Box sx={{ mt: 1.5 }}>
            <Button
              variant="outlined"
              onClick={() => void handleSaveConnectionSettings()}
              disabled={connectionSettingsSaving}
            >
              <FormattedMessage id="admin.googleAdsAudience.saveConnectionSettings" defaultMessage="Save Connection Settings" />
            </Button>
          </Box>
          <Typography variant="body2" sx={{ mt: 1.5 }}>
            <FormattedMessage
              id="admin.googleAdsAudience.oauthStatus"
              defaultMessage="Status: {status}"
              values={{
                status: oauthStatus?.data.connected
                  ? intl.formatMessage({ id: 'admin.googleAdsAudience.oauthConnected', defaultMessage: 'Connected' })
                  : intl.formatMessage({ id: 'admin.googleAdsAudience.oauthNotConnected', defaultMessage: 'Not connected' }),
              }}
            />
          </Typography>
          {oauthStatus?.data.connectedEmail ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              <FormattedMessage
                id="admin.googleAdsAudience.oauthConnectedEmail"
                defaultMessage="Connected Google account: {email}"
                values={{ email: oauthStatus.data.connectedEmail }}
              />
            </Typography>
          ) : null}
          {oauthStatus?.data.parentAccountPath ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              <FormattedMessage
                id="admin.googleAdsAudience.oauthParentPath"
                defaultMessage="Target account path: {path}"
                values={{ path: oauthStatus.data.parentAccountPath }}
              />
            </Typography>
          ) : null}
          <Box display="flex" gap={2} flexWrap="wrap" sx={{ mt: 1.5 }}>
            <Button
              variant="contained"
              onClick={() => void handleConnectGoogle()}
              disabled={oauthLoading !== null || oauthStatus?.data.configured === false}
            >
              <FormattedMessage
                id="admin.googleAdsAudience.connectGoogle"
                defaultMessage={oauthStatus?.data.connected ? 'Reauthorize Google' : 'Connect Google'}
              />
            </Button>
            <Button
              variant="outlined"
              color="warning"
              onClick={() => void handleDisconnectGoogle()}
              disabled={oauthLoading !== null || !oauthStatus?.data.connected}
            >
              <FormattedMessage id="admin.googleAdsAudience.disconnectGoogle" defaultMessage="Disconnect Google" />
            </Button>
          </Box>
          {oauthStatus?.data.configured === false ? (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              <FormattedMessage
                id="admin.googleAdsAudience.oauthConfigMissing"
                defaultMessage="Missing GOOGLE_AUTH_ID / GOOGLE_AUTH_SECRET or target Google Ads account configuration."
              />
            </Alert>
          ) : null}
        </Box>

        <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={2}>
          <TextField
            label={intl.formatMessage({ id: 'admin.googleAdsAudience.audienceKey', defaultMessage: 'Audience Key' })}
            value={audienceKey}
            onChange={(event) => setAudienceKey(event.target.value)}
          />
          <TextField
            label={intl.formatMessage({ id: 'admin.googleAdsAudience.displayName', defaultMessage: 'Display Name' })}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Box>

        {data?.data.recommendedAudiences?.length ? (
          <Box display="flex" gap={1} flexWrap="wrap">
            {data.data.recommendedAudiences.map((item) => (
              <Chip
                key={item.audienceKey}
                label={item.displayName}
                onClick={() => applyRecommendedAudience(item)}
                variant={item.audienceKey === audienceKey ? 'filled' : 'outlined'}
                color={item.audienceKey === audienceKey ? 'primary' : 'default'}
              />
            ))}
          </Box>
        ) : null}

        <TextField
          label={intl.formatMessage({ id: 'admin.googleAdsAudience.descriptionField', defaultMessage: 'Description' })}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          multiline
          minRows={2}
        />

        <Box display="flex" alignItems="center" gap={2}>
          <Switch
            checked={includePaymentReview}
            onChange={(event) => setIncludePaymentReview(event.target.checked)}
            disabled={segment !== 'paid_buyers'}
          />
          <Typography variant="body2">
            <FormattedMessage
              id="admin.googleAdsAudience.includePaymentReview"
              defaultMessage="Include orders that are in payment review."
            />
          </Typography>
        </Box>

        <Box display="flex" gap={2} flexWrap="wrap">
          <Button
            variant="outlined"
            onClick={() => void handleSync(true)}
            disabled={submitting !== null}
          >
            <FormattedMessage id="admin.googleAdsAudience.dryRun" defaultMessage="Dry Run" />
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSync(false)}
            disabled={submitting !== null}
          >
            <FormattedMessage id="admin.googleAdsAudience.syncNow" defaultMessage="Run Live Batch" />
          </Button>
        </Box>

        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            <FormattedMessage id="admin.googleAdsAudience.previewTitle" defaultMessage="Dry Run Google Payload Preview" />
          </Typography>
          {previewPayload ? (
            <Box
              component="pre"
              sx={{
                mt: 1.5,
                p: 2,
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.default',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 320,
                overflow: 'auto',
                fontSize: 12,
              }}
            >
              {previewPayload}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              <FormattedMessage id="admin.googleAdsAudience.previewEmpty" defaultMessage="Run a dry run to inspect the exact payload that would be sent to Google." />
            </Typography>
          )}
        </Box>

        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            <FormattedMessage id="admin.googleAdsAudience.recentRuns" defaultMessage="Recent Runs" />
          </Typography>
          {isLoading ? (
            <Typography variant="body2" color="text.secondary">
              <FormattedMessage id="common.loading" defaultMessage="Loading..." />
            </Typography>
          ) : data?.data.runs.length ? (
            <Stack spacing={1.5} sx={{ mt: 1.5 }}>
              {data.data.runs.map((run) => (
                <Box key={run.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 2 }}>
                  <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
                    <Chip size="small" label={run.status} color={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'error' : 'default'} />
                    <Chip size="small" label={run.dryRun ? 'dry-run' : 'live'} variant="outlined" />
                    <Chip size="small" label={run.mode} variant="outlined" />
                  </Box>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    <FormattedMessage
                      id="admin.googleAdsAudience.runSummary"
                      defaultMessage="Candidates: {candidates}, uploaded: {uploaded}, skipped: {skipped}, failed: {failed}"
                      values={{
                        candidates: run.totalCandidates,
                        uploaded: run.totalUploaded,
                        skipped: run.totalSkipped,
                        failed: run.totalFailed,
                      }}
                    />
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    {run.startedAt ? new Date(run.startedAt).toLocaleString(intl.locale) : '-'}{' '}
                    {run.requestId ? `• requestId: ${run.requestId}` : ''}
                  </Typography>
                  {run.errorMessage && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {run.errorMessage}
                    </Alert>
                  )}
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              <FormattedMessage id="admin.googleAdsAudience.empty" defaultMessage="No sync runs yet." />
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
