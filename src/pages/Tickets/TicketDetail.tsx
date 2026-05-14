import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { RootState } from '@/store';
import { useTicketData } from '@/hooks';
import { formatOrderPublicId } from '@/utils/orderId';
import TicketStatusChip from '@/components/tickets/TicketStatusChip';
import TicketConversation from '@/components/tickets/TicketConversation';
import TicketRelatedOrderCard from '@/components/tickets/TicketRelatedOrderCard';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export default function TicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const { data: ticket, error, isLoading, mutate } = useTicketData(ticketId);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString(intl.locale) : '-';
  const statusAccentColor = useMemo(
    () => (ticket?.status === 'open' ? 'success.main' : 'text.disabled'),
    [ticket?.status],
  );
  const relatedOrderId = ticket?.relatedOrder?.id ?? ticket?.relatedOrderDetail?.id ?? null;

  useEffect(() => {
    const state = location.state as { flash?: { severity: 'success' | 'error'; text: string } } | null;
    if (state?.flash) {
      setFlash(state.flash);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const handleOpenRelatedOrder = (orderId: string) => {
    const orderPath = `/orders/${orderId}`;
    const targetUrl = window.location.hash.startsWith('#/')
      ? `${window.location.origin}${window.location.pathname}#${orderPath}`
      : `${window.location.origin}${orderPath}`;

    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const handleReply = async () => {
    if (!ticketId || !replyContent.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      setFlash(null);

      const response = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          content: replyContent.trim(),
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || intl.formatMessage({
          id: 'tickets.replyError',
          defaultMessage: 'Failed to send reply.',
        }));
      }

      setReplyContent('');
      await mutate();
      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'tickets.replySuccess',
          defaultMessage: 'Reply sent.',
        }),
      });
    } catch (replyError) {
      setFlash({
        severity: 'error',
        text: replyError instanceof Error
          ? replyError.message
          : intl.formatMessage({
              id: 'tickets.replyError',
              defaultMessage: 'Failed to send reply.',
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
          <FormattedMessage id="tickets.detailLoadError" defaultMessage="Failed to load ticket." />
        </Alert>
      </div>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-auto px-4 py-4 md:px-8 text-left">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 2, flexWrap: 'wrap' }}>
          <div className="flex flex-row items-center gap-4">
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/tickets')} variant="text">
              <FormattedMessage id="tickets.backToList" defaultMessage="Back to Tickets" />
            </Button>
          </div>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            {relatedOrderId && (
              <Button variant="text" onClick={() => handleOpenRelatedOrder(relatedOrderId)}>
                <FormattedMessage id="tickets.openRelatedOrder" defaultMessage="Open Related Order" />
              </Button>
            )}
          </Box>
        </Box>

        {flash && <Alert severity={flash.severity}>{flash.text}</Alert>}

        <div className="bg-white dark:bg-neutral-900 p-6 shadow-sm border border-gray-100 dark:border-neutral-700">
          <div className="flex flex-wrap gap-6 justify-between">
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <Typography
                  variant="h5"
                  fontWeight="bold"
                  sx={{
                    borderLeft: '4px solid',
                    borderLeftColor: statusAccentColor,
                    pl: 1,
                    wordBreak: 'break-word',
                  }}
                >
                  {ticket.subject}
                </Typography>
                <TicketStatusChip status={ticket.status} />
              </div>

              <div className="flex flex-col gap-2 items-start">
                <div>
                  <div className="text-xs text-gray-500 text-left">
                    <FormattedMessage id="tickets.ticketId" defaultMessage="Ticket ID" />
                  </div>
                  <div className="text-sm break-all">{ticket.id}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 text-left">
                    <FormattedMessage id="orderDetail.created" defaultMessage="Created At" />
                  </div>
                  <div className="text-sm">{formatDateTime(ticket.createdAt)}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 text-left">
                    <FormattedMessage id="orderDetail.updated" defaultMessage="Updated At" />
                  </div>
                  <div className="text-sm">{formatDateTime(ticket.updatedAt)}</div>
                </div>

                {relatedOrderId && (
                  <div>
                    <div className="text-xs text-gray-500 text-left">
                      <FormattedMessage id="tickets.relatedOrderLabel" defaultMessage="Related Order" />
                    </div>
                    <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                      {formatOrderPublicId(relatedOrderId)}
                    </Typography>
                  </div>
                )}
              </div>
            </div>

            <div className="text-right min-w-[180px]">
              <Typography variant="caption" color="text.secondary">
                <FormattedMessage id="tickets.messages" defaultMessage="Conversation" />
              </Typography>
              <div className="text-[16px] text-blue-500 font-bold">
                {intl.formatMessage(
                  { id: 'tickets.messageCount', defaultMessage: '{count} messages' },
                  { count: ticket.messages.length },
                )}
              </div>

              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                <FormattedMessage id="tickets.latestActivity" defaultMessage="Latest Activity" />
              </Typography>
              <Typography variant="body2">
                {formatDateTime(ticket.updatedAt)}
              </Typography>

              <Chip
                sx={{ mt: 2 }}
                size="small"
                variant="outlined"
                label={ticket.status === 'open'
                  ? intl.formatMessage({ id: 'tickets.awaitingReply', defaultMessage: 'Open for reply' })
                  : intl.formatMessage({ id: 'tickets.closedState', defaultMessage: 'Closed' })}
              />
            </div>
          </div>
        </div>

        <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            <FormattedMessage id="tickets.messages" defaultMessage="Conversation" />
          </Typography>
          <TicketConversation messages={ticket.messages} />
        </Paper>

        <TicketRelatedOrderCard
          order={ticket.relatedOrderDetail}
        />

        <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            <FormattedMessage id="tickets.reply" defaultMessage="Reply" />
          </Typography>

          {ticket.status !== 'open' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <FormattedMessage id="tickets.closedReplyHint" defaultMessage="This ticket is already closed and can no longer receive replies." />
            </Alert>
          )}

          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField
              fullWidth
              multiline
              minRows={8}
              value={replyContent}
              onChange={(event) => setReplyContent(event.target.value)}
              label={intl.formatMessage({ id: 'tickets.form.content', defaultMessage: 'Message' })}
              disabled={ticket.status !== 'open' || submitting}
              sx={{
                '& .MuiInputBase-input': {
                  textAlign: 'left',
                },
                '& .MuiInputBase-inputMultiline': {
                  textAlign: 'left',
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
              <Button onClick={() => setReplyContent('')} disabled={submitting || !replyContent}>
                <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
              </Button>
              <Button
                variant="contained"
                onClick={() => void handleReply()}
                disabled={submitting || ticket.status !== 'open' || !replyContent.trim()}
              >
                <FormattedMessage id="tickets.sendReply" defaultMessage="Send Reply" />
              </Button>
            </Box>
          </Box>
        </Paper>
      </div>
    </div>
  );
}
