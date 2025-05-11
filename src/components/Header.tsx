import { Button, Drawer, IconButton, Link } from "@mui/material";
import { FormattedMessage, useIntl } from "react-intl";
import DiscordIcon from "../icons/DiscordIcon";
import GithubIcon from "../icons/GithubIcon";
import QQIcon from "../icons/QQIcon";
import LanguageSwitcher from "./LanguageSwitcher";
import { useEffect, useState } from "react";
import Brightness4Icon from '@mui/icons-material/Brightness4'
import Brightness7Icon from '@mui/icons-material/Brightness7'
import { MenuIcon } from "lucide-react";
import { navigation } from "../const/navigation";
import { useLocation } from "react-router";

interface HeaderProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

enum SCBoxTranslateStatus {
  Available,
  Translated,
  NotAvailable,
}

export default function Header({ darkMode, toggleDarkMode }: HeaderProps) {
  const [translateApiAvailable, setTranslateApiAvailable] = useState<SCBoxTranslateStatus>(SCBoxTranslateStatus.NotAvailable);
  const [menuOpen, setMenuOpen] = useState(false);
  const intl = useIntl();
  const { locale } = intl;
  const pathname = useLocation().pathname;

  useEffect(() => {
    document.title = "Citizen's Hub - " + intl.formatMessage({ id: navigation.find(item => item.path === pathname)?.name || "navigation.home", defaultMessage: "Home" })
  }, [intl, pathname])

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

  const toggleTranslate = () => {
    window.postMessage({
      type: 'SC_TRANSLATE_REQUEST',
      action: translateApiAvailable === SCBoxTranslateStatus.Available ? 'translate' : 'undoTranslate',
      requestId: Math.random().toString(36)
    }, '*');
    setTranslateApiAvailable(translateApiAvailable === SCBoxTranslateStatus.Available ? SCBoxTranslateStatus.Translated : SCBoxTranslateStatus.Available);
  };

  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-gray-200 w-full absolute bg-white top-0 right-0 z-1000 p-3 dark:bg-[#121212] dark:border-gray-800"
    >
      <div className="flex items-center gap-2">
        <IconButton onClick={() => setMenuOpen(!menuOpen)}>
          <MenuIcon />
        </IconButton>
        {intl.formatMessage({ id: navigation.find(item => item.path === pathname)?.name || "navigation.home", defaultMessage: "Home" })}
      </div>
      <div className="flex items-center gap-2 justify-end">
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
            onClick={() => window.open("https://discord.gg/AEuRtb5Vy8", "_blank")}
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
      </div>
      <Drawer
        anchor="left"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: 320,
            padding: '20px',
            backgroundColor: darkMode ? '#1e1e1e' : '#fff',
            color: darkMode ? '#fff' : '#000',
            borderRight: darkMode ? '1px solid #333' : '1px solid #e0e0e0',
          }
        }}
      >
        <div className="flex flex-col gap-6 p-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">
              <FormattedMessage id="app.menu" defaultMessage="菜单" />
            </h2>
            <IconButton onClick={() => setMenuOpen(false)} size="small">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </IconButton>
          </div>
          <div className="flex flex-col gap-3">
            {navigation.filter(item => !item.hidden).map((item) => (
              <Link
                key={item.name}
                href={item.path}
                underline="none"
                onClick={() => setMenuOpen(false)}
                className={`py-2 px-3 rounded-md transition-colors hover:bg-opacity-10 ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/10'
                  }`}
                sx={{
                  color: darkMode ? '#fff' : '#000',
                  display: 'block',
                  fontSize: '1rem',
                }}
              >
                {intl.formatMessage({ id: item.name, defaultMessage: item.name })}
              </Link>
            ))}
          </div>
          <div className="mt-auto border-t pt-4 border-gray-200 dark:border-gray-700">
            <div className="flex justify-center gap-4">
              <IconButton
                size="small"
                onClick={() => window.open("https://github.com/EduarteXD/citizenshub", "_blank")}
                color="inherit"
                sx={{ bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
                className="text-gray-800 dark:text-white"
              >
                <GithubIcon />
              </IconButton>
              {locale === "zh-CN" ? (
                <IconButton
                  size="small"
                  onClick={() => window.open("http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=8xUvKd0aUkaz9TcvO0_rr01Ww1q-05Rg&authKey=cV5nXYxbni1F8jfOArwuzaRjgzET8SnEESFHAKaqRMDETZmlVqQA1LHGMUhA4nNM&noverify=0&group_code=1045858475", "_blank")}
                  color="inherit"
                  sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
                  className="text-gray-800 dark:text-white"
                >
                  <QQIcon />
                </IconButton>
              ) : (
                <IconButton
                  size="small"
                  onClick={() => window.open("https://discord.gg/AEuRtb5Vy8", "_blank")}
                  color="inherit"
                  sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
                  className="text-gray-800 dark:text-white"
                >
                  <DiscordIcon />
                </IconButton>
              )}
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}