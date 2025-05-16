import { CssBaseline, ThemeProvider, Typography, createTheme } from '@mui/material'
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
import { FormattedMessage } from 'react-intl'

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

          <Route 
            path="/guide" 
            element={
              <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
                <Typography variant="h4" component="h1" gutterBottom><FormattedMessage id="guide.title" defaultMessage="Guide" /></Typography>
                <Guide />
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
