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

  const handleLanguageChange = (newLocale: 'zh-CN' | 'en-US') => {
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