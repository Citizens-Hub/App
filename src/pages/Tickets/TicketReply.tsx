import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Box, CircularProgress } from '@mui/material';

export default function TicketReply() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (ticketId) {
      navigate(`/tickets/${ticketId}`, { replace: true, state: location.state });
    }
  }, [ticketId, location.state, navigate]);

  return (
    <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-auto px-4 py-4 md:px-8">
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    </div>
  );
}
