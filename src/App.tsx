import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { useEffect, useLayoutEffect, useState, lazy, Suspense } from 'react'
import { Route, BrowserRouter, Routes, useLocation, Navigate as RouterNavigate } from 'react-router'
import Header from './components/Header'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from './store'
import { logout, UserRole } from './store/userStore'
import { setImportItems } from './store/importStore'
import { store } from './store'
import { Loader2 } from 'lucide-react'

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

// Loading 组件
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-[calc(100vh-65px)]">
    <Loader2 className="animate-spin" />
  </div>
);

// 检查共享机库是否有更新
async function checkSharedHangarUpdates() {
  try {
    // 从Redux store获取共享机库数据
    const state = store.getState();
    const { userId, sharedHangarPath } = state.import;

    if (!userId || !sharedHangarPath) return;

    // 从API获取最新的用户资料
    const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/user/profile/${userId}`);
    if (!response.ok) return;

    const profileData = await response.json();
    const currentSharedHangar = profileData.user.sharedHangar;

    // 如果路径有变化，自动获取新数据并更新
    if (currentSharedHangar !== sharedHangarPath) {
      console.log('共享机库已更新，自动重新导入');

      // 获取新的共享机库数据
      const hangarResponse = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}${currentSharedHangar}`);
      if (!hangarResponse.ok) {
        console.error('获取更新的共享机库数据失败');
        return;
      }

      const hangarData = await hangarResponse.json();

      // 直接更新Redux store中的数据
      store.dispatch(setImportItems({
        items: hangarData.items,
        currency: hangarData.currency,
        userId: userId,
        sharedHangarPath: currentSharedHangar
      }));

      console.log('共享机库数据已自动更新');
    }
  } catch (err) {
    console.error('检查共享机库更新失败', err);
  }
}

async function checkUserSession(token?: string) {
  if (!token) {
    return false;
  }

  const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/user`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  return response.ok;
}

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
  const dispatch = useDispatch();

  useEffect(() => {
    (async () => {
      checkSharedHangarUpdates();
      if (!user.token) return;
      const isSessionValid = await checkUserSession(user?.token);

      if (!isSessionValid) {
        console.log("Session is invalid, logging out");
        dispatch(logout());
      }
    })();
  }, [user, dispatch]);

  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
    },
  });

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
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
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
