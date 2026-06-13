import { useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  TextField,
  Typography,
  Container,
  Paper,
  CircularProgress,
  Snackbar,
  Alert,
  Link,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router';
import { FormattedMessage } from 'react-intl';
import { useDispatch } from 'react-redux';
import { login, User } from '@/store/userStore';
import { md5 } from 'js-md5';
import { useGoogleLogin } from '@react-oauth/google';
import GoogleIcon from '@/icons/GoogleIcon';
import BackgroundVideo from '@/components/BackgroundVideo';
import CaptchaWidget, { CaptchaWidgetHandle } from '@/components/CaptchaWidget';
import type { CaptchaVerificationPayload } from '@/types';
import { sendGoogleAdsSignupConversion } from '@/utils/googleAdsConversions';
import { sendRedditPixelSignupConversion } from '@/utils/redditPixelConversions';
import Verify, { AUTH_FORM_PAPER_SX } from '@/pages/Verify/Verify';
import { toEmailLocale, useLocale } from '@/contexts/LocaleContext';

interface LoginResponse {
  success: boolean;
  message: string;
  user: User;
  token: string;
  isNewUser?: boolean;
  emailVerificationRequired?: boolean;
  emailVerificationSent?: boolean;
}

const Auth = ({ action }: { action: 'login' | 'register' }) => {
  const { locale } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode] = useState('');
  const [privacyPolicyAccepted, setPrivacyPolicyAccepted] = useState(false);
  const [marketingEmailConsent, setMarketingEmailConsent] = useState<boolean | null>(null);
  const [adsAudienceConsent, setAdsAudienceConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [captchaPayload, setCaptchaPayload] = useState<CaptchaVerificationPayload | null>(null);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [passwordStrengthError, setPasswordStrengthError] = useState(false);
  const [showAlert, setShowAlert] = useState(true);
  const [registeredEmailVerificationRequired, setRegisteredEmailVerificationRequired] = useState(false);
  const [registeredEmailVerificationSent, setRegisteredEmailVerificationSent] = useState(false);
  const [registeredEmailVerificationExpiresInMinutes, setRegisteredEmailVerificationExpiresInMinutes] = useState(15);
  const captchaRef = useRef<CaptchaWidgetHandle>(null);
  const emailLocale = toEmailLocale(locale);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/google`, {
          method: 'POST',
          body: JSON.stringify({
            token: tokenResponse.access_token,
            emailLocale,
          }),
        });
        const data: LoginResponse | null = await response.json().catch(() => null);

        if (!response.ok || !data?.success) {
          throw new Error(data?.message || 'message.invalidCredentials');
        }

        if (data.isNewUser) {
          void sendGoogleAdsSignupConversion();
          void sendRedditPixelSignupConversion(data.user.id);
        }

        dispatch(login({
          ...data.user,
          avatar: data.user.avatar || `https://www.gravatar.com/avatar/${md5(data.user.email)}`,
          token: data.token,
        }));

        setOpenSnackbar(true);

        setTimeout(() => {
          navigate(redirectTo);
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
  });

  const dispatch = useDispatch();

  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = typeof location.state === 'string' && location.state ? location.state : '/';

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string) => {
    if (password.length < 6) return false;
    const isOnlyNumbers = /^\d+$/.test(password);
    return !isOnlyNumbers;
  };

  const isFormValid = () => {
    if (action === 'register') {
      const isEmailValid = validateEmail(email);
      const isPasswordValid = validatePassword(password);
      const isPasswordsMatch = password === confirmPassword;
      return isEmailValid && isPasswordValid && isPasswordsMatch && privacyPolicyAccepted && marketingEmailConsent !== null && !!captchaPayload;
    }
    return !!email && !!password && !!captchaPayload;
  };

  const resetCaptcha = () => {
    captchaRef.current?.reset();
    setCaptchaPayload(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!captchaPayload) {
      setError('please complete the captcha');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          referralCode: referralCode.trim() || undefined,
          ...captchaPayload
        }),
      });

      const data: LoginResponse = await response.json();

      if (data.success) {
        dispatch(login({
          ...data.user,
          avatar: data.user.avatar || `https://www.gravatar.com/avatar/${md5(data.user.email)}`,
          token: data.token,
        }));

        setOpenSnackbar(true);

        setTimeout(() => {
          navigate(redirectTo);
        }, 500);
      } else {
        setError(data.message);
        resetCaptcha();
      }
    } catch (err) {
      setError(`${err}`);
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaPayload) {
      setError('please complete the captcha');
      return;
    }

    setEmailError(false);
    setPasswordError(false);
    setPasswordStrengthError(false);
    setError('');

    let hasError = false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError(true);
      setError('Invalid email format');
      hasError = true;
    }

    if (!validatePassword(password)) {
      setPasswordStrengthError(true);
      if (!hasError) setError('Password too weak');
      hasError = true;
    }

    if (password !== confirmPassword) {
      setPasswordError(true);
      if (!hasError) setError('Passwords do not match');
      hasError = true;
    }

    if (hasError) return;

    setLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          referralCode: referralCode.trim() || undefined,
          privacyPolicyAccepted,
          marketingEmailConsent,
          marketingEmailConsentRegion: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
          adsAudienceConsent,
          consentRegion: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
          emailLocale,
          ...captchaPayload
        }),
      });

      const data: LoginResponse = await response.json();

      if (data.success) {
        void sendGoogleAdsSignupConversion();
        void sendRedditPixelSignupConversion(data.user.id);
        dispatch(login({
          ...data.user,
          avatar: data.user.avatar || `https://www.gravatar.com/avatar/${md5(data.user.email)}`,
          emailVerified: Boolean(data.user.emailVerified),
          token: data.token,
        }));
        if (data.emailVerificationRequired ?? !data.user.emailVerified) {
          setRegisteredEmailVerificationRequired(true);
          setRegisteredEmailVerificationSent(Boolean(data.emailVerificationSent));
          setRegisteredEmailVerificationExpiresInMinutes(15);
          setOpenSnackbar(false);
          return;
        }

        setOpenSnackbar(true);
        setTimeout(() => {
          navigate(redirectTo);
        }, 500);
      } else {
        setError(data.message || '注册失败，请检查您的凭据');
        resetCaptcha();
      }
    } catch (err) {
      setError(`注册失败: ${err}`);
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <BackgroundVideo />
      {showAlert && (
        <Alert
          severity="info"
          sx={{ zIndex: 1000, position: 'fixed', top: '65px', left: 0, right: 0, width: '100%', borderRadius: 0 }}
          onClose={() => setShowAlert(false)}
        >
          <div className="text-sm text-left">
            <FormattedMessage
              id="login.siteAccountNotice"
              defaultMessage="Please note: You are logging into an account for this site, not your RSI account. Although we encrypt and securely store your information, to avoid any unnecessary issues, please do not use the same password as your RSI account when registering. To retrieve inventory data, please use our browser extension."
            />
          </div>
        </Alert>
      )}
      <Box
        sx={{
          marginTop: 14,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 6,
          minWidth: "460px"
        }}
      >
        <Paper
          elevation={3}
          sx={{ ...AUTH_FORM_PAPER_SX, zIndex: 1 }}
        >
          {action === 'register' && registeredEmailVerificationRequired ? (
            <Verify
              embedded
              initialCodeSent={registeredEmailVerificationSent}
              initialCodeExpiresInMinutes={registeredEmailVerificationExpiresInMinutes}
              successRedirectTo={redirectTo}
            />
          ) : (
          <>
          <Typography component="h1" variant="h5" align="center" gutterBottom>
            {action === 'login' ? (<FormattedMessage id="login.title" defaultMessage="Login" />) : (<FormattedMessage id="register.title" defaultMessage="Register" />)}
          </Typography>

          <Box component="form" onSubmit={action === 'login' ? handleLogin : handleRegister} sx={{ mt: 4 }}>
            <Button variant="outlined" sx={{ py: 1 }} fullWidth startIcon={<GoogleIcon />} onClick={() => googleLogin()}>
              <FormattedMessage id="login.google" defaultMessage="Continue with Google" />
            </Button>

            <Box sx={{ mt: 2, mb: 2, display: 'flex', alignItems: 'center' }}>
              <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
              <Typography variant="body2" sx={{ px: 2, color: 'text.secondary' }}>
                <FormattedMessage id="login.or" defaultMessage="Or" />
              </Typography>
              <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
            </Box>

            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label={<FormattedMessage id="login.email" defaultMessage="Email Address" />}
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (action === 'register') {
                  setEmailError(!validateEmail(e.target.value) && e.target.value !== '');
                }
              }}
              error={action === 'register' && emailError}
              helperText={action === 'register' && emailError ? <FormattedMessage id="login.emailError" defaultMessage="Invalid email format" /> : ''}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label={<FormattedMessage id="login.password" defaultMessage="Password" />}
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (action === 'register') {
                  if (confirmPassword) {
                    setPasswordError(e.target.value !== confirmPassword);
                  }
                  setPasswordStrengthError(!validatePassword(e.target.value) && e.target.value !== '');
                }
              }}
              error={action === 'register' && (passwordError || passwordStrengthError)}
              helperText={action === 'register' && passwordStrengthError ? <FormattedMessage id="login.passwordStrengthError" defaultMessage="Password must be at least 6 characters and not all numbers" /> : ''}
            />

            {action === 'register' && (
              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label={<FormattedMessage id="login.confirmPassword" defaultMessage="Confirm Password" />}
                type="password"
                id="confirmPassword"
                autoComplete="confirm-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordError(password !== e.target.value);
                }}
                error={passwordError}
                helperText={passwordError ? <FormattedMessage id="login.passwordsNotMatch" defaultMessage="Passwords do not match" /> : ''}
              />
            )}

            {/* {action === 'register' && (
              <TextField
                margin="normal"
                fullWidth
                name="referralCode"
                label={<FormattedMessage id="register.referralCode" defaultMessage="Referral Code (Optional)" />}
                id="referralCode"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              />
            )} */}

            {action === 'register' && (
              <Box sx={{ mt: 1, display: 'grid', gap: 1 }}>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={privacyPolicyAccepted}
                      onChange={(event) => setPrivacyPolicyAccepted(event.target.checked)}
                    />
                  )}
                  label={(
                    <Typography variant="body2">
                      <FormattedMessage
                        id="register.privacyPolicyConsent"
                        defaultMessage="I have read and agree to the Privacy Policy."
                      />
                    </Typography>
                  )}
                />
              </Box>
            )}

            {action === 'register' && (
              <Box sx={{ mt: 1, display: 'grid', gap: 1, textAlign: 'left' }}>
                <FormControl required>
                  <FormLabel>
                    <Typography variant="body2">
                      <FormattedMessage
                        id="register.marketingEmailConsentQuestion"
                        defaultMessage="Would you like to receive marketing broadcast emails from Citizens' Hub?"
                      />
                    </Typography>
                  </FormLabel>
                  <RadioGroup
                    value={marketingEmailConsent === null ? '' : marketingEmailConsent ? 'yes' : 'no'}
                    onChange={(event) => setMarketingEmailConsent(event.target.value === 'yes')}
                  >
                    <FormControlLabel
                      value="yes"
                      control={<Radio />}
                      label={(
                        <Typography variant="body2">
                          <FormattedMessage
                            id="register.marketingEmailConsentYes"
                            defaultMessage="Yes, send me product updates, offers, and marketing announcements."
                          />
                        </Typography>
                      )}
                    />
                    <FormControlLabel
                      value="no"
                      control={<Radio />}
                      label={(
                        <Typography variant="body2">
                          <FormattedMessage
                            id="register.marketingEmailConsentNo"
                            defaultMessage="No, do not send me marketing broadcast emails."
                          />
                        </Typography>
                      )}
                    />
                  </RadioGroup>
                </FormControl>
                <Typography variant="caption" color="text.secondary">
                  <FormattedMessage
                    id="register.marketingEmailConsentHelp"
                    defaultMessage="Required. You can change this later in App Settings."
                  />
                </Typography>
              </Box>
            )}

            {action === 'register' && (
              <Box sx={{ mt: 1, display: 'grid', gap: 1, textAlign: 'left' }}>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={adsAudienceConsent}
                      onChange={(event) => setAdsAudienceConsent(event.target.checked)}
                    />
                  )}
                  label={(
                    <Typography variant="body2">
                      <FormattedMessage
                        id="register.adsAudienceConsent"
                        defaultMessage="Allow Citizens' Hub to use my email and related purchase records for customer audience matching with Google and similar advertising platforms."
                      />
                    </Typography>
                  )}
                />
                <Typography variant="caption" color="text.secondary">
                  <FormattedMessage
                    id="register.adsConsentHelp"
                    defaultMessage="Optional. You can change this later in App Settings."
                  />{' '}
                  <Link href="/privacy" underline="hover">
                    <FormattedMessage id="navigate.privacy" defaultMessage="Privacy Policy" />
                  </Link>
                </Typography>
              </Box>
            )}

            <Box sx={{ mt: 2, mb: 2, display: 'flex', justifyContent: 'left' }}>
              <CaptchaWidget
                ref={captchaRef}
                onChange={setCaptchaPayload}
                onError={() => {
                  setCaptchaPayload(null);
                  setError('Captcha verification failed. Please try again.');
                }}
              />
            </Box>

            {error && (
              <Typography color="error" variant="body2" sx={{ mt: 1 }}>
                <FormattedMessage id={error} defaultMessage={error} />
              </Typography>
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 2, mb: 2 }}
              disabled={loading || !captchaPayload || (action === 'register' && !isFormValid())}
            >
              {loading ? (
                <CircularProgress size={24} />
              ) : action === 'login' ? (
                <FormattedMessage id="login.submit" defaultMessage="Login" />
              ) : (
                <FormattedMessage id="register.submit" defaultMessage="Register" />
              )
              }
            </Button>

            {
              action === 'login' ? (<Typography variant="body2" sx={{ mt: 2 }}>
                <FormattedMessage id="login.noAccount" defaultMessage="No account?" /> <Link onClick={(e) => {
                  e.preventDefault();
                  navigate('/register');
                }} href="/register" className="underline text-blue-600">
                  <FormattedMessage id="login.register" defaultMessage="Register" />
                </Link>
                <br />
                <Link onClick={(e) => {
                  e.preventDefault();
                  navigate('/forgot-password');
                }} href="/forgot-password" className="underline text-blue-600">
                  <FormattedMessage id="login.forgotPassword" defaultMessage="Forgot password?" />
                </Link>
              </Typography>) : (<Typography variant="body2" sx={{ mt: 2 }}>
                <FormattedMessage id="login.haveAccount" defaultMessage="Have an account?" /> <Link onClick={(e) => {
                  e.preventDefault();
                  navigate('/login');
                }} href="/login" className="underline text-blue-600">
                  <FormattedMessage id="login.login" defaultMessage="Login" />
                </Link>
              </Typography>)
            }
          </Box>
          </>
          )}
        </Paper>
      </Box>

      <Snackbar
        open={openSnackbar}
        autoHideDuration={2000}
        onClose={() => setOpenSnackbar(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="success" sx={{ width: '100%' }}>
          {
            action === 'login' ? (
              <FormattedMessage id="login.success" defaultMessage="Login successful" />
            ) : (
              <FormattedMessage id="register.success" defaultMessage="Register successful" />
            )
          }
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default Auth;
