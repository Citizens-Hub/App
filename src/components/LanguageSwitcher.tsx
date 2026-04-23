import {
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Switch,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { useLocale, type Locale } from '../contexts/LocaleContext';
import LanguageIcon from '@mui/icons-material/Language';
import CheckIcon from '@mui/icons-material/Check';
import { useIntl } from 'react-intl';

const LANGUAGE_OPTIONS: Array<{
  value: Locale;
  nativeLabel: string;
  shortLabel: string;
}> = [
  {
    value: 'zh-CN',
    nativeLabel: '简体中文',
    shortLabel: '简中',
  },
  {
    value: 'zh-HK',
    nativeLabel: '繁體中文',
    shortLabel: '繁中',
  },
  {
    value: 'en',
    nativeLabel: 'English',
    shortLabel: 'EN',
  },
  {
    value: 'ja-JP',
    nativeLabel: '日本語',
    shortLabel: '日本語',
  },
  {
    value: 'de-DE',
    nativeLabel: 'Deutsch',
    shortLabel: 'DE',
  },
];

export default function LanguageSwitcher() {
  const { locale, setLocale, shipNameTranslationEnabled, setShipNameTranslationEnabled } = useLocale();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const intl = useIntl();

  const currentLanguage = useMemo(
    () => LANGUAGE_OPTIONS.find((option) => option.value === locale) ?? LANGUAGE_OPTIONS[0],
    [locale],
  );

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = (newLocale: Locale) => {
    setLocale(newLocale);
    handleClose();
  };

  const handleShipNameTranslationToggle = () => {
    setShipNameTranslationEnabled(!shipNameTranslationEnabled);
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
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: 290,
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {intl.formatMessage({ id: 'header.language', defaultMessage: 'Switch language' })}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 700 }}>
            {currentLanguage.nativeLabel}
          </Typography>
        </Box>
        <Divider />
        {LANGUAGE_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            onClick={() => handleLanguageChange(option.value)}
            selected={locale === option.value}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              <CheckIcon
                fontSize="small"
                sx={{ opacity: locale === option.value ? 1 : 0, color: 'primary.main' }}
              />
            </ListItemIcon>
            <ListItemText primary={option.nativeLabel} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={handleShipNameTranslationToggle}
          sx={{
            alignItems: 'center',
            gap: 1,
            py: 1.25,
            whiteSpace: 'normal',
          }}
        >
          <ListItemText
            primary={intl.formatMessage({
              id: 'header.shipNameTranslation',
              defaultMessage: 'Ship name translation',
            })}
            secondary={intl.formatMessage({
              id: 'header.shipNameTranslationHint',
              defaultMessage: 'Show translated ship names when translations are available.',
            })}
            slotProps={{
              primary: { sx: { fontWeight: 600 } },
              secondary: { sx: { mt: 0.25, lineHeight: 1.4 } },
            }}
          />
          <Switch
            edge="end"
            checked={shipNameTranslationEnabled}
            onChange={handleShipNameTranslationToggle}
            onClick={(event) => event.stopPropagation()}
            inputProps={{
              'aria-label': intl.formatMessage({
                id: 'header.shipNameTranslation',
                defaultMessage: 'Ship name translation',
              }),
            }}
          />
        </MenuItem>
      </Menu>
    </>
  );
}
