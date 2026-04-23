import { Avatar, Box, Drawer, IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import { FormattedMessage, useIntl } from "react-intl";
import DiscordIcon from "../icons/DiscordIcon";
import GithubIcon from "../icons/GithubIcon";
import QQIcon from "../icons/QQIcon";
import LanguageSwitcher from "./LanguageSwitcher";
import { useEffect, useState } from "react";
import Brightness4Icon from '@mui/icons-material/Brightness4'
import Brightness7Icon from '@mui/icons-material/Brightness7'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import { MenuIcon } from "lucide-react";
import { navigation } from "../const/navigation";
import { Link, useLocation, useNavigate } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/";
import { logout } from "../store/userStore";
import HeaderAd from "./HeaderAd";
import { UserRole } from "@/types";
import { useApi } from "@/hooks/swr/useApi";
import ExchangeRateCalculator from "./ExchangeRateCalculator";
// import { addHistory, handleUnload, selectHistories } from "@/store/biStore";

interface HeaderProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const GITHUB_REPO_URL = "https://github.com/EduarteXD/citizenshub";
const DISCORD_INVITE_URL = "https://discord.gg/AEuRtb5Vy8";
const QQ_GROUP_URL = "http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=8xUvKd0aUkaz9TcvO0_rr01Ww1q-05Rg&authKey=cV5nXYxbni1F8jfOArwuzaRjgzET8SnEESFHAKaqRMDETZmlVqQA1LHGMUhA4nNM&noverify=0&group_code=1045858475";

// enum SCBoxTranslateStatus {
//   Available,
//   Translated,
//   NotAvailable,
// }

export default function Header({ darkMode, toggleDarkMode }: HeaderProps) {
  // const [translateApiAvailable, setTranslateApiAvailable] = useState<SCBoxTranslateStatus>(SCBoxTranslateStatus.NotAvailable);
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currency } = useSelector((state: RootState) => state.upgrades);
  const { user } = useSelector((state: RootState) => state.user);
  const intl = useIntl();
  const { locale } = intl;
  const pathname = useLocation().pathname;
  const { data: exchangeRateData } = useApi<{ usd: Record<string, number> }>('/api/currency');
  const exchangeRate = exchangeRateData?.usd?.[currency.toLowerCase()] || 0;
  const isChineseLocale = locale.startsWith('zh-CN');
  const isExchangeCalculatorPage = pathname.startsWith('/ccu-planner')
    || pathname.startsWith('/price-history')
    || pathname.startsWith('/hangar');
  const showExchangeCalculator = currency !== 'USD' && isExchangeCalculatorPage;
  const openExternalLink = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  const communityLinks = isChineseLocale
    ? [
      {
        key: 'qq',
        href: QQ_GROUP_URL,
        labelId: 'header.communityQQ',
        defaultMessage: 'QQ Group',
        icon: <QQIcon fontSize="small" />,
      },
      {
        key: 'github',
        href: GITHUB_REPO_URL,
        labelId: 'header.communityGithub',
        defaultMessage: 'GitHub Repository',
        icon: <GithubIcon fontSize="small" />,
      },
    ]
    : [
      {
        key: 'discord',
        href: DISCORD_INVITE_URL,
        labelId: 'header.communityDiscord',
        defaultMessage: 'Discord Server',
        icon: <DiscordIcon fontSize="small" />,
      },
      {
        key: 'github',
        href: GITHUB_REPO_URL,
        labelId: 'header.communityGithub',
        defaultMessage: 'GitHub Repository',
        icon: <GithubIcon fontSize="small" />,
      },
    ];
  const friendlyLinks = [
    {
      key: 'scm',
      href: 'https://scm.flowcld.com?from=citizenshub.app',
      labelId: 'header.friendlyLinkScm',
      defaultMessage: 'SCM',
    },
  ];

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

  const currentNavItem = findNavItemByPath(pathname);
  const currentPageName = intl.formatMessage({
    id: currentNavItem?.name || "navigation.home",
    defaultMessage: "Home",
  });
  const appName = intl.formatMessage({
    id: "navigate.title",
    defaultMessage: "Citizens' Hub",
  });

  useEffect(() => {
    document.title = intl.formatMessage(
      {
        id: "header.documentTitle",
        defaultMessage: "{appName} - {pageName}",
      },
      {
        appName,
        pageName: currentPageName,
      },
    );
  }, [appName, currentPageName, intl])

  // useEffect(() => {
  //   function handleMessage(event: MessageEvent) {
  //     if (event.source !== window) return;
  //     if (event.data?.type === 'SC-BOX-TRANSLATE-API-AVAILABLE') {
  //       setTranslateApiAvailable(SCBoxTranslateStatus.Available);
  //     }
  //     if (event.data?.type === 'TOGGLED-SC-BOX-TRANSLATE') {
  //       switch (event.data.action) {
  //         case 'on':
  //           setTranslateApiAvailable(SCBoxTranslateStatus.Translated);
  //           return;
  //         case 'off':
  //           setTranslateApiAvailable(SCBoxTranslateStatus.Available);
  //           return;
  //       }
  //     }
  //   }

  //   window.addEventListener('message', handleMessage);

  //   return () => window.removeEventListener('message', handleMessage);
  // }, []);

  // const toggleTranslate = () => {
  //   window.postMessage({
  //     type: 'SC_TRANSLATE_REQUEST',
  //     action: translateApiAvailable === SCBoxTranslateStatus.Available ? 'translate' : 'undoTranslate',
  //     requestId: Math.random().toString(36)
  //   }, '*');
  //   setTranslateApiAvailable(translateApiAvailable === SCBoxTranslateStatus.Available ? SCBoxTranslateStatus.Translated : SCBoxTranslateStatus.Available);
  // };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 flex w-full items-center justify-between gap-2 border-b border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-[#121212]"
    >
      <div className="flex items-center gap-2">
        <IconButton onClick={() => setMenuOpen(!menuOpen)} aria-label={intl.formatMessage({ id: "header.toggleMenu", defaultMessage: "Toggle menu" })}>
          <MenuIcon />
        </IconButton>
        {
          pathname !== "/" && <span className="hidden md:block">
            <Link
              to="/"
              // sx={{
              //   textDecoration: 'none',
              //   color: 'inherit',
              // }}
              className="text-black! dark:text-white! font-normal!"
              onClick={(e) => {
                e.preventDefault();
                navigate("/");
              }}
            >
              {intl.formatMessage({ id: "navigation.home", defaultMessage: "Home" })}
            </Link>
            <span>{" > "}</span>
          </span>
        }
        <span className="hidden md:block">{currentPageName}</span>
      </div>
      <HeaderAd />
      <div className="flex items-center gap-2 justify-end">
        {/* {translateApiAvailable !== SCBoxTranslateStatus.NotAvailable && (
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
        )} */}
        <LanguageSwitcher />
        {showExchangeCalculator && (
          <ExchangeRateCalculator
            currency={currency}
            exchangeRate={exchangeRate}
            trigger={
              <Tooltip title={intl.formatMessage({ id: 'exchangeCalculator.tooltip', defaultMessage: 'Open exchange rate calculator' })}>
                <IconButton
                  color="inherit"
                  sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
                  className="text-gray-800 dark:text-white"
                  aria-label={intl.formatMessage({ id: 'exchangeCalculator.tooltip', defaultMessage: 'Open exchange rate calculator' })}
                >
                  <SwapHorizIcon />
                </IconButton>
              </Tooltip>
            }
          />
        )}
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
          isChineseLocale ? (<IconButton
            onClick={() => openExternalLink(QQ_GROUP_URL)}
            color="inherit"
            sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
            className="text-gray-800 dark:text-white"
            aria-label={intl.formatMessage({ id: "header.openQQ", defaultMessage: "Open QQ group" })}
          >
            {/* <DiscordIcon /> */}
            <QQIcon />
          </IconButton>) : <IconButton
            onClick={() => openExternalLink(DISCORD_INVITE_URL)}
            color="inherit"
            sx={{ ml: 1, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}
            className="text-gray-800 dark:text-white"
            aria-label={intl.formatMessage({ id: "header.openDiscord", defaultMessage: "Open Discord server" })}
          >
            <DiscordIcon />
          </IconButton>
        }
        <IconButton
          onClick={() => openExternalLink(GITHUB_REPO_URL)}
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
                if (item.requireReseller) return [UserRole.Admin, UserRole.Reseller].includes(user.role)
                return true
              }).map((item) => (
                <Link
                  key={item.name}
                  to={item.path}
                  // underline="none"
                  onClick={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                    navigate(item.path);
                  }}
                  className={`py-2 px-3 rounded-md font-normal! transition-colors hover:bg-opacity-10 text-black! dark:text-white! ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/10'
                    }`}
                  // sx={{
                  //   color: darkMode ? '#fff' : '#000',
                  //   display: 'block',
                  //   fontSize: '1rem',
                  // }}
                >
                  {intl.formatMessage({ id: item.name, defaultMessage: item.name })}
                </Link>
              ))}
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-white/5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                <FormattedMessage id="header.communityLinks" defaultMessage="Community Links" />
              </div>
              <div className="flex flex-col gap-2">
                {communityLinks.map((link) => (
                  <Link
                    key={link.key}
                    to={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    // underline="none"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center font-normal! gap-2 rounded-md px-3 py-2 text-black! dark:text-white! transition-colors ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'
                      }`}
                    // sx={{
                    //   color: darkMode ? '#fff' : '#000',
                    // }}
                  >
                    {link.icon}
                    <span>{intl.formatMessage({ id: link.labelId, defaultMessage: link.defaultMessage })}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  <FormattedMessage id="header.friendlyLinks" defaultMessage="Friendly Links" />
                </div>
                <div className="flex flex-col gap-2">
                  {friendlyLinks.map((link) => (
                    <Link
                      key={link.key}
                      to={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      // underline="none"
                      onClick={() => setMenuOpen(false)}
                      className={`rounded-md px-3 py-2 font-normal! transition-colors text-black! dark:text-white! ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'
                        }`}
                      // sx={{
                      //   color: darkMode ? '#fff' : '#000',
                      //   display: 'block',
                      // }}
                    >
                      <span>{intl.formatMessage({ id: link.labelId, defaultMessage: link.defaultMessage })}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="text-center text-sm text-gray-500 dark:text-gray-300">
            <div className="text-md mb-2">
              <Link className="text-blue-500 block" to="https://www.robertsspaceindustries.com/enlist?referral=STAR-47BR-3ZWH" target="_blank" >
                STAR-47BR-3ZWH
              </Link>
              <span>
                <FormattedMessage
                  id="header.referralSupport"
                  defaultMessage="Use this referral code to support us"
                />
              </span>
            </div>
            <FormattedMessage
              id="header.unofficialDisclaimer"
              defaultMessage="This is an unofficial <starCitizenLink>Star Citizen</starCitizenLink> application, not affiliated with the Cloud Imperium group of companies."
              values={{
                starCitizenLink: (chunks) => (
                  <Link to="https://robertsspaceindustries.com" target="_blank" className="text-blue-500">{chunks}</Link>
                ),
              }}
            />
            <span className="dark:hidden">
              <Avatar src="/MadeByTheCommunity_White.png" sx={{ width: 100, height: 100, margin: '0 auto', my: 2 }} />
            </span>
            <span className="hidden dark:block">
              <Avatar src="/MadeByTheCommunity_Black.png" sx={{ width: 100, height: 100, margin: '0 auto', my: 2 }} />
            </span>
            <span>&copy; {new Date().getFullYear()} Citizens' Hub</span>
            <div className="text-black dark:text-white text-xs mt-1">
              {intl.formatMessage(
                {
                  id: 'header.appVersion',
                  defaultMessage: 'App version: {version}',
                },
                { version: import.meta.env.VITE_PUBLIC_RELEASE_VERSION },
              )}
            </div>
            <div className="text-black dark:text-white text-xs mt-1 scale-80">
              {intl.formatMessage(
                {
                  id: 'header.buildTime',
                  defaultMessage: 'Build ({time})',
                },
                { time: __BUILD_TIME__ },
              )}
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
