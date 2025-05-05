import { CssBaseline, ThemeProvider, createTheme, Button, Box } from '@mui/material'
import ResourcesTable from './pages/ResourcesTable/ResourcesTable'
import { useEffect, useState } from 'react'
import { Route, BrowserRouter, Routes } from 'react-router'
import CCUPlanner from './pages/CCUPlanner/CCUPlanner'
import { useDispatch } from 'react-redux'
import { addUpgrade } from './store'
import Privacy from './pages/Privacy/Privacy'

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

  const dispatch = useDispatch();

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type === 'ccuPlannerAppIntegrationResponse') {
        if (event.data.message.requestId === 2) {
          const htmlString = event.data.message.value.data;
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlString, 'text/html');

          const totalPages = parseInt(new URL("https://robertsspaceindustries.com" + doc.querySelector(".raquo")?.getAttribute("href") as string).searchParams.get("page") || "1");

          for (let i = 2; i <= totalPages; i++) {
            window.postMessage({
              type: 'ccuPlannerAppIntegrationRequest',
              message: {
                type: "httpRequest",
                request: {
                  "url": `https://robertsspaceindustries.com/en/account/pledges?page=${i}&product-type=upgrade`,
                  "responseType": "text",
                  "method": "get",
                  "data": null
                },
                requestId: i + 1
              }
            }, '*');
          }

          const listItems = doc.body.querySelector('.list-items');

          listItems?.querySelectorAll('li').forEach(li => {
            const content = JSON.parse(li.querySelector('.js-upgrade-data')?.getAttribute('value') || "{}")
            const value = li.querySelector('.js-pledge-value')?.getAttribute('value');

            dispatch(addUpgrade({ from: content.match_items[0], to: content.target_items[0], name: content.name, value: parseInt((value as string).replace("$", "").replace(" USD", "")) }));
          });
        }
        if (event.data.message.requestId > 2) {
          const htmlString = event.data.message.value.data;
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlString, 'text/html');

          const listItems = doc.body.querySelector('.list-items');

          listItems?.querySelectorAll('li').forEach(li => {
            const content = JSON.parse(li.querySelector('.js-upgrade-data')?.getAttribute('value') || "{}")
            const value = li.querySelector('.js-pledge-value')?.getAttribute('value');

            dispatch(addUpgrade({ from: content.match_items[0], to: content.target_items[0], name: content.name, value: parseInt((value as string).replace("$", "").replace(" USD", "")) }));
          });
        }
      }
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

    // window.postMessage({
    //   type: 'ccuPlannerAppIntegrationRequest',
    //   message: {
    //     type: "connect",
    //     requestId: 1
    //   }
    // }, '*');

    // window.postMessage({
    //   type: 'ccuPlannerAppIntegrationRequest',
    //   message: {
    //     type: "httpRequest",
    //     request: {
    //       "url": "https://robertsspaceindustries.com/en/account/pledges?page=1&product-type=upgrade",
    //       "responseType": "text",
    //       "method": "get",
    //       "data": null
    //     },
    //     requestId: 2
    //   }
    // }, '*');

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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ResourcesTable />} />
          <Route path="/ccu-planner" element={<CCUPlanner />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
