import { FormEvent, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Link,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import BackgroundVideo from '@/components/BackgroundVideo';
import CaptchaWidget, { CaptchaWidgetHandle } from '@/components/CaptchaWidget';
import type { CaptchaVerificationPayload } from '@/types';

type ApiResponse = {
  success?: boolean;
  message?: string;
  expiresInMinutes?: number;
};

function resolveMessage(intl: ReturnType<typeof useIntl>, message: string | undefined, fallback: string) {
  if (message?.startsWith('message.') || message?.startsWith('forgotPassword.')) {
    return intl.formatMessage({ id: message, defaultMessage: fallback });
  }

  return message || fallback;
}

export default function ForgotPassword() {
  const intl = useIntl();
  const navigate = useNavigate();
  const captchaRef = useRef<CaptchaWidgetHandle>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaPayload, setCaptchaPayload] = useState<CaptchaVerificationPayload | null>(null);
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const resetCaptcha = () => {
    captchaRef.current?.reset();
    setCaptchaPayload(null);
  };

  const validatePassword = (value: string) => value.length >= 6 && !/^\d+$/.test(value);

  const requestResetCode = async (event: FormEvent) => {
    event.preventDefault();

    if (!captchaPayload) {
      setErrorMessage(intl.formatMessage({
        id: 'forgotPassword.captchaRequired',
        defaultMessage: 'Please complete the captcha.',
      }));
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          ...captchaPayload,
        }),
      });

      const data = await response.json().catch(() => null) as ApiResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(resolveMessage(intl, data?.message, 'Failed to send reset code.'));
      }

      setStep('confirm');
      setSuccessMessage(intl.formatMessage(
        {
          id: 'forgotPassword.codeSent',
          defaultMessage: 'If the email exists, a reset code has been sent. It expires in {minutes} minutes.',
        },
        { minutes: data.expiresInMinutes || 15 },
      ));
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error && error.message
        ? error.message
        : intl.formatMessage({
            id: 'forgotPassword.requestFailed',
            defaultMessage: 'Failed to send reset code.',
          }));
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async (event: FormEvent) => {
    event.preventDefault();

    setErrorMessage('');
    setSuccessMessage('');

    if (!validatePassword(password)) {
      setErrorMessage(intl.formatMessage({
        id: 'login.passwordStrengthError',
        defaultMessage: 'Password must be at least 6 characters and not all numbers',
      }));
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(intl.formatMessage({
        id: 'login.passwordsNotMatch',
        defaultMessage: 'Passwords do not match',
      }));
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/password-reset/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          code,
          password,
        }),
      });

      const data = await response.json().catch(() => null) as ApiResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(resolveMessage(intl, data?.message, 'Failed to reset password.'));
      }

      setSuccessMessage(resolveMessage(intl, data.message, 'Password reset successfully.'));
      setTimeout(() => {
        navigate('/login');
      }, 1200);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error && error.message
        ? error.message
        : intl.formatMessage({
            id: 'forgotPassword.confirmFailed',
            defaultMessage: 'Failed to reset password.',
          }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <BackgroundVideo />
      <Box
        sx={{
          marginTop: 14,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 6,
          minWidth: '460px'
        }}
      >
        <Paper
          component="form"
          onSubmit={step === 'request' ? requestResetCode : confirmReset}
          elevation={3}
          sx={{ p: 4, width: '100%', maxWidth: 460, borderRadius: 2, zIndex: 1, display: 'grid', gap: 2 }}
        >
          <Box>
            <Typography component="h1" variant="h5" align="center">
              <FormattedMessage id="forgotPassword.title" defaultMessage="Reset Password" />
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
              <FormattedMessage
                id="forgotPassword.description"
                defaultMessage="Use your email and a 6-digit code to set a new password."
              />
            </Typography>
          </Box>

          {errorMessage && <Alert severity="error" sx={{ textAlign: 'left' }}>{errorMessage}</Alert>}
          {successMessage && <Alert severity="success" sx={{ textAlign: 'left' }}>{successMessage}</Alert>}

          <TextField
            required
            fullWidth
            id="email"
            label={<FormattedMessage id="login.email" defaultMessage="Email Address" />}
            name="email"
            autoComplete="email"
            value={email}
            disabled={loading || step === 'confirm'}
            onChange={(event) => setEmail(event.target.value)}
          />

          {step === 'request' ? (
            <Box sx={{ display: 'flex', justifyContent: 'left' }}>
              <CaptchaWidget
                ref={captchaRef}
                onChange={setCaptchaPayload}
                onError={() => {
                  setCaptchaPayload(null);
                  setErrorMessage(intl.formatMessage({
                    id: 'forgotPassword.captchaFailed',
                    defaultMessage: 'Captcha verification failed. Please try again.',
                  }));
                }}
              />
            </Box>
          ) : (
            <>
              <TextField
                required
                fullWidth
                label={<FormattedMessage id="verify.codeLabel" defaultMessage="6-digit code" />}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputProps={{
                  inputMode: 'numeric',
                  pattern: '\\d{6}',
                  maxLength: 6,
                }}
              />
              <TextField
                required
                fullWidth
                name="password"
                label={<FormattedMessage id="forgotPassword.newPassword" defaultMessage="New Password" />}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <TextField
                required
                fullWidth
                name="confirmPassword"
                label={<FormattedMessage id="login.confirmPassword" defaultMessage="Confirm Password" />}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </>
          )}

          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading || (step === 'request' && !captchaPayload) || (step === 'confirm' && code.length !== 6)}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : step === 'request' ? (
              <FormattedMessage id="forgotPassword.sendCode" defaultMessage="Send reset code" />
            ) : (
              <FormattedMessage id="forgotPassword.resetPassword" defaultMessage="Reset password" />
            )}
          </Button>

          {step === 'confirm' && (
            <Button type="button" variant="outlined" fullWidth onClick={() => {
              setStep('request');
              setCode('');
              setPassword('');
              setConfirmPassword('');
              setSuccessMessage('');
              resetCaptcha();
            }}>
              <FormattedMessage id="forgotPassword.resendCode" defaultMessage="Send another code" />
            </Button>
          )}

          <Typography variant="body2" align="center">
            <Link href="/login" onClick={(event) => {
              event.preventDefault();
              navigate('/login');
            }}>
              <FormattedMessage id="forgotPassword.backToLogin" defaultMessage="Back to login" />
            </Link>
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}
