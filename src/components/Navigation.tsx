import { AppBar, Toolbar, Button, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router';

const Navigation = () => {
  return (
    <AppBar position="static" color="default" elevation={0}>
      <Toolbar>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button 
            color="inherit" 
            component={RouterLink} 
            to="/"
            sx={{
              padding: 0
            }}
          >
            资源列表
          </Button>
          <Button 
            color="inherit" 
            component={RouterLink} 
            to="/ccu-planner"
          >
            CCU计划器
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navigation; 