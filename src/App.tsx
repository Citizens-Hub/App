import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import ResourcesTable from './pages/ResourcesTable/ResourcesTable'
import { useEffect, useLayoutEffect, useState } from 'react'
import { Route, BrowserRouter, Routes } from 'react-router'
import CCUPlanner from './pages/CCUPlanner/CCUPlanner'
import Privacy from './pages/Privacy/Privacy'
import ChangeLogs from './pages/ChangeLogs/ChangeLogs'
import Login from './pages/Login/Login'
import Admin from './pages/Admin/Admin'
import Header from './components/Header'
import Navigate from './pages/Navigate/Navigate'
import Hangar from './pages/Hangar/Hangar'
import Settings from './pages/Settings/Settings'

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

    if (!host.includes("citizenshub.app")) {
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
          <Route path="/store-preview" element={<ResourcesTable />} />
          <Route path="/app-settings" element={<Settings />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/changelog" element={<ChangeLogs />} />

          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
