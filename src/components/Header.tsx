import { Avatar, Box, Button, Drawer, IconButton, Link, Menu, MenuItem } from "@mui/material";
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
import { useLocation, useNavigate } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/";
import { logout } from "../store/userStore";
import HeaderAd from "./HeaderAd";
import { UserRole } from "@/types";
// import { addHistory, handleUnload, selectHistories } from "@/store/biStore";

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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  // const { currency } = useSelector((state: RootState) => state.upgrades);
  const { user } = useSelector((state: RootState) => state.user);
  const intl = useIntl();
  const { locale } = intl;
  const pathname = useLocation().pathname;

  // const leaveListener = useCallback(() => {
  //   console.log("unload>>>>")
  //   dispatch(handleUnload())
  // }, [dispatch])

  // useEffect(() => {
  //   window.addEventListener("beforeunload", leaveListener)
    
  //   return () => window.removeEventListener("beforeunload", leaveListener)
  // }, [])

  // const biItems = useSelector(selectHistories);

  // useEffect(() => {
  //   dispatch(addHistory({ page: pathname }))
  // }, [dispatch, pathname])

  // useEffect(() => {
  //   console.log(biItems)
  // }, [biItems])

  // 抽取的导航项查找函数
  const findNavItemByPath = (path: string) => {
    return navigation.find(item => {
      if (item.path.includes(':')) {
        const regexPath = new RegExp('^' + item.path.replace(/:[^/]+/g, '([^/]+)') + '$');
        return regexPath.test(path);
      }
      if (path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      return item.path === path;
    });
  };

  useEffect(() => {
    const currentNavItem = findNavItemByPath(pathname);
    document.title = "Citizens' Hub - " + intl.formatMessage({ id: currentNavItem?.name || "navigation.home" })
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
      className="flex items-center justify-between gap-2 border-b border-gray-200 w-full absolute bg-white top-0 right-0 p-3 dark:bg-[#121212] dark:border-gray-800"
    >
      <div className="flex items-center gap-2">
        <IconButton onClick={() => setMenuOpen(!menuOpen)} aria-label={intl.formatMessage({ id: "header.toggleMenu", defaultMessage: "Toggle menu" })}>
          <MenuIcon />
        </IconButton>
        {
          pathname !== "/" && <span className="hidden md:block">
            <Link
              href="/"
              sx={{
                textDecoration: 'none',
                color: 'inherit',
              }}
              onClick={(e) => {
                e.preventDefault();
                navigate("/");
              }}
            >
              {intl.formatMessage({ id: "navigation.home", defaultMessage: "Home" })}
            </Link>
            {" > "}
          </span>
        }
        <span className="hidden md:block">{intl.formatMessage({
          id: findNavItemByPath(pathname)?.name || "navigation.home", defaultMessage: "Home"
        })}</span>
      </div>
      <HeaderAd />
      <div className="flex items-center gap-2 justify-end">
        {translateApiAvailable !== SCBoxTranslateStatus.NotAvailable && (
          <Button
            variant="outlined"
            onClick={toggleTranslate}
            size="small"
            sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'white' }}
            className="flex items-center gap-2 text-gray-800 dark:text-white"
            aria-label={translateApiAvailable === SCBoxTranslateStatus.Available ? intl.formatMessage({ id: "app.translate", defaultMessage: "翻译" }) : intl.formatMessage({ id: "app.showOriginal", defaultMessage: "显示原文" })}
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
        {/* {
          locale === "zh-CN" && (<Button
            size="small"
            sx={{
              px: 1
            }}
            onClick={() => window.open("https://www.bilibili.com/opus/1064226212306485248", "_blank")}>
            使用说明
          </Button>)
        } */}
        <LanguageSwitcher />
        {/* <Button
          color="inherit"
          size="small"
          onClick={() => navigate('/app-settings')}
        >
          {currency}
        </Button> */}
        <IconButton
          onClick={toggleDarkMode}
          color="inherit"
          sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
          className="text-gray-800 dark:text-white"
          aria-label={darkMode ? intl.formatMessage({ id: "header.lightMode", defaultMessage: "Switch to light mode" }) : intl.formatMessage({ id: "header.darkMode", defaultMessage: "Switch to dark mode" })}
        >
          {darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
        </IconButton>
        {
          locale === "zh-CN" ? (<IconButton
            onClick={() => window.open("http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=8xUvKd0aUkaz9TcvO0_rr01Ww1q-05Rg&authKey=cV5nXYxbni1F8jfOArwuzaRjgzET8SnEESFHAKaqRMDETZmlVqQA1LHGMUhA4nNM&noverify=0&group_code=1045858475", "_blank")}
            color="inherit"
            sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
            className="text-gray-800 dark:text-white"
            aria-label={intl.formatMessage({ id: "header.openQQ", defaultMessage: "Open QQ group" })}
          >
            {/* <DiscordIcon /> */}
            <QQIcon />
          </IconButton>) : <IconButton
            onClick={() => window.open("https://discord.gg/AEuRtb5Vy8", "_blank")}
            color="inherit"
            sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
            className="text-gray-800 dark:text-white"
            aria-label={intl.formatMessage({ id: "header.openDiscord", defaultMessage: "Open Discord server" })}
          >
            <DiscordIcon />
          </IconButton>
        }
        <IconButton
          onClick={() => window.open("https://github.com/EduarteXD/citizenshub", "_blank")}
          color="inherit"
          sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
          className="text-gray-800 dark:text-white"
          aria-label={intl.formatMessage({ id: "header.openGithub", defaultMessage: "Open GitHub repository" })}
        >
          <GithubIcon />
        </IconButton>
        {
          !user?.role ? (
            <Box sx={{ position: 'relative' }}>
              <IconButton
                onClick={(event) => setAnchorEl(event.currentTarget)}
                sx={{ p: 0, ml: 1 }}
                aria-label={intl.formatMessage({ id: "header.openUserMenu", defaultMessage: "Open user menu" })}
              >
                <Avatar src={user?.avatar} />
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={() => setAnchorEl(null)}
              >
                <MenuItem onClick={() => navigate('/login')} aria-label={intl.formatMessage({ id: "user.login", defaultMessage: "Login/Register" })}>
                  <FormattedMessage id="user.login" defaultMessage="Login/Register" />
                </MenuItem>
              </Menu>
            </Box>
          ) : (
            <Box sx={{ position: 'relative' }}>
              <IconButton
                onClick={(event) => setAnchorEl(event.currentTarget)}
                sx={{ p: 0, ml: 1 }}
                aria-label={intl.formatMessage({ id: "header.openUserMenu", defaultMessage: "Open user menu" })}
              >
                <Avatar src={user?.avatar} />
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={() => setAnchorEl(null)}
              >
                <MenuItem onClick={() => navigate('/app-settings')} aria-label={intl.formatMessage({ id: "user.profile", defaultMessage: "Profile" })}>
                  <FormattedMessage id="user.profile" defaultMessage="Profile" />
                </MenuItem>
                <MenuItem onClick={() => dispatch(logout())} aria-label={intl.formatMessage({ id: "user.logout", defaultMessage: "Logout" })}>
                  <FormattedMessage id="user.logout" defaultMessage="Logout" />
                </MenuItem>
              </Menu>
            </Box>
          )
        }
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
        <div className="flex flex-col h-full justify-between">
          <div className="flex flex-col gap-6 p-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">
                <FormattedMessage id="app.menu" defaultMessage="菜单" />
              </h2>
              <IconButton onClick={() => setMenuOpen(false)} size="small" aria-label={intl.formatMessage({ id: "header.closeMenu", defaultMessage: "Close menu" })}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </IconButton>
            </div>
            <div className="flex flex-col gap-3">
              {navigation.filter(item => {
                if (item.hidden) return false
                if (item.requireAdmin) return user.role === UserRole.Admin
                return true
              }).map((item) => (
                <Link
                  key={item.name}
                  href={item.path}
                  underline="none"
                  onClick={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                    navigate(item.path);
                  }}
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
            <div className="text-black dark:text-white">
              <div className="flex justify-center gap-4">
                <IconButton
                  size="small"
                  onClick={() => window.open("https://github.com/EduarteXD/citizenshub", "_blank")}
                  color="inherit"
                  sx={{ bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
                  className="text-gray-800 dark:text-white"
                  aria-label={intl.formatMessage({ id: "header.openGithub", defaultMessage: "Open GitHub repository" })}
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
                    aria-label={intl.formatMessage({ id: "header.openQQ", defaultMessage: "Open QQ group" })}
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
                    aria-label={intl.formatMessage({ id: "header.openDiscord", defaultMessage: "Open Discord server" })}
                  >
                    <DiscordIcon />
                  </IconButton>
                )}
              </div>
            </div>
          </div>
          <div className="text-center text-sm text-gray-500 dark:text-gray-300">
            This is an unofficial <Link href="https://robertsspaceindustries.com" target="_blank" className="text-blue-500">Star Citizen</Link> application, not affiliated with the Cloud Imperium group of companies.
            <span className="dark:hidden">
              <Avatar src="/MadeByTheCommunity_White.png" sx={{ width: 100, height: 100, margin: '0 auto', my: 2 }} />
            </span>
            <span className="hidden dark:block">
              <Avatar src="/MadeByTheCommunity_Black.png" sx={{ width: 100, height: 100, margin: '0 auto', my: 2 }} />
            </span>
            &copy; {new Date().getFullYear()} Citizens' Hub
            <div className="text-black dark:text-white text-xs mt-1">App version: {import.meta.env.VITE_PUBLIC_RELEASE_VERSION}</div>
            <div className="text-black dark:text-white text-xs mt-1 scale-80">Build ({__BUILD_TIME__})</div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}