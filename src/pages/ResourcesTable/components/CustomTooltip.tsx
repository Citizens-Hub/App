import { TooltipRenderProps } from 'react-joyride';
import { Box, Button, Typography, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { JoyrideLocale } from '../hooks/useJoyride';

interface CustomTooltipProps extends TooltipRenderProps {
  locale: JoyrideLocale;
}

export default function CustomTooltip({
  backProps,
  closeProps,
  continuous,
  index,
  isLastStep,
  locale,
  primaryProps,
  skipProps,
  step,
  tooltipProps
}: CustomTooltipProps) {
  return (
    <Box
      {...tooltipProps}
      sx={{
        backgroundColor: 'white',
        borderRadius: 2,
        boxShadow: '0 0 10px rgba(0, 0, 0, 0.2)',
        color: '#333',
        maxWidth: '400px',
        padding: 2,
        position: 'relative',
        zIndex: 10000,
      }}
    >
      <IconButton 
        {...closeProps}
        size="small"
        sx={{ 
          position: 'absolute',
          right: 8, 
          top: 8 
        }}
      >
        <Close fontSize="small" />
      </IconButton>

      {step.title && (
        <Typography 
          variant="h6" 
          component="h4" 
          sx={{ 
            mb: 1,
            pr: 4
          }}
        >
          {step.title}
        </Typography>
      )}

      <Typography variant="body2" sx={{ mb: 2 }}>
        {step.content}
      </Typography>

      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        mt: 2
      }}>
        <Button
          {...skipProps}
          size="small"
          variant="text"
          color="inherit"
        >
          {locale.skip}
        </Button>

        <Box sx={{ 
          display: 'flex', 
          gap: 1
        }}>
          {index > 0 && (
            <Button
              {...backProps}
              size="small"
              variant="outlined"
            >
              {locale.back}
            </Button>
          )}

          {continuous && (
            <Button
              {...primaryProps}
              size="small"
              variant="contained"
              color="primary"
            >
              {isLastStep ? locale.last : locale.next}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
} 