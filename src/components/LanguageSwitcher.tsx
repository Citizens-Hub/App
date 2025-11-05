import { IconButton, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import LanguageIcon from '@mui/icons-material/Language';
import { useIntl } from 'react-intl';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const intl = useIntl();
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = (newLocale: 'zh-CN' | 'en' | 'ja-JP' | 'de-DE') => {
    setLocale(newLocale);
    handleClose();
  };

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClick}
        size="small"
        sx={{ ml: 1 }}
        className="text-gray-800 dark:text-white"
        aria-label={intl.formatMessage({ id: "header.language", defaultMessage: "Switch language" })}
      >
        <LanguageIcon />
        {/* {(() => {
          switch (locale) {
            case 'zh-CN':
              return '中文';
            case 'en':
              return 'English';
            case 'ja-JP':
              return '日本語';
            case 'de-DE':
              return 'Deutsch';
          }
        })()} */}
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
      >
        <MenuItem 
          onClick={() => handleLanguageChange('zh-CN')}
          selected={locale === 'zh-CN'}
        >
          中文
        </MenuItem>
        <MenuItem 
          onClick={() => handleLanguageChange('en')}
          selected={locale === 'en'}
        >
          English
        </MenuItem>
        <MenuItem 
          onClick={() => handleLanguageChange('ja-JP')}
          selected={locale === 'ja-JP'}
        >
          日本語
        </MenuItem>
        <MenuItem 
          onClick={() => handleLanguageChange('de-DE')}
          selected={locale === 'de-DE'}
        >
          Deutsch
        </MenuItem>
      </Menu>
    </>
  );
} 