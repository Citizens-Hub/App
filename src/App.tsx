import { Container, CssBaseline, ThemeProvider, createTheme, Button, Box } from '@mui/material'
// import './App.css'
import ResourcesTable from './components/ResourcesTable'
import { useEffect, useState } from 'react'

// 为window对象添加SCTranslateApi类型定义
declare global {
  interface Window {
    SCTranslateApi?: {
      translate: () => void
    }
  }
}

function App() {
  const [translateApiAvailable, setTranslateApiAvailable] = useState(false);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type === 'SC-BOX-TRANSLATE-API-AVAILABLE') {
        console.log('translateApiAvailable', event.data);
        setTranslateApiAvailable(true);
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

  const handleTranslate = () => {
    if (window.SCTranslateApi) {
      window.SCTranslateApi.translate();
      setTranslateApiAvailable(false);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg">
        {translateApiAvailable && (
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
              startIcon={<img src="/scbox.png" className="w-4 h-4" />} 
              onClick={handleTranslate}
              size="small"
            >
              翻译
            </Button>
          </Box>
        )}
        <ResourcesTable />
      </Container>
    </ThemeProvider>
  )
}

export default App
