import { Box, Button, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { FormattedMessage } from 'react-intl';
import { useNavigate } from 'react-router';
import TicketsManager from './components/TicketsManager';

export default function TicketsPage() {
  const navigate = useNavigate();

  return (
    <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-auto px-4 py-4 md:px-8 text-left">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/admin')}>
            <FormattedMessage id="navigation.admin" defaultMessage="Admin" />
          </Button>
          <div>
            <Typography variant="h5">
              <FormattedMessage id="admin.tickets.title" defaultMessage="Support Tickets" />
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <FormattedMessage id="admin.tickets.description" defaultMessage="Review user support tickets, reply to messages, and close resolved requests." />
            </Typography>
          </div>
        </Box>

        <TicketsManager showOpenPageButton={false} showHeader={false} />
      </div>
    </div>
  );
}
