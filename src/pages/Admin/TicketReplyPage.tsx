import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { FormattedMessage, useIntl } from 'react-intl';
import { RootState } from '@/store';
import { useAuthApi } from '@/hooks';
import { AdminTicketDetailResponse, TicketStatus } from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export default function TicketReplyPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const { data, error, isLoading } = useAuthApi<AdminTicketDetailResponse>(
    ticketId ? `/api/admin/tickets/${ticketId}` : null,
    { revalidateOnFocus: true },
  );
  const [replyContent, setReplyContent] = useState('');
  const [closeTicket, setCloseTicket] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const ticket = data?.ticket;

  const handleSubmit = async () => {
    if (!ticketId) return;

    try {
      setSubmitting(true);
      setFlash(null);

      const response = await fetch(`${API_BASE_URL}/api/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          content: replyContent || undefined,
          status: closeTicket ? 'closed' as TicketStatus : undefined,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || intl.formatMessage({
          id: 'admin.tickets.updateError',
          defaultMessage: 'Failed to update ticket.',
        }));
      }

      navigate(`/admin/tickets/${ticketId}`, {
        replace: true,
        state: {
          flash: {
            severity: 'success',
            text: intl.formatMessage({
              id: 'admin.tickets.updateSuccess',
              defaultMessage: 'Ticket updated.',
            }),
          },
        },
      });
    } catch (updateError) {
      setFlash({
        severity: 'error',
        text: updateError instanceof Error
          ? updateError.message
          : intl.formatMessage({
              id: 'admin.tickets.updateError',
              defaultMessage: 'Failed to update ticket.',
            }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseOnly = async () => {
    if (!ticketId) return;

    try {
      setSubmitting(true);
      setFlash(null);

      const response = await fetch(`${API_BASE_URL}/api/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          status: 'closed' as TicketStatus,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || intl.formatMessage({
          id: 'admin.tickets.updateError',
          defaultMessage: 'Failed to update ticket.',
        }));
      }

      navigate(`/admin/tickets/${ticketId}`, {
        replace: true,
        state: {
          flash: {
            severity: 'success',
            text: intl.formatMessage({
              id: 'admin.tickets.updateSuccess',
              defaultMessage: 'Ticket updated.',
            }),
          },
        },
      });
    } catch (updateError) {
      setFlash({
        severity: 'error',
        text: updateError instanceof Error
          ? updateError.message
          : intl.formatMessage({
              id: 'admin.tickets.updateError',
              defaultMessage: 'Failed to update ticket.',
            }),
      });
    } finally {
      setSubmitting(false);
    }
  };

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
    <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-auto px-4 py-4 md:px-8">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/admin/tickets/${ticket.id}`)}>
            <FormattedMessage id="admin.tickets.backToDetail" defaultMessage="Back to Ticket" />
          </Button>
          <div>
            <Typography variant="h5">
              <FormattedMessage id="admin.tickets.replyTitle" defaultMessage="Reply to Ticket" />
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {ticket.subject}
            </Typography>
          </div>
        </Box>

        {flash && <Alert severity={flash.severity}>{flash.text}</Alert>}

        {ticket.status !== 'open' && (
          <Alert severity="info">
            <FormattedMessage id="tickets.closedReplyHint" defaultMessage="This ticket is already closed and can no longer receive replies." />
          </Alert>
        )}

        <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField
              fullWidth
              multiline
              minRows={8}
              label={intl.formatMessage({ id: 'admin.tickets.replyLabel', defaultMessage: 'Reply message' })}
              value={replyContent}
              onChange={(event) => setReplyContent(event.target.value)}
              disabled={ticket.status !== 'open'}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={closeTicket}
                onChange={(event) => setCloseTicket(event.target.checked)}
                disabled={ticket.status !== 'open'}
              />
              <span>{intl.formatMessage({ id: 'admin.tickets.closeAfterReply', defaultMessage: 'Close ticket after sending this reply' })}</span>
            </label>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Button onClick={() => void handleCloseOnly()} disabled={submitting || ticket.status !== 'open'}>
                <FormattedMessage id="admin.tickets.closeTicket" defaultMessage="Close Ticket" />
              </Button>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button onClick={() => navigate(`/admin/tickets/${ticket.id}`)}>
                  <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
                </Button>
                <Button
                  variant="contained"
                  onClick={() => void handleSubmit()}
                  disabled={submitting || ticket.status !== 'open' || !replyContent.trim()}
                >
                  <FormattedMessage id="tickets.sendReply" defaultMessage="Send Reply" />
                </Button>
              </Box>
            </Box>
          </Box>
        </Paper>
      </div>
    </div>
  );
}
