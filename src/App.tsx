import { CssBaseline, ThemeProvider, createTheme, Button, Box, IconButton } from '@mui/material'
import ResourcesTable from './pages/ResourcesTable/ResourcesTable'
import { useEffect, useState } from 'react'
import { Route, BrowserRouter, Routes } from 'react-router'
import CCUPlanner from './pages/CCUPlanner/CCUPlanner'
import { useDispatch } from 'react-redux'
import { addUpgrade } from './store'
import Privacy from './pages/Privacy/Privacy'
import { FormattedMessage } from 'react-intl'
import LanguageSwitcher from './components/LanguageSwitcher'
import Navigate from './pages/Navigate/Navigate'
import Brightness4Icon from '@mui/icons-material/Brightness4'
import Brightness7Icon from '@mui/icons-material/Brightness7'
import DiscordIcon from './icons/DiscordIcon'
import { useLocale } from './contexts/LocaleContext'
import QQIcon from './icons/QQIcon'
import ChangeLogs from './pages/ChangeLogs/ChangeLogs'
import GithubIcon from './icons/GithubIcon'
import { reportError } from './report'

enum SCBoxTranslateStatus {
  Available,
  Translated,
  NotAvailable,
}

function App() {
  const [translateApiAvailable, setTranslateApiAvailable] = useState<SCBoxTranslateStatus>(SCBoxTranslateStatus.NotAvailable);
  const [darkMode, setDarkMode] = useState<boolean>();

  const { locale } = useLocale();

  const dispatch = useDispatch();

  const tryResolveCCU = (content: { name: string }) => {
    const name = content.name;

    let from = "";
    let to = "";

    try {
      const regExp = /Upgrade\s*-\s*(.*?)\s+to\s+(.*?)(?:\s+\w+\s+Edition)/
      const match = name.match(regExp);

      if (!match) {
        from = name.split("to")[0].split("-")[1].trim()
        to = (name.split("to")[1]).trim().split(" ").slice(0, -2).join(" ")
      } else {
        from = match[1].trim() || name.split("to")[0].split("-")[1].trim()
        to = match[2].trim() || (name.split("to")[1]).trim().split(" ").slice(0, -2).join(" ")
      }
    } catch (error) {
      console.warn("error parsing ccu", name, "error >>>>", error, "reporting");
      reportError({
        errorType: "CCU_PARSING_ERROR",
        errorMessage: JSON.stringify({
          content,
          error: String(error),
        }),
      });
      return false;
    }

    return { from, to };
  }

  useEffect(() => {
    const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;

    if (localStorage.getItem('darkMode') === null) {
      setDarkMode(!isLight);
    }
  }, [])

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

            const parsed = tryResolveCCU(content);

            if (!parsed) return;

            dispatch(addUpgrade({
              from: content.match_items[0],
              to: content.target_items[0],
              name: content.name,
              value: parseInt((value as string).replace("$", "").replace(" USD", "")),
              parsed
            }));
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

            const parsed = tryResolveCCU(content);

            if (!parsed) return;

            dispatch(addUpgrade({
              from: content.match_items[0],
              to: content.target_items[0],
              name: content.name,
              value: parseInt((value as string).replace("$", "").replace(" USD", "")),
              parsed
            }));
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

    return () => window.removeEventListener('message', handleMessage);
  }, [dispatch]);

  useEffect(() => {
    if (darkMode === undefined) {
      return;
    }

    localStorage.setItem('darkMode', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
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
      <Box sx={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 1000,
        display: 'flex',
      }}>
        {
          locale === "zh-CN" && (<Button 
            size="small"
            sx={{
              px: 1
            }} 
            onClick={() => window.open("https://www.bilibili.com/opus/1064226212306485248", "_blank")}>
              使用说明
          </Button>)
        }
        <LanguageSwitcher />
        <IconButton
          onClick={toggleDarkMode}
          color="inherit"
          sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
          className="text-gray-800 dark:text-white"
        >
          {darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
        </IconButton>
        {
          locale === "zh-CN" ? (<IconButton
            onClick={() => window.open("http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=8xUvKd0aUkaz9TcvO0_rr01Ww1q-05Rg&authKey=cV5nXYxbni1F8jfOArwuzaRjgzET8SnEESFHAKaqRMDETZmlVqQA1LHGMUhA4nNM&noverify=0&group_code=1045858475", "_blank")}
            color="inherit"
            sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
            className="text-gray-800 dark:text-white"
          >
            {/* <DiscordIcon /> */}
            <QQIcon />
          </IconButton>) : <IconButton
            onClick={() => window.open("https://discord.gg/qFvv4YJ4", "_blank")}
            color="inherit"
            sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
            className="text-gray-800 dark:text-white"
          >
            <DiscordIcon />
          </IconButton>
        }
        <IconButton
          onClick={() => window.open("https://github.com/EduarteXD/citizenshub", "_blank")}
          color="inherit"
          sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
          className="text-gray-800 dark:text-white"
        >
          <GithubIcon />
        </IconButton>
        {translateApiAvailable !== SCBoxTranslateStatus.NotAvailable && (
          <Button
            variant="outlined"
            onClick={toggleTranslate}
            size="small"
            sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'white' }}
            className="flex items-center gap-2 text-gray-800 dark:text-white"
          >
            <img src="/scbox.png" className="w-4 h-4" />
            <span>
              {translateApiAvailable === SCBoxTranslateStatus.Available ? (
                <FormattedMessage id="app.translate" defaultMessage="翻译" />
              ) : (
                <FormattedMessage id="app.showOriginal" defaultMessage="显示原文" />
              )}
            </span>
          </Button>
        )}
      </Box>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate />} />
          <Route path="/ccu-planner" element={<CCUPlanner />} />
          <Route path="/store-preview" element={<ResourcesTable />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/changelog" element={<ChangeLogs />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
