import { CssBaseline, ThemeProvider, createTheme, Button, Box } from '@mui/material'
import ResourcesTable from './pages/ResourcesTable/ResourcesTable'
import { useEffect, useState } from 'react'
import { Route, Routes, HashRouter } from 'react-router'
import CCUPlanner from './pages/CCUPlanner/CCUPlanner'

// 为window对象添加SCTranslateApi类型定义
declare global {
  interface Window {
    SCTranslateApi?: {
      translate: () => void
    }
  }
}

enum SCBoxTranslateStatus {
  Available,
  Translated,
  NotAvailable,
}

function App() {
  const [translateApiAvailable, setTranslateApiAvailable] = useState<SCBoxTranslateStatus>(SCBoxTranslateStatus.NotAvailable);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type === 'SC-BOX-TRANSLATE-API-AVAILABLE') {
        setTranslateApiAvailable(SCBoxTranslateStatus.Available);
      }
      if (event.data?.type === 'TOGGLED-SC-BOX-TRANSLATE') {
        switch (event.data.action) {
          case 'on':
            setTranslateApiAvailable(SCBoxTranslateStatus.Translated);
            return;
          case 'off':
            setTranslateApiAvailable(SCBoxTranslateStatus.Available);
            return;
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const theme = createTheme({
    palette: {
      mode: 'light',
    },
  });

  const toggleTranslate = () => {
    window.postMessage({ 
      type: 'SC_TRANSLATE_REQUEST', 
      action: translateApiAvailable === SCBoxTranslateStatus.Available ? 'translate' : 'undoTranslate', 
      requestId: Math.random().toString(36)
    }, '*');
    setTranslateApiAvailable(translateApiAvailable === SCBoxTranslateStatus.Available ? SCBoxTranslateStatus.Translated : SCBoxTranslateStatus.Available);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
        {translateApiAvailable !== SCBoxTranslateStatus.NotAvailable && (
          <Box sx={{ 
            position: 'fixed', 
            top: 20, 
            right: 20, 
            zIndex: 1000,
            backgroundColor: 'white',
            borderRadius: '5px',
            boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.1)',
          }}>
            <Button 
              variant="outlined"
              onClick={toggleTranslate}
              size="small"
              className="flex items-center gap-2"
            >
              <img src="/scbox.png" className="w-4 h-4" /><span>{translateApiAvailable === SCBoxTranslateStatus.Available ? '翻译' : '显示原文'}</span>
            </Button>
          </Box>
        )}
        <HashRouter>
          <Routes>
            <Route path="/" element={<ResourcesTable />} />
            <Route path="/ccu-planner" element={<CCUPlanner />} />
          </Routes>
        </HashRouter>
    </ThemeProvider>
  )
}

export default App
