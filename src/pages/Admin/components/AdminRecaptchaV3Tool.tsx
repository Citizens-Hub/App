import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useSelector } from 'react-redux';
import { FormattedMessage, useIntl } from 'react-intl';
import { RootState } from '@/store';

type GrecaptchaApi = {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

type AdminRecaptchaV3AssessmentResponse = {
  success: boolean;
  message?: string;
  data?: {
    configured: boolean;
    siteverifyHttpStatus: number;
    siteverifySuccess: boolean;
    verified: boolean;
    score: number | null;
    action: string | null;
    expectedAction: string;
    actionMatches: boolean;
    hostname: string | null;
    challengeTs: string | null;
    errorCodes: string[];
    remoteIp: string | null;
  };
};

declare global {
  interface Window {
    grecaptcha?: GrecaptchaApi;
  }
}

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_PUBLIC_RECAPTCHA_V3_SITE_KEY?.trim() || '';
const DEFAULT_ACTION = 'admin_recaptcha_v3_probe';

const scriptLoaders = new Map<string, Promise<void>>();

function loadRecaptchaScript(siteKey: string): Promise<void> {
  if (window.grecaptcha) {
    return Promise.resolve();
  }

  const scriptSrc = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
  const cachedLoader = scriptLoaders.get(scriptSrc);
  if (cachedLoader) {
    return cachedLoader;
  }

  const loader = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[data-recaptcha-script="${scriptSrc}"]`);
    let activeScript = existingScript;

    const handleLoad = () => {
      if (activeScript) {
        activeScript.dataset.loaded = 'true';
      }

      if (window.grecaptcha) {
        resolve();
        return;
      }

      reject(new Error('reCAPTCHA script loaded without exposing grecaptcha.'));
    };

    const handleError = () => {
      if (activeScript) {
        activeScript.dataset.loaded = 'error';
      }

      scriptLoaders.delete(scriptSrc);
      reject(new Error('Failed to load the reCAPTCHA v3 script.'));
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
    script.src = scriptSrc;
    script.async = true;
    script.defer = true;
    script.dataset.recaptchaScript = scriptSrc;
    activeScript = script;
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    document.head.appendChild(script);
  });

  scriptLoaders.set(scriptSrc, loader);
  return loader;
}

function executeRecaptcha(siteKey: string, action: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const recaptcha = window.grecaptcha;
    if (!recaptcha) {
      reject(new Error('reCAPTCHA v3 is not available in this browser context.'));
      return;
    }

    recaptcha.ready(() => {
      recaptcha.execute(siteKey, { action })
        .then(resolve)
        .catch(reject);
    });
  });
}

function formatScore(score: number | null) {
  return typeof score === 'number' ? score.toFixed(3) : '-';
}

function formatPercent(score: number | null) {
  return typeof score === 'number' ? `${Math.round(score * 100)}%` : '-';
}

function formatValue(value: string | number | boolean | null | undefined) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return '-';
}

function maskSiteKey(siteKey: string) {
  if (siteKey.length <= 8) {
    return siteKey || '-';
  }

  return `${siteKey.slice(0, 4)}...${siteKey.slice(-4)}`;
}

export default function AdminRecaptchaV3Tool() {
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const [action, setAction] = useState(DEFAULT_ACTION);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [result, setResult] = useState<AdminRecaptchaV3AssessmentResponse['data'] | null>(null);

  const handleRun = async () => {
    if (!RECAPTCHA_SITE_KEY) {
      setFlash({
        severity: 'warning',
        text: intl.formatMessage({
          id: 'admin.recaptchaV3.missingSiteKey',
          defaultMessage: 'The frontend reCAPTCHA v3 site key is not configured.',
        }),
      });
      return;
    }

    const normalizedAction = action.trim() || DEFAULT_ACTION;
    setBusy(true);
    setFlash(null);

    try {
      await loadRecaptchaScript(RECAPTCHA_SITE_KEY);
      const recaptchaToken = await executeRecaptcha(RECAPTCHA_SITE_KEY, normalizedAction);
      const response = await fetch(`${API_BASE_URL}/api/admin/recaptcha-v3/assess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          token: recaptchaToken,
          action: normalizedAction,
        }),
      });

      const payload = await response.json().catch(() => null) as AdminRecaptchaV3AssessmentResponse | null;
      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.message || 'Failed to assess the reCAPTCHA v3 token.');
      }

      setResult(payload.data);
      setFlash({
        severity: payload.data.siteverifySuccess && payload.data.actionMatches ? 'success' : 'warning',
        text: payload.data.siteverifySuccess
          ? intl.formatMessage({
              id: 'admin.recaptchaV3.runSuccess',
              defaultMessage: 'reCAPTCHA v3 token verified successfully.',
            })
          : intl.formatMessage({
              id: 'admin.recaptchaV3.runCompletedWithFailure',
              defaultMessage: 'reCAPTCHA v3 returned a verification result, but siteverify did not mark it as successful.',
            }),
      });
    } catch (error) {
      console.error(error);
      setResult(null);
      setFlash({
        severity: 'error',
        text: error instanceof Error
          ? error.message
          : intl.formatMessage({
              id: 'admin.recaptchaV3.runError',
              defaultMessage: 'Failed to run the reCAPTCHA v3 assessment.',
            }),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <FormattedMessage
              id="admin.recaptchaV3.title"
              defaultMessage="reCAPTCHA v3 Score Probe"
            />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <FormattedMessage
              id="admin.recaptchaV3.description"
              defaultMessage="Generate a real reCAPTCHA v3 token in the current browser session, verify it with the worker secret, and inspect the returned score, action, hostname, and error codes."
            />
          </Typography>
        </Box>

        <Alert severity="info">
          <FormattedMessage
            id="admin.recaptchaV3.note"
            defaultMessage="reCAPTCHA v3 returns a risk score between 0 and 1. It is not a literal human probability, but you can treat score x 100% as a rough human-likeness indicator for quick checks."
          />
        </Alert>

        {!RECAPTCHA_SITE_KEY ? (
          <Alert severity="warning">
            <FormattedMessage
              id="admin.recaptchaV3.siteKeyMissingBanner"
              defaultMessage="This app build does not have VITE_PUBLIC_RECAPTCHA_V3_SITE_KEY configured yet."
            />
          </Alert>
        ) : null}

        {flash ? <Alert severity={flash.severity}>{flash.text}</Alert> : null}

        <TextField
          label={intl.formatMessage({
            id: 'admin.recaptchaV3.siteKey',
            defaultMessage: 'Site Key',
          })}
          value={maskSiteKey(RECAPTCHA_SITE_KEY)}
          InputProps={{ readOnly: true }}
          helperText={intl.formatMessage({
            id: 'admin.recaptchaV3.siteKeyHelper',
            defaultMessage: 'The public site key used by this frontend build.',
          })}
        />

        <TextField
          label={intl.formatMessage({
            id: 'admin.recaptchaV3.action',
            defaultMessage: 'Action',
          })}
          value={action}
          onChange={(event) => setAction(event.target.value)}
          helperText={intl.formatMessage({
            id: 'admin.recaptchaV3.actionHelper',
            defaultMessage: 'Use the same action naming style you plan to enforce on the backend.',
          })}
        />

        <Box>
          <Button
            variant="contained"
            onClick={handleRun}
            disabled={busy || !RECAPTCHA_SITE_KEY}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {busy ? (
              <FormattedMessage id="admin.recaptchaV3.running" defaultMessage="Assessing..." />
            ) : (
              <FormattedMessage id="admin.recaptchaV3.run" defaultMessage="Run Assessment" />
            )}
          </Button>
        </Box>

        {result ? (
          <Stack spacing={2}>
            <Alert severity={result.siteverifySuccess && result.actionMatches ? 'success' : 'warning'}>
              <FormattedMessage
                id="admin.recaptchaV3.resultSummary"
                defaultMessage="siteverify success: {success}, action match: {actionMatch}, score: {score}"
                values={{
                  success: result.siteverifySuccess ? 'true' : 'false',
                  actionMatch: result.actionMatches ? 'true' : 'false',
                  score: formatScore(result.score),
                }}
              />
            </Alert>

            <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell width="40%">
                      <FormattedMessage id="admin.recaptchaV3.metric.score" defaultMessage="Score (0-1)" />
                    </TableCell>
                    <TableCell>{formatScore(result.score)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <FormattedMessage id="admin.recaptchaV3.metric.humanPercent" defaultMessage="Human-likeness helper" />
                    </TableCell>
                    <TableCell>{formatPercent(result.score)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <FormattedMessage id="admin.recaptchaV3.metric.siteverifySuccess" defaultMessage="siteverify success" />
                    </TableCell>
                    <TableCell>{formatValue(result.siteverifySuccess)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <FormattedMessage id="admin.recaptchaV3.metric.action" defaultMessage="Returned action" />
                    </TableCell>
                    <TableCell>{formatValue(result.action)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <FormattedMessage id="admin.recaptchaV3.metric.expectedAction" defaultMessage="Expected action" />
                    </TableCell>
                    <TableCell>{formatValue(result.expectedAction)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <FormattedMessage id="admin.recaptchaV3.metric.actionMatches" defaultMessage="Action matches" />
                    </TableCell>
                    <TableCell>{formatValue(result.actionMatches)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <FormattedMessage id="admin.recaptchaV3.metric.hostname" defaultMessage="Hostname" />
                    </TableCell>
                    <TableCell>{formatValue(result.hostname)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <FormattedMessage id="admin.recaptchaV3.metric.challengeTs" defaultMessage="Challenge timestamp" />
                    </TableCell>
                    <TableCell>{formatValue(result.challengeTs)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <FormattedMessage id="admin.recaptchaV3.metric.remoteIp" defaultMessage="Remote IP used for verification" />
                    </TableCell>
                    <TableCell>{formatValue(result.remoteIp)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <FormattedMessage id="admin.recaptchaV3.metric.httpStatus" defaultMessage="siteverify HTTP status" />
                    </TableCell>
                    <TableCell>{formatValue(result.siteverifyHttpStatus)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <FormattedMessage id="admin.recaptchaV3.metric.errorCodes" defaultMessage="Error codes" />
                    </TableCell>
                    <TableCell>{result.errorCodes.length ? result.errorCodes.join(', ') : '-'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}
