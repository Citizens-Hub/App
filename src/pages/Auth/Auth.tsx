import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Container,
  Paper,
  CircularProgress,
  Snackbar,
  Alert,
  Link
} from '@mui/material';
import { useNavigate } from 'react-router';
import { FormattedMessage } from 'react-intl';
import { useDispatch } from 'react-redux';
import { login, User } from '@/store/userStore';
import { md5 } from 'js-md5';
import { Helmet } from 'react-helmet';
import { useGoogleLogin } from '@react-oauth/google';
import GoogleIcon from '@/icons/GoogleIcon';
import BackgroundVideo from '@/components/BackgroundVideo';

interface LoginResponse {
  success: boolean;
  message: string;
  user: User;
  token: string;
}

// 声明全局Turnstile回调函数
declare global {
  interface Window {
    onTurnstileVerify?: (token: string) => void;
    onTurnstileExpire?: () => void;
    onTurnstileError?: () => void;
    onloadTurnstileCallback?: () => void;
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
    };
  }
}

const Auth = ({ action }: { action: 'login' | 'register' }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [passwordStrengthError, setPasswordStrengthError] = useState(false);
  const [turnstileWidgetId, setTurnstileWidgetId] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(true);

  const googleLogin = useGoogleLogin({
    onSuccess: tokenResponse => {
      fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/google`, {
        method: 'POST',
        body: JSON.stringify({
          token: tokenResponse.access_token
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            dispatch(login({
              ...data.user,
              avatar: data.user.avatar || `https://www.gravatar.com/avatar/${md5(data.user.email)}`,
              token: data.token,
            }));

            setOpenSnackbar(true);

            setTimeout(() => {
              navigate('/');
            }, 1500);
          }
        })
        .catch(err => {
          console.log(err);
        });
    },
  });

  const dispatch = useDispatch();

  const navigate = useNavigate();

  // 加载Turnstile脚本
  useEffect(() => {
    // 设置全局回调函数
    window.onTurnstileVerify = (token: string) => {
      setTurnstileToken(token);
      // setError('');
    };

    window.onTurnstileExpire = () => {
      setTurnstileToken(null);
    };

    window.onTurnstileError = () => {
      setError('人机验证发生错误，请重试');
      setTurnstileToken(null);
    };

    window.onloadTurnstileCallback = () => {
      if (window.turnstile) {
        const widgetId = window.turnstile.render('#turnstile-container', {
          sitekey: import.meta.env.VITE_PUBLIC_TURNSTILE_SITE_KEY,
          callback: (token: string) => {
            if (window.onTurnstileVerify) {
              window.onTurnstileVerify(token);
            }
          },
          'expired-callback': () => {
            if (window.onTurnstileExpire) {
              window.onTurnstileExpire();
            }
          },
          'error-callback': () => {
            if (window.onTurnstileError) {
              window.onTurnstileError();
            }
          }
        });
        setTurnstileWidgetId(widgetId);
      }
    };

    // 清理函数
    return () => {
      // 安全地移除全局回调
      window.onTurnstileVerify = undefined;
      window.onTurnstileExpire = undefined;
      window.onTurnstileError = undefined;
      window.onloadTurnstileCallback = undefined;
    };
  }, []);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string) => {
    // 验证密码至少6位且不为纯数字
    if (password.length < 6) return false;
    // 检查是否为纯数字
    const isOnlyNumbers = /^\d+$/.test(password);
    return !isOnlyNumbers;
  };

  // 表单验证状态计算
  const isFormValid = () => {
    if (action === 'register') {
      const isEmailValid = validateEmail(email);
      const isPasswordValid = validatePassword(password);
      const isPasswordsMatch = password === confirmPassword;
      return isEmailValid && isPasswordValid && isPasswordsMatch && !!turnstileToken;
    }
    return !!email && !!password && !!turnstileToken;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!turnstileToken) {
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
          turnstileToken
        }),
      });

      const data: LoginResponse = await response.json();

      if (data.success) {
        dispatch(login({
          ...data.user,
          avatar: `https://www.gravatar.com/avatar/${md5(data.user.email)}`,
          token: data.token,
        }));

        setOpenSnackbar(true);

        setTimeout(() => {
          navigate('/');
        }, 500);
      } else {
        setError(data.message);
        // 重置 Turnstile
        if (window.turnstile && turnstileWidgetId) {
          window.turnstile.reset(turnstileWidgetId);
          setTurnstileToken(null);
        }
      }
    } catch (err) {
      setError(`${err}`);
      // 重置 Turnstile
      if (window.turnstile && turnstileWidgetId) {
        window.turnstile.reset(turnstileWidgetId);
        setTurnstileToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      setError('please complete the captcha');
      return;
    }

    // 重置错误状态
    setEmailError(false);
    setPasswordError(false);
    setPasswordStrengthError(false);
    setError('');

    let hasError = false;

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError(true);
      setError('Invalid email format');
      hasError = true;
    }

    // 验证密码强度
    if (!validatePassword(password)) {
      setPasswordStrengthError(true);
      if (!hasError) setError('Password too weak');
      hasError = true;
    }

    // 验证两次密码输入是否一致
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
          turnstileToken
        }),
      });

      const data: LoginResponse = await response.json();

      if (data.success) {
        navigate('/login');
      } else {
        setError(data.message || '注册失败，请检查您的凭据');
        // 重置 Turnstile
        if (window.turnstile && turnstileWidgetId) {
          window.turnstile.reset(turnstileWidgetId);
          setTurnstileToken(null);
        }
      }
    } catch (err) {
      setError(`注册失败: ${err}`);
      // 重置 Turnstile
      if (window.turnstile && turnstileWidgetId) {
        window.turnstile.reset(turnstileWidgetId);
        setTurnstileToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Helmet>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback" async defer></script>
      </Helmet>
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
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
            maxWidth: '460px',
            borderRadius: 2,
            zIndex: 1
          }}
        >
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

            {/* Cloudflare Turnstile */}
            <Box sx={{ mt: 2, mb: 2, display: 'flex', justifyContent: 'left' }}>
              <div id="turnstile-container"></div>
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
              disabled={loading || !turnstileToken || (action === 'register' && !isFormValid())}
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
