import { Button, Menu, MenuItem } from '@mui/material';
import { useLocale, Locale } from '../contexts/LocaleContext';
import { useState, MouseEvent } from 'react';
import { LanguageOutlined } from '@mui/icons-material';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = (newLocale: Locale) => {
    setLocale(newLocale);
    handleClose();
  };

  return (
    <>
      <Button
        variant="outlined"
        onClick={handleClick}
        size="small"
        sx={{ bgcolor: 'white' }}
        startIcon={<LanguageOutlined />}
      >
        {locale === 'zh-CN' ? '中文' : 'English'}
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
          onClick={() => handleLanguageChange('en-US')}
          selected={locale === 'en-US'}
        >
          English
        </MenuItem>
      </Menu>
    </>
  );
} 