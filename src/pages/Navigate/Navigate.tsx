import { Box, Button, Card, CardContent, Container, Grid, Typography } from '@mui/material';
import { Link } from 'react-router';
import { FormattedMessage, useIntl } from 'react-intl';
import { useEffect } from 'react';

export default function Navigate() {
  const intl = useIntl();

  useEffect(() => {
    document.title = "Citizens' Hub - " + intl.formatMessage({ id: 'navigate.title', defaultMessage: 'Star Citizen Tools' });
  }, [intl]);

  const navigationItems = [
    {
      titleId: 'navigate.upgradeTitle',
      descriptionId: 'navigate.upgradeDesc',
      path: '/ccu-planner',
      icon: '🚀'
    },
    {
      titleId: 'navigate.storeTitle',
      descriptionId: 'navigate.storeDesc',
      path: '/store-preview',
      icon: '🛒'
    },
    {
      titleId: 'navigate.changelogTitle',
      descriptionId: 'navigate.changelogDesc',
      path: '/changelog',
      icon: '📋'
    },
    // {
    //   titleId: 'navigate.privacyTitle',
    //   descriptionId: 'navigate.privacyDesc',
    //   path: '/privacy',
    //   icon: '📜'
    // }
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ textAlign: 'center', mb: 6 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          <FormattedMessage id="navigate.title" defaultMessage="Star Citizen Tools" />
        </Typography>
        <Typography variant="h6" color="textSecondary">
          <FormattedMessage id="navigate.subtitle" defaultMessage="Useful tools for Star Citizen players" />
        </Typography>
      </Box>

      <Grid container spacing={4}>
        {navigationItems.map((item, index) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={index}>
            <Card 
              sx={{ 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column',
                transition: 'transform 0.3s, box-shadow 0.3s',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: '0 12px 20px rgba(0, 0, 0, 0.1)'
                }
              }}
            >
              <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h2" component="div" sx={{ fontSize: '3rem', mb: 2 }}>
                  {item.icon}
                </Typography>
                <Typography variant="h5" component="h2" gutterBottom>
                  <FormattedMessage id={item.titleId} />
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  <FormattedMessage id={item.descriptionId} />
                </Typography>
                <Box sx={{ mt: 'auto' }}>
                  <Button 
                    component={Link} 
                    to={item.path} 
                    variant="contained" 
                    color="primary" 
                    fullWidth
                  >
                    <FormattedMessage id="navigate.visit" defaultMessage="Visit" />
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
        <Typography variant="body2">
          © {new Date().getFullYear()} <FormattedMessage id="navigate.footer" defaultMessage="Star Citizen Tools" /> | <Link to="/privacy" style={{ color: 'inherit' }}><FormattedMessage id="navigate.privacy" defaultMessage="Privacy Policy" /></Link>
        </Typography>
      </Box>
    </Container>
  );
}
