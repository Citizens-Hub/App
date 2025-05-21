import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import ResourcesTable from './pages/ResourcesTable/ResourcesTable'
import { useEffect, useLayoutEffect, useState } from 'react'
import { Route, BrowserRouter, Routes, useLocation, Navigate as RouterNavigate } from 'react-router'
import CCUPlanner from './pages/CCUPlanner/CCUPlanner'
import Privacy from './pages/Privacy/Privacy'
import ChangeLogs from './pages/ChangeLogs/ChangeLogs'
import Auth from './pages/Auth/Auth'
import Admin from './pages/Admin/Admin'
import Header from './components/Header'
import Navigate from './pages/Navigate/Navigate'
import Hangar from './pages/Hangar/Hangar'
import Settings from './pages/Settings/Settings'
import FleaMarket from './pages/FleaMarket/FleaMarket'
import { useSelector } from 'react-redux'
import { RootState } from './store'
import { UserRole } from './store/userStore'
import Guide from './pages/CCUPlanner/components/Guide'
import Share from './pages/Share/Share'
import { setImportItems } from './store/importStore'
import { store } from './store'

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

function RequireAuth({children, minRole}: {children: React.ReactNode, minRole: UserRole}) {
  const { pathname } = useLocation();
  const { user } = useSelector((state: RootState) => state.user);

  if (user.role < minRole) {
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

  // 应用启动时检查共享机库更新
  useEffect(() => {
    checkSharedHangarUpdates();
  }, []);

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
        <Routes>
          <Route path="/" element={<Navigate />} />
          <Route path="/ccu-planner" element={<CCUPlanner />} />
          <Route path="/hangar" element={<Hangar />} />
          <Route path="/flea-market" element={<FleaMarket />} />
          <Route path="/store-preview" element={<ResourcesTable />} />
          <Route path="/app-settings" element={<Settings />} />

          <Route path="/share/hangar/:userId" element={<Share />} />

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

          <Route path="/admin" element={<RequireAuth minRole={UserRole.Admin}><Admin /></RequireAuth>} />
          <Route path="/login" element={<Auth action="login" />} />
          <Route path="/register" element={<Auth action="register" />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
