import { Fab, Tooltip } from '@mui/material';
import { HelpOutline } from '@mui/icons-material';
import { JoyrideLocale } from '../hooks/useJoyride';
import { useIntl } from 'react-intl';

interface JoyrideButtonProps {
  startJoyride: () => void;
  locale: JoyrideLocale;
}

export default function JoyrideButton({ 
  startJoyride, 
  locale
}: JoyrideButtonProps) {
  const intl = useIntl();
  
  return (
    <Tooltip title={intl.formatMessage({ id: 'joyride.tooltip', defaultMessage: '启动新手引导' })} placement="left">
      <Fab
        color="secondary"
        size="small"
        onClick={startJoyride}
        aria-label={locale.open}
        sx={{
          position: 'fixed',
          bottom: 80,
          right: 20,
          zIndex: 999,
        }}
      >
        <HelpOutline />
      </Fab>
    </Tooltip>
  );
} 