import { Button, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import LanguageIcon from '@mui/icons-material/Language';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = (newLocale: 'zh-CN' | 'en' | 'ja-JP') => {
    setLocale(newLocale);
    handleClose();
  };

  return (
    <>
      <Button
        color="inherit"
        onClick={handleClick}
        startIcon={<LanguageIcon />}
        size="small"
        sx={{
          px: 1
        }}
      >
        {(() => {
          switch (locale) {
            case 'zh-CN':
              return '中文';
            case 'en':
              return 'English';
            case 'ja-JP':
              return '日本語';
          }
        })()}
      </Button>
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
      </Menu>
    </>
  );
} 