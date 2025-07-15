import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { useEffect, useLayoutEffect, useState, lazy, Suspense } from 'react'
import { Route, BrowserRouter, Routes, useLocation, Navigate as RouterNavigate } from 'react-router'
import Header from '@/components/Header'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '@/store'
import { logout } from '@/store/userStore'
import { UserRole } from '@/types'
import { Check, Loader2, X } from 'lucide-react'
import { SWRConfig } from 'swr'
import { swrConfig, useUserSession, useSharedHangar } from '@/hooks'
import Verify from './pages/Verify/Verify'

// 懒加载路由组件
const ResourcesTable = lazy(() => import('./pages/ResourcesTable/ResourcesTable'));
const CCUPlanner = lazy(() => import('./pages/CCUPlanner/CCUPlanner'));
const Privacy = lazy(() => import('./pages/Privacy/Privacy'));
const ChangeLogs = lazy(() => import('./pages/ChangeLogs/ChangeLogs'));
const Auth = lazy(() => import('./pages/Auth/Auth'));
const Admin = lazy(() => import('./pages/Admin/Admin'));
const Navigate = lazy(() => import('./pages/Navigate/Navigate'));
const Hangar = lazy(() => import('./pages/Hangar/Hangar'));
const Settings = lazy(() => import('./pages/Settings/Settings'));
const FleaMarket = lazy(() => import('./pages/FleaMarket/FleaMarket'));
const Guide = lazy(() => import('./pages/CCUPlanner/components/Guide'));
const Share = lazy(() => import('./pages/Share/Share'));
const Checkout = lazy(() => import('./pages/Checkout/Checkout'));
const Market = lazy(() => import('./pages/Market/Market'));
const Orders = lazy(() => import('./pages/Orders/Orders'));
const OrderDetail = lazy(() => import('./pages/OrderDetail/OrderDetail'));

// Loading 组件
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-[calc(100vh-65px)]">
    <Loader2 className="animate-spin" />
  </div>
);

function RequireAuth({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: UserRole[] }) {
  const { pathname } = useLocation();
  const { user } = useSelector((state: RootState) => state.user);

  if (!allowedRoles.includes(user.role)) {
    return <RouterNavigate to="/login" replace state={pathname} />
  }

  return children;
}

function App() {
  const [darkMode, setDarkMode] = useState<boolean>();

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
    const host = window.location.hostname;

    if (host === 'localhost') {
      return;
    }

    if (!host.includes("citizenshub.app") && !host.includes("citizenshub.pages.dev")) {
      window.location.hostname = "citizenshub.app";
    }
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

  const { user } = useSelector((state: RootState) => state.user);
  const { data: userSession } = useUserSession();
  const dispatch = useDispatch();
  
  // 使用SWR检查用户会话
  const { error: sessionError } = useUserSession();
  
  // 使用SWR获取共享机库更新
  const { isPathUpdated } = useSharedHangar();

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

  return (
    <SWRConfig value={swrConfig}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Header darkMode={!!darkMode} toggleDarkMode={toggleDarkMode} />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/fall-back" element={<LoadingFallback />} />

              <Route path="/" element={<Navigate />} />
              <Route path="/ccu-planner" element={<CCUPlanner />} />
              <Route path="/hangar" element={<Hangar />} />
              <Route path="/flea-market" element={<FleaMarket />} />
              <Route path="/store-preview" element={<ResourcesTable />} />
              <Route path="/app-settings" element={<Settings />} />

              <Route path="/share/hangar/:userId" element={<Share />} />

              <Route path="/market" element={<Market />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:orderId" element={<OrderDetail />} />

              <Route
                path="/guide"
                element={
                  <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
                    <Guide showTitle />
                  </div>
                }
              />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/changelog" element={<ChangeLogs />} />

              <Route path="/admin" element={<RequireAuth allowedRoles={[UserRole.Admin]}><Admin /></RequireAuth>} />
              <Route path="/login" element={<Auth action="login" />} />
              <Route path="/register" element={<Auth action="register" />} />
              <Route path="/verify/:token" element={<Verify />} />
            </Routes>
          </Suspense>
          {
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
          }
        </BrowserRouter>
      </ThemeProvider>
    </SWRConfig>
  )
}

export default App
