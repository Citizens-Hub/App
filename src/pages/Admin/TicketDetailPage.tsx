import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Rating,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { FormattedMessage, useIntl } from 'react-intl';
import { useAuthApi } from '@/hooks';
import { AdminTicketDetailResponse } from '@/types';
import { formatOrderPublicId } from '@/utils/orderId';
import TicketConversation from '@/components/tickets/TicketConversation';
import TicketRelatedOrderCard from '@/components/tickets/TicketRelatedOrderCard';
import TicketStatusChip from '@/components/tickets/TicketStatusChip';

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const intl = useIntl();
  const { data, error, isLoading } = useAuthApi<AdminTicketDetailResponse>(
    ticketId ? `/api/admin/tickets/${ticketId}` : null,
    { revalidateOnFocus: true },
  );
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const ticket = data?.ticket;
  const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString(intl.locale) : '-';

  useEffect(() => {
    const state = location.state as { flash?: { severity: 'success' | 'error'; text: string } } | null;
    if (state?.flash) {
      setFlash(state.flash);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  if (isLoading) {
    return (
      <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-auto px-4 py-4 md:px-8">
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <CircularProgress />
        </Box>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-auto px-4 py-4 md:px-8">
        <Alert severity="error">
          <FormattedMessage id="admin.tickets.detailLoadError" defaultMessage="Failed to load ticket detail." />
        </Alert>
      </div>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-auto px-4 py-4 md:px-8 text-left">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <div className="flex items-center gap-3">
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/admin/tickets')}>
              <FormattedMessage id="admin.tickets.backToList" defaultMessage="Back to Ticket List" />
            </Button>
            <div>
              <Typography variant="h5">{ticket.subject}</Typography>
              <Typography variant="body2" color="text.secondary">{ticket.id}</Typography>
            </div>
          </div>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            {ticket.status === 'open' && (
              <Button variant="contained" onClick={() => navigate(`/admin/tickets/${ticket.id}/reply`)}>
                <FormattedMessage id="tickets.reply" defaultMessage="Reply" />
              </Button>
            )}
            <TicketStatusChip status={ticket.status} />
          </Box>
        </Box>

        {flash && <Alert severity={flash.severity}>{flash.text}</Alert>}

        <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', textAlign: 'left' }} elevation={0}>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'left' }}>
            <FormattedMessage
              id="admin.tickets.detail.meta"
              defaultMessage="User {email} · Created {createdAt} · Updated {updatedAt}"
              values={{
                email: ticket.user?.email || '-',
                createdAt: formatDateTime(ticket.createdAt),
                updatedAt: formatDateTime(ticket.updatedAt),
              }}
            />
          </Typography>
          {ticket.relatedOrder?.id && (
            <Typography variant="body2" sx={{ mt: 1, textAlign: 'left' }}>
              <FormattedMessage
                id="tickets.relatedOrder"
                defaultMessage="Related order: {orderId}"
                values={{ orderId: formatOrderPublicId(ticket.relatedOrder.id) }}
              />
            </Typography>
          )}
        </Paper>

        <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', textAlign: 'left' }} elevation={0}>
          <Typography variant="h6" sx={{ mb: 2, textAlign: 'left' }}>
            <FormattedMessage id="tickets.messages" defaultMessage="Conversation" />
          </Typography>
          <TicketConversation messages={ticket.messages} />
        </Paper>

        <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', textAlign: 'left' }} elevation={0}>
          <Typography variant="h6" sx={{ mb: 2, textAlign: 'left' }}>
            <FormattedMessage id="admin.tickets.feedback" defaultMessage="Customer Feedback" />
          </Typography>
          {ticket.rating ? (
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Rating value={ticket.rating} readOnly />
              <Typography variant="body2" color="text.secondary">
                <FormattedMessage
                  id="tickets.feedbackSubmittedAt"
                  defaultMessage="Submitted at {time}"
                  values={{ time: formatDateTime(ticket.feedbackAt) }}
                />
              </Typography>
              {ticket.feedback ? (
                <Paper variant="outlined" sx={{ p: 2, whiteSpace: 'pre-wrap', textAlign: 'left' }}>
                  {ticket.feedback}
                </Paper>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage id="tickets.feedbackNoComment" defaultMessage="No written comment provided." />
                </Typography>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              <FormattedMessage id="admin.tickets.feedbackEmpty" defaultMessage="No feedback submitted yet." />
            </Typography>
          )}
        </Paper>

        <TicketRelatedOrderCard order={ticket.relatedOrderDetail} />
      </div>
    </div>
  );
}
