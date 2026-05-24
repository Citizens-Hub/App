import {
  Box,
  Button,
  CircularProgress,
  Typography,
} from '@mui/material';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router';
import { RootState } from '@/store';
import { useUserSession } from '@/hooks';
import { UserRole } from '@/types';

type ActivePrompt = 'emailVerification' | 'marketingEmailConsent';

export default function MarketingEmailConsentPrompt() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useSelector((state: RootState) => state.user);
  const { data: userSession, mutate } = useUserSession();
  const [submittingConsent, setSubmittingConsent] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailVerificationDismissedForPage, setEmailVerificationDismissedForPage] = useState(false);
  const [marketingDismissedForPage, setMarketingDismissedForPage] = useState(false);
  const apiBaseUrl = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
  const region = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  const shouldVerifyEmail = Boolean(
    user.token
    && user.role !== UserRole.Guest
    && userSession?.success
    && userSession.user.emailVerified === false
  );
  const shouldAskForConsent = Boolean(
    user.token
    && user.role !== UserRole.Guest
    && userSession?.success
    && userSession.user.marketingEmailConsent === null
  );
  const activePrompt: ActivePrompt | null = shouldVerifyEmail && !emailVerificationDismissedForPage
    ? 'emailVerification'
    : shouldAskForConsent && !marketingDismissedForPage
      ? 'marketingEmailConsent'
      : null;
  const isEmailVerificationPrompt = activePrompt === 'emailVerification';
  const isVerificationRoute = pathname === '/verify' || pathname.startsWith('/verify/');
  const isSettingsRoute = pathname === '/app-settings';

  const closePrompt = () => {
    if (isEmailVerificationPrompt) {
      setEmailVerificationDismissedForPage(true);
      return;
    }

    setMarketingDismissedForPage(true);
  };

  useEffect(() => {
    setErrorMessage(null);
    setSubmittingConsent(null);
  }, [activePrompt]);

  const saveConsent = async (marketingEmailConsent: boolean) => {
    setSubmittingConsent(marketingEmailConsent);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          marketingEmailConsent,
          marketingEmailConsentRegion: region,
        }),
      });

      const result = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'settings.marketingEmailPromptSaveFailed');
      }

      await mutate((current) => current
        ? {
            ...current,
            user: {
              ...current.user,
              marketingEmailConsent,
              marketingEmailConsentRegion: region,
              marketingEmailConsentSource: 'settings',
              marketingEmailConsentAt: new Date().toISOString(),
            },
          }
        : current, {
          revalidate: true,
        });
    } catch (error) {
      console.error(error);
      setErrorMessage(intl.formatMessage({
        id: error instanceof Error ? error.message : 'settings.marketingEmailPromptSaveFailed',
        defaultMessage: 'Failed to save your email preference. Please try again.',
      }));
    } finally {
      setSubmittingConsent(null);
    }
  };

  if (isVerificationRoute || (isSettingsRoute && shouldVerifyEmail) || !activePrompt) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        right: { xs: 16, sm: 24 },
        top: { xs: 72, sm: 88 },
        zIndex: 1300,
        width: { xs: 'calc(100vw - 32px)', sm: 388 },
        borderRadius: 0,
        border: '1px solid',
        borderColor: 'primary.main',
        backgroundColor: 'background.paper',
        boxShadow: 6,
        '&::before': {
          content: '""',
          position: 'absolute',
          top: -1,
          left: -1,
          right: -1,
          height: 4,
          backgroundColor: 'primary.main',
        },
      }}
    >
      <Box sx={{ position: 'relative', p: 2.5, pt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, textAlign: 'left' }}>
          <Box sx={{ minWidth: 0, pr: 1 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 1,
                py: 0.375,
                borderRadius: 0,
                border: '1px solid',
                borderColor: 'primary.main',
                backgroundColor: 'rgba(25, 118, 210, 0.08)',
                color: 'primary.dark',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {isEmailVerificationPrompt ? (
                <FormattedMessage
                  id="app.emailVerification.title"
                  defaultMessage="Email verification"
                />
              ) : (
                <FormattedMessage
                  id="settings.marketingEmailPromptTitle"
                  defaultMessage="Marketing email preference"
                />
              )}
            </Box>

            <Typography variant="h6" sx={{ mt: 1.5, fontWeight: 800, lineHeight: 1.45 }}>
              {isEmailVerificationPrompt ? (
                <FormattedMessage
                  id="app.emailVerification.prompt"
                  defaultMessage="Please verify your email to avoid affecting your future use of features."
                />
              ) : (
                <FormattedMessage
                  id="settings.marketingEmailPromptDescription"
                  defaultMessage="Would you like to receive Citizens Hub marketing broadcast emails, including product updates, offers, and announcements?"
                />
              )}
            </Typography>
          </Box>

          <Button
            variant="text"
            size="small"
            onClick={closePrompt}
            sx={{
              minWidth: 'auto',
              p: 0.5,
              borderRadius: 0,
              border: '1px solid',
              borderColor: 'divider',
              color: 'text.secondary',
              '&:hover': {
                borderColor: 'text.primary',
                backgroundColor: 'transparent',
              },
            }}
            aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}
          >
            <X className="h-4 w-4" />
          </Button>
        </Box>

        {errorMessage && (
          <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
            {errorMessage}
          </Typography>
        )}
        {isEmailVerificationPrompt ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 1,
              flexWrap: 'wrap',
              mt: 2.25,
            }}
          >
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                setEmailVerificationDismissedForPage(true);
                navigate('/app-settings?verifyEmail=1');
              }}
              sx={{
                borderRadius: 0,
                fontWeight: 800,
              }}
            >
              <FormattedMessage id="app.emailVerification.action" defaultMessage="Verify now" />
            </Button>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 1,
              flexWrap: 'wrap',
              mt: 2.25,
            }}
          >
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              disabled={submittingConsent !== null}
              onClick={() => void saveConsent(false)}
              sx={{
                borderRadius: 0,
                borderColor: 'divider',
                color: 'text.secondary',
                fontWeight: 700,
                '&:hover': {
                  borderColor: 'text.primary',
                  backgroundColor: 'transparent',
                },
              }}
            >
              {submittingConsent === false ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <FormattedMessage id="settings.marketingEmailPromptDecline" defaultMessage="No thanks" />
              )}
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={submittingConsent !== null}
              onClick={() => void saveConsent(true)}
              sx={{
                borderRadius: 0,
                fontWeight: 800,
              }}
            >
              {submittingConsent === true ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <FormattedMessage id="settings.marketingEmailPromptAccept" defaultMessage="Receive emails" />
              )}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
