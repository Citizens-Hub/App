import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { FormattedMessage, useIntl } from 'react-intl';
import { RootState } from '@/store';
import { useTicketOrderOptions } from '@/hooks';
import { formatOrderPublicId } from '@/utils/orderId';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export default function TicketCreate() {
  const intl = useIntl();
  const navigate = useNavigate();
  const token = useSelector((state: RootState) => state.user.user.token);
  const [searchParams] = useSearchParams();
  const { data: orderOptionsData, isLoading: orderOptionsLoading } = useTicketOrderOptions();
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [relatedOrderId, setRelatedOrderId] = useState(searchParams.get('orderId') || '');
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const orderOptions = orderOptionsData?.orders || [];

  const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString(intl.locale) : '-';
  const formatUsd = (value: number) => value.toLocaleString(intl.locale, { style: 'currency', currency: 'USD' });

  const handleCreateTicket = async () => {
    try {
      setSubmitting(true);
      setFlash(null);

      const response = await fetch(`${API_BASE_URL}/api/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          subject,
          content,
          relatedOrderId: relatedOrderId || null,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || intl.formatMessage({
          id: 'tickets.createError',
          defaultMessage: 'Failed to create ticket.',
        }));
      }

      navigate(`/tickets/${payload.ticket.id}`, {
        replace: true,
        state: {
          flash: {
            severity: 'success',
            text: intl.formatMessage({
              id: 'tickets.createSuccess',
              defaultMessage: 'Ticket created successfully.',
            }),
          },
        },
      });
    } catch (createError) {
      setFlash({
        severity: 'error',
        text: createError instanceof Error
          ? createError.message
          : intl.formatMessage({
              id: 'tickets.createError',
              defaultMessage: 'Failed to create ticket.',
            }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-auto px-4 py-4 md:px-8 text-left">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/tickets')}>
            <FormattedMessage id="tickets.backToList" defaultMessage="Back to Tickets" />
          </Button>
          <div>
            <Typography variant="h5">
              <FormattedMessage id="tickets.create" defaultMessage="Create Ticket" />
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <FormattedMessage id="tickets.createDescription" defaultMessage="Describe the issue clearly and optionally link the related order." />
            </Typography>
          </div>
        </Box>

        {flash && <Alert severity={flash.severity}>{flash.text}</Alert>}

        <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField
              label={intl.formatMessage({ id: 'tickets.form.subject', defaultMessage: 'Subject' })}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              fullWidth
            />
            <TextField
              select
              label={intl.formatMessage({ id: 'tickets.form.relatedOrder', defaultMessage: 'Related Order' })}
              value={relatedOrderId}
              onChange={(event) => setRelatedOrderId(event.target.value)}
              fullWidth
              disabled={orderOptionsLoading}
            >
              <MenuItem value="">
                {intl.formatMessage({ id: 'tickets.noRelatedOrder', defaultMessage: 'None' })}
              </MenuItem>
              {orderOptions.map((order) => (
                <MenuItem key={order.id} value={order.id}>
                  {`${formatOrderPublicId(order.id)} · ${formatUsd(order.price)} · ${formatDateTime(order.createdAt)}`}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={intl.formatMessage({ id: 'tickets.form.content', defaultMessage: 'Message' })}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              multiline
              minRows={8}
              fullWidth
            />
            {orderOptionsLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                <CircularProgress size={20} />
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
              <Button onClick={() => navigate('/tickets')}>
                <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
              </Button>
              <Button
                variant="contained"
                onClick={() => void handleCreateTicket()}
                disabled={submitting || !subject.trim() || !content.trim()}
              >
                <FormattedMessage id="tickets.submit" defaultMessage="Submit Ticket" />
              </Button>
            </Box>
          </Box>
        </Paper>
      </div>
    </div>
  );
}
