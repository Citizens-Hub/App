import { forwardRef } from 'react';
import { Box } from '@mui/material';
import { BeaconRenderProps } from 'react-joyride';

// 自定义引导点组件
const CustomBeacon = forwardRef<HTMLElement, BeaconRenderProps>((props, ref) => {
  return (
    <Box
      component="span"
      ref={ref}
      {...props}
      sx={{
        animation: 'pulse 1.5s infinite',
        backgroundColor: 'primary.main',
        borderRadius: '50%',
        display: 'block',
        height: '30px',
        width: '30px',
        opacity: 0.4,
        '@keyframes pulse': {
          '0%': {
            boxShadow: '0 0 0 0 rgba(25, 118, 210, 0.6)',
          },
          '70%': {
            boxShadow: '0 0 0 15px rgba(25, 118, 210, 0)',
          },
          '100%': {
            boxShadow: '0 0 0 0 rgba(25, 118, 210, 0)',
          },
        },
      }}
    />
  );
});

CustomBeacon.displayName = 'CustomBeacon';

export default CustomBeacon; 