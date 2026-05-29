import CloseIcon from '@mui/icons-material/Close'
import { Alert, AlertTitle, Box, Button, CssBaseline, IconButton, Snackbar, ThemeProvider, createTheme } from '@mui/material'
import { useEffect, useLayoutEffect, useState, lazy, Suspense } from 'react'
import { Route, BrowserRouter, HashRouter, Routes, useLocation, Navigate as RouterNavigate } from 'react-router'
import Header from '@/components/Header'
import HangarSyncConflictDialog from '@/components/HangarSyncConflictDialog'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '@/store'
import { logout } from '@/store/userStore'
import { UserRole } from '@/types'
import { Loader2 } from 'lucide-react'
import { SWRConfig } from 'swr'
import { swrConfig, useUserSession, useSharedHangar, useHangarSync, useSiteNotification } from '@/hooks'
import Verify from './pages/Verify/Verify'
import { useErrorBoundary } from 'react-error-boundary'
import SupportPrompt from '@/components/SupportPrompt'
import MarketingEmailConsentPrompt from '@/components/MarketingEmailConsentPrompt'
import EmailLocaleSync from '@/components/EmailLocaleSync'
import { useIntl } from 'react-intl'
import { SiteNotification } from '@/types'
// import { startGoogleCustomerReviewsBadge } from '@/utils/googleCustomerReviews'

// 懒加载路由组件
const ResourcesTable = lazy(() => import('./pages/ResourcesTable/ResourcesTable'));
const CCUPlanner = lazy(() => import('./pages/CCUPlanner/CCUPlanner'));
const PriceHistory = lazy(() => import('./pages/PriceHistory/PriceHistory'));
const AboutUs = lazy(() => import('./pages/AboutUs/AboutUs'));
const Privacy = lazy(() => import('./pages/Privacy/Privacy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService/TermsOfService'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy/RefundPolicy'));
const ChangeLogs = lazy(() => import('./pages/ChangeLogs/ChangeLogs'));
const Auth = lazy(() => import('./pages/Auth/Auth'));
const ForgotPassword = lazy(() => import('./pages/Auth/ForgotPassword'));
const Admin = lazy(() => import('./pages/Admin/Admin'));
const Navigate = lazy(() => import('./pages/Navigate/Navigate'));
const Hangar = lazy(() => import('./pages/Hangar/Hangar'));
const FleetView = lazy(() => import('./pages/FleetView/FleetView'));
const Settings = lazy(() => import('./pages/Settings/Settings'));
const FleaMarket = lazy(() => import('./pages/FleaMarket/FleaMarket'));
const Guide = lazy(() => import('./pages/CCUPlanner/components/Guide'));
const Share = lazy(() => import('./pages/Share/Share'));
const Checkout = lazy(() => import('./pages/Checkout/Checkout'));
const Market = lazy(() => import('./pages/Market/Market'));
const MarketDetail = lazy(() => import('./pages/Market/MarketDetail'));
const MarketShipFeature = lazy(() => import('./pages/Market/MarketShipFeature'));
const AccountMarket = lazy(() => import('./pages/AccountMarket/AccountMarket'));
const AccountMarketDetail = lazy(() => import('./pages/AccountMarket/AccountMarketDetail'));
const MarketingOffer = lazy(() => import('./pages/MarketingOffer/MarketingOffer'));
const MarketingEmailCampaign = lazy(() => import('./pages/MarketingEmailCampaign/MarketingEmailCampaign'));
const Orders = lazy(() => import('./pages/Orders/Orders'));
const OrderDetail = lazy(() => import('./pages/Orders/OrderDetail'));
const Tickets = lazy(() => import('./pages/Tickets/Tickets'));
const TicketCreate = lazy(() => import('./pages/Tickets/TicketCreate'));
const TicketDetail = lazy(() => import('./pages/Tickets/TicketDetail'));
const TicketReply = lazy(() => import('./pages/Tickets/TicketReply'));
const AdminTicketsPage = lazy(() => import('./pages/Admin/TicketsPage'));
const AdminTicketDetailPage = lazy(() => import('./pages/Admin/TicketDetailPage'));
const AdminTicketReplyPage = lazy(() => import('./pages/Admin/TicketReplyPage'));
const Reseller = lazy(() => import('./pages/Reseller/Reseller'));
const ResellerOrderDetail = lazy(() => import('./pages/Reseller/OrderDetail'));
const ResellerGraphqlExport = lazy(() => import('./pages/Reseller/ResellerGraphqlExport'));
const BlogList = lazy(() => import('./pages/Blog/BlogList'));
const BlogPostDetail = lazy(() => import('./pages/Blog/BlogPostDetail'));
const BlogPostForm = lazy(() => import('./pages/Blog/BlogPostForm'));
const Router = import.meta.env.VITE_PUBLIC_CN_MIRROR === 'true' ? HashRouter : BrowserRouter;
const CN_MIRROR_HOST = 'citizenshub.oxdl.cn';
const CN_LOCATION_CACHE_KEY = 'citizenshub-cn-location-cache';
const CN_MIRROR_PROMPT_DISMISSED_KEY = 'citizenshub-cn-mirror-prompt-dismissed';
const SITE_NOTIFICATION_DISMISSED_KEY = 'citizenshub-site-notification-dismissed';
const CN_LOCATION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

type CnLocationCache = {
  checkedAt: number;
  isInChina: boolean;
}

type IpIpLocationResponse = {
  data?: {
    location?: string;
  }
}

function readCnLocationCache(): boolean | null {
  try {
    const raw = localStorage.getItem(CN_LOCATION_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CnLocationCache>;

    if (typeof parsed.checkedAt !== 'number' || typeof parsed.isInChina !== 'boolean') {
      localStorage.removeItem(CN_LOCATION_CACHE_KEY);
      return null;
    }

    if (Date.now() - parsed.checkedAt > CN_LOCATION_CACHE_TTL) {
      localStorage.removeItem(CN_LOCATION_CACHE_KEY);
      return null;
    }

    return parsed.isInChina;
  } catch {
    localStorage.removeItem(CN_LOCATION_CACHE_KEY);
    return null;
  }
}

function writeCnLocationCache(isInChina: boolean) {
  try {
    localStorage.setItem(CN_LOCATION_CACHE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      isInChina,
    }));
  } catch {
    // Ignore storage failures and try again next time.
  }
}

function isCnMirrorPromptDismissed() {
  try {
    return localStorage.getItem(CN_MIRROR_PROMPT_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function dismissCnMirrorPrompt() {
  try {
    localStorage.setItem(CN_MIRROR_PROMPT_DISMISSED_KEY, 'true');
  } catch {
    // Ignore storage failures and only close for the current session.
  }
}

function getCnMirrorUrl() {
  return `https://${CN_MIRROR_HOST}/#${window.location.pathname}${window.location.search}`;
}

function readDismissedSiteNotificationId(): string | null {
  try {
    return localStorage.getItem(SITE_NOTIFICATION_DISMISSED_KEY);
  } catch {
    return null;
  }
}

function dismissSiteNotification(id: string) {
  try {
    localStorage.setItem(SITE_NOTIFICATION_DISMISSED_KEY, id);
  } catch {
    // Ignore storage failures and only dismiss for the current render.
  }
}

// Loading 组件
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-[calc(100vh-65px)]">
    <Loader2 className="animate-spin" />
  </div>
);

export function TestButton() {
  const { showBoundary } = useErrorBoundary();

  return (
    <div className='fixed top-24 right-8 w-fit bg-white opacity-50 z-50 text-left p-4 select-none border'>
      <Button
        id="testBtn"
        onClick={() => {
          showBoundary(new Error("手动触发 react-error-boundary 错误"));
        }}
      >
        Throw Error
      </Button>
    </div>
  );
}

function RequireAuth({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: UserRole[] }) {
  const { pathname, search } = useLocation();
  const { user } = useSelector((state: RootState) => state.user);

  if (!allowedRoles.includes(user.role)) {
    return <RouterNavigate to="/login" replace state={`${pathname}${search}`} />
  }

  return children;
}

function App() {
  const [darkMode, setDarkMode] = useState<boolean>();
  const [showCnMirrorPrompt, setShowCnMirrorPrompt] = useState(false);
  const [dismissedSiteNotificationId, setDismissedSiteNotificationId] = useState<string | null>(null);
  const intl = useIntl();

  useLayoutEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      setDarkMode(saved === 'true');
    } else {
      setDarkMode(
        window.matchMedia('(prefers-color-scheme: dark)').matches
      );
    }
  }, []);

  useEffect(() => {
    setDismissedSiteNotificationId(readDismissedSiteNotificationId());
  }, []);

  useEffect(() => {
    const host = window.location.hostname;

    if (host === 'localhost' || host.startsWith('192.168')) {
      return;
    }

    if (!host.includes("citizenshub.app") && !host.includes("citizenshub.pages.dev") &&!host.includes("citizenshub.oxdl.cn")) {
      window.location.hostname = "citizenshub.app";
    }
  }, [])

  useEffect(() => {
    const host = window.location.hostname;

    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168') || host === CN_MIRROR_HOST) {
      return;
    }

    if (isCnMirrorPromptDismissed()) {
      return;
    }

    const cachedIsInChina = readCnLocationCache();

    if (cachedIsInChina !== null) {
      if (cachedIsInChina) {
        setShowCnMirrorPrompt(true);
      }

      return;
    }

    const controller = new AbortController();

    fetch("https://myip.ipip.net/json", { signal: controller.signal })
      .then((resp) => {
        if (!resp.ok) {
          throw new Error(`Failed to detect user region: ${resp.status}`);
        }

        return resp.json();
      })
      .then((data: IpIpLocationResponse) => {
        const isInChina = data?.data?.location?.includes("中国") ?? false;
        writeCnLocationCache(isInChina);

        if (isInChina) {
          setShowCnMirrorPrompt(true);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        console.warn('[CN Mirror] Failed to detect user region.', error);
      });

    return () => {
      controller.abort();
    };
  }, [])

  useEffect(() => {
    if (darkMode === undefined) {
      return;
    }

    localStorage.setItem('darkMode', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.setAttribute('data-color-mode', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.setAttribute('data-color-mode', 'light');
    }
  }, [darkMode]);

  // useEffect(() => {
  //   void startGoogleCustomerReviewsBadge();
  // }, []);

  const { user } = useSelector((state: RootState) => state.user);
  const dispatch = useDispatch();

  // 使用SWR检查用户会话
  const { error: sessionError } = useUserSession();

  // 使用SWR获取共享机库更新
  const { isPathUpdated } = useSharedHangar();
  const {
    pendingConflict,
    resolveConflictKeepLocal,
    resolveConflictUseRemote,
  } = useHangarSync();
  const { data: siteNotificationResponse } = useSiteNotification();
  const siteNotification = siteNotificationResponse?.data.notification ?? null;
  const visibleSiteNotification = siteNotification?.id !== dismissedSiteNotificationId
    ? siteNotification
    : null;

  // 当会话无效时登出
  useEffect(() => {
    if (user.token && sessionError && sessionError.status === 401) {
      console.log("Session is invalid, logging out");
      dispatch(logout());
    }
  }, [user, sessionError, dispatch]);

  // 共享机库已更新的日志
  useEffect(() => {
    if (isPathUpdated) {
      console.log('共享机库已更新，自动重新导入');
    }
  }, [isPathUpdated]);

  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
    },
  });

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const closeCnMirrorPrompt = (persistDismissal: boolean) => {
    if (persistDismissal) {
      dismissCnMirrorPrompt();
    }

    setShowCnMirrorPrompt(false);
  };

  const closeSiteNotification = (notification: SiteNotification | null) => {
    if (!notification) {
      return;
    }

    dismissSiteNotification(notification.id);
    setDismissedSiteNotificationId(notification.id);
  };

  return (
    <SWRConfig value={swrConfig}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Header darkMode={!!darkMode} toggleDarkMode={toggleDarkMode} />
          <EmailLocaleSync />
          <SupportPrompt />
          <MarketingEmailConsentPrompt />
          <Snackbar
            key={visibleSiteNotification?.id || 'site-notification-empty'}
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            onClose={(_, reason) => {
              if (reason === 'clickaway') {
                return;
              }

              closeSiteNotification(visibleSiteNotification);
            }}
            open={Boolean(visibleSiteNotification)}
            sx={{ mt: 7 }}
          >
            <Alert
              onClose={() => closeSiteNotification(visibleSiteNotification)}
              severity={visibleSiteNotification?.severity || 'info'}
              sx={{ width: '100%', maxWidth: 'calc(100vw - 24px)', alignItems: 'flex-start' }}
              variant="filled"
            >
              {visibleSiteNotification?.title ? (
                <AlertTitle>{visibleSiteNotification.title}</AlertTitle>
              ) : null}
              <Box sx={{ whiteSpace: 'pre-line' }}>
                {visibleSiteNotification?.message}
              </Box>
            </Alert>
          </Snackbar>
          <Snackbar
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            autoHideDuration={12000}
            onClose={(_, reason) => {
              if (reason === 'clickaway') {
                return;
              }

              closeCnMirrorPrompt(false);
            }}
            open={showCnMirrorPrompt}
          >
            <Alert
              action={
                <>
                  <Button
                    color="inherit"
                    onClick={() => {
                      window.location.assign(getCnMirrorUrl());
                    }}
                    size="small"
                  >
                    {intl.formatMessage({
                      id: 'app.cnMirror.action',
                      defaultMessage: 'Use mirror',
                    })}
                  </Button>
                  <IconButton
                    aria-label={intl.formatMessage({
                      id: 'app.cnMirror.dismiss',
                      defaultMessage: 'Dismiss permanently',
                    })}
                    color="inherit"
                    onClick={() => closeCnMirrorPrompt(true)}
                    size="small"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </>
              }
              severity="info"
              sx={{ alignItems: 'center', width: '100%' }}
              variant="filled"
            >
              {intl.formatMessage({
                id: 'app.cnMirror.message',
                defaultMessage: 'A mainland China mirror is available at citizenshub.oxdl.cn for faster access.',
              })}
            </Alert>
          </Snackbar>
          <HangarSyncConflictDialog
            open={Boolean(pendingConflict)}
            remoteRecord={pendingConflict?.current ?? null}
            onUseCloudVersion={resolveConflictUseRemote}
            onKeepLocalVersion={resolveConflictKeepLocal}
          />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/fall-back" element={<LoadingFallback />} />

              <Route path="/" element={<Navigate />} />
              <Route path="/ccu-planner" element={<CCUPlanner />} />
              <Route path="/hangar" element={<Hangar />} />
              <Route path="/fleetview" element={<FleetView />} />
              <Route path="/flea-market" element={<FleaMarket />} />
              <Route path="/store-preview" element={<ResourcesTable />} />
              <Route path="/app-settings" element={<Settings />} />
              <Route path="/price-history/:shipSlug?" element={<PriceHistory />} />

              <Route path="/share/hangar/:userId" element={<Share />} />

              <Route path="/market" element={<Market />} />
              <Route path="/market/ships/:shipId" element={<MarketShipFeature />} />
              <Route path="/market/:skuId" element={<MarketDetail />} />
              <Route path="/account-market" element={<AccountMarket />} />
              <Route path="/account-market/:skuId" element={<AccountMarketDetail />} />
              <Route path="/offers/:token" element={<RequireAuth allowedRoles={[UserRole.User, UserRole.Reseller, UserRole.Admin]}><MarketingOffer /></RequireAuth>} />
              <Route path="/marketing-emails/:token" element={<RequireAuth allowedRoles={[UserRole.User, UserRole.Reseller, UserRole.Admin]}><MarketingEmailCampaign /></RequireAuth>} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/account-market/checkout" element={<Checkout />} />
              <Route path="/orders" element={<RequireAuth allowedRoles={[UserRole.User, UserRole.Reseller, UserRole.Admin]}><Orders /></RequireAuth>} />
              <Route path="/orders/:orderId" element={<RequireAuth allowedRoles={[UserRole.User, UserRole.Reseller, UserRole.Admin]}><OrderDetail /></RequireAuth>} />
              <Route path="/tickets" element={<RequireAuth allowedRoles={[UserRole.User, UserRole.Reseller, UserRole.Admin]}><Tickets /></RequireAuth>} />
              <Route path="/tickets/create" element={<RequireAuth allowedRoles={[UserRole.User, UserRole.Reseller, UserRole.Admin]}><TicketCreate /></RequireAuth>} />
              <Route path="/tickets/:ticketId" element={<RequireAuth allowedRoles={[UserRole.User, UserRole.Reseller, UserRole.Admin]}><TicketDetail /></RequireAuth>} />
              <Route path="/tickets/:ticketId/reply" element={<RequireAuth allowedRoles={[UserRole.User, UserRole.Reseller, UserRole.Admin]}><TicketReply /></RequireAuth>} />

              <Route path="/reseller" element={<RequireAuth allowedRoles={[UserRole.Reseller, UserRole.Admin]}><Reseller /></RequireAuth>} />
              <Route path="/reseller/orders/:orderId" element={<RequireAuth allowedRoles={[UserRole.Reseller, UserRole.Admin]}><Suspense fallback={<LoadingFallback />}><ResellerOrderDetail /></Suspense></RequireAuth>} />
              
              <Route path="/graphql-export" element={<RequireAuth allowedRoles={[UserRole.Reseller, UserRole.Admin]}><ResellerGraphqlExport /></RequireAuth>} />

              <Route
                path="/guide"
                element={
                  <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
                    <Guide showTitle />
                  </div>
                }
              />
              <Route path="/about-us" element={<AboutUs />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
              <Route path="/changelog" element={<ChangeLogs />} />

              <Route path="/blog" element={<BlogList />} />
              <Route path="/blog/:slug" element={<BlogPostDetail />} />
              <Route path="/blog/:slug/edit" element={<RequireAuth allowedRoles={[UserRole.Admin]}><BlogPostForm mode="edit" /></RequireAuth>} />
              <Route path="/blog/create" element={<RequireAuth allowedRoles={[UserRole.Admin]}><BlogPostForm mode="create" /></RequireAuth>} />

              <Route path="/admin" element={<RequireAuth allowedRoles={[UserRole.Admin]}><Admin /></RequireAuth>} />
              <Route path="/admin/tickets" element={<RequireAuth allowedRoles={[UserRole.Admin]}><AdminTicketsPage /></RequireAuth>} />
              <Route path="/admin/tickets/:ticketId" element={<RequireAuth allowedRoles={[UserRole.Admin]}><AdminTicketDetailPage /></RequireAuth>} />
              <Route path="/admin/tickets/:ticketId/reply" element={<RequireAuth allowedRoles={[UserRole.Admin]}><AdminTicketReplyPage /></RequireAuth>} />
              <Route path="/login" element={<Auth action="login" />} />
              <Route path="/register" element={<Auth action="register" />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/verify/:token" element={<Verify />} />
            </Routes>
          </Suspense>
          {/* {
            import.meta.env.VITE_PUBLIC_ENV === "development" && (<TestButton />)
          } */}
          {/* {
            import.meta.env.VITE_PUBLIC_ENV === "development" && (
              <div className='fixed top-24 right-8 w-fit bg-white opacity-50 z-50 text-left p-4 select-none pointer-events-none border'>
                Current session:
                <div>User: {userSession?.user?.name}</div>
                <div>Email: {userSession?.user?.email}</div>
                <div>{userSession?.user?.emailVerified ? <>
                  <Check className='w-4 h-4 inline-block text-green-500' /> Email
                </> : <>
                  <X className='w-4 h-4 inline-block text-red-500' /> Email Not
                </>} Verified</div>
                <div>Role: {userSession?.user?.role}</div>
              </div>
            )
          } */}
        </Router>
      </ThemeProvider>
    </SWRConfig>
  )
}

export default App
