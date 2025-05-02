import { Fab, Tooltip } from '@mui/material';
import { HelpOutline } from '@mui/icons-material';
import { JoyrideLocale, defaultLocale } from '../hooks/useJoyride';

interface JoyrideButtonProps {
  startJoyride: () => void;
  locale?: JoyrideLocale;
}

export default function JoyrideButton({ 
  startJoyride, 
  locale = defaultLocale 
}: JoyrideButtonProps) {
  return (
    <Tooltip title="启动新手引导" placement="left">
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