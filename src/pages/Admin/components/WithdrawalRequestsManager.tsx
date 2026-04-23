import { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useAuthApi } from '@/hooks';
import { RootState } from '@/store';
import {
  AdminWithdrawalRequestsResponse,
  WithdrawalRequestItem,
  WithdrawalRequestStatus,
} from '@/types';

const statusColorMap: Record<WithdrawalRequestStatus, 'warning' | 'success' | 'default'> = {
  pending: 'warning',
  paid: 'success',
  rejected: 'default',
};

type PendingAction = {
  request: WithdrawalRequestItem;
  status: 'paid' | 'rejected';
} | null;

export default function WithdrawalRequestsManager() {
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const {
    data,
    error,
    isLoading,
    mutate,
  } = useAuthApi<AdminWithdrawalRequestsResponse>('/api/admin/withdrawals');
  const [statusFilter, setStatusFilter] = useState<'all' | WithdrawalRequestStatus>('all');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [adminNote, setAdminNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const requests = data?.requests || [];
  const summary = data?.summary || {
    totalCount: 0,
    pendingCount: 0,
    paidCount: 0,
    rejectedCount: 0,
    totalAmount: 0,
    pendingAmount: 0,
    paidAmount: 0,
  };

  const filteredRequests = statusFilter === 'all'
    ? requests
    : requests.filter((request) => request.status === statusFilter);

  const formatUsd = (value: number, currency: string = 'USD') => value.toLocaleString(intl.locale, {
    style: 'currency',
    currency,
  });

  const formatDateTime = (value?: string | null) => {
    if (!value) {
      return '-';
    }

    return new Date(value).toLocaleString(intl.locale);
  };

  const formatWithdrawalStatus = (status: WithdrawalRequestStatus) => {
    switch (status) {
      case 'pending':
        return intl.formatMessage({ id: 'reseller.withdrawal.status.pending', defaultMessage: 'Pending' });
      case 'paid':
        return intl.formatMessage({ id: 'reseller.withdrawal.status.paid', defaultMessage: 'Paid' });
      case 'rejected':
        return intl.formatMessage({ id: 'reseller.withdrawal.status.rejected', defaultMessage: 'Rejected' });
      default:
        return status;
    }
  };

  const openActionDialog = (request: WithdrawalRequestItem, status: 'paid' | 'rejected') => {
    setPendingAction({ request, status });
    setAdminNote('');
  };

  const closeActionDialog = () => {
    setPendingAction(null);
    setAdminNote('');
  };

  const handleSubmitAction = async () => {
    if (!pendingAction) {
      return;
    }

    try {
      setSubmitting(true);
      setFlash(null);

      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/admin/withdrawals/${pendingAction.request.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: pendingAction.status,
          adminNote,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || intl.formatMessage({
          id: 'admin.withdrawals.actionError',
          defaultMessage: 'Failed to process withdrawal request.',
        }));
      }

      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.withdrawals.actionSuccess',
          defaultMessage: 'Withdrawal request updated.',
        }),
      });
      closeActionDialog();
      await mutate();
    } catch (actionError) {
      console.error(actionError);
      setFlash({
        severity: 'error',
        text: actionError instanceof Error
          ? actionError.message
          : intl.formatMessage({
              id: 'admin.withdrawals.actionError',
              defaultMessage: 'Failed to process withdrawal request.',
            }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          <FormattedMessage id="admin.withdrawals.title" defaultMessage="Withdrawal Requests" />
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          <FormattedMessage
            id="admin.withdrawals.description"
            defaultMessage="Review reseller withdrawal requests, confirm payouts, or reject invalid requests."
          />
        </Typography>

        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={intl.formatMessage(
              { id: 'admin.withdrawals.summary.pending', defaultMessage: 'Pending {count}' },
              { count: summary.pendingCount },
            )}
            color="warning"
            size="small"
          />
          <Chip
            label={intl.formatMessage(
              { id: 'admin.withdrawals.summary.paid', defaultMessage: 'Paid {count}' },
              { count: summary.paidCount },
            )}
            color="success"
            size="small"
          />
          <Chip
            label={intl.formatMessage(
              { id: 'admin.withdrawals.summary.rejected', defaultMessage: 'Rejected {count}' },
              { count: summary.rejectedCount },
            )}
            size="small"
          />
          <Chip
            label={intl.formatMessage(
              { id: 'admin.withdrawals.summary.pendingAmount', defaultMessage: 'Pending amount {amount}' },
              { amount: formatUsd(summary.pendingAmount) },
            )}
            color="warning"
            size="small"
          />
          <Chip
            label={intl.formatMessage(
              { id: 'admin.withdrawals.summary.totalAmount', defaultMessage: 'Total requested {amount}' },
              { amount: formatUsd(summary.totalAmount) },
            )}
            size="small"
          />
        </Box>

        <TextField
          select
          sx={{ mt: 3, minWidth: 220 }}
          label={intl.formatMessage({ id: 'admin.withdrawals.filter.status', defaultMessage: 'Status' })}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | WithdrawalRequestStatus)}
          size="small"
        >
          <MenuItem value="all">
            <FormattedMessage id="admin.withdrawals.filter.all" defaultMessage="All" />
          </MenuItem>
          <MenuItem value="pending">
            <FormattedMessage id="reseller.withdrawal.status.pending" defaultMessage="Pending" />
          </MenuItem>
          <MenuItem value="paid">
            <FormattedMessage id="reseller.withdrawal.status.paid" defaultMessage="Paid" />
          </MenuItem>
          <MenuItem value="rejected">
            <FormattedMessage id="reseller.withdrawal.status.rejected" defaultMessage="Rejected" />
          </MenuItem>
        </TextField>
      </Paper>

      {flash && (
        <Alert severity={flash.severity}>
          {flash.text}
        </Alert>
      )}

      {error && (
        <Alert severity="error">
          <FormattedMessage id="admin.withdrawals.loadError" defaultMessage="Failed to load withdrawal requests." />
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table aria-label={intl.formatMessage({ id: 'admin.withdrawals.table.ariaLabel', defaultMessage: 'Withdrawal requests table' })}>
          <TableHead>
            <TableRow>
              <TableCell>
                <FormattedMessage id="admin.withdrawals.table.requester" defaultMessage="Requester" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.withdrawals.table.amount" defaultMessage="Amount" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.withdrawals.table.status" defaultMessage="Status" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.withdrawals.table.accountInfo" defaultMessage="Payout Account" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.withdrawals.table.timestamps" defaultMessage="Timestamps" />
              </TableCell>
              <TableCell align="right">
                <FormattedMessage id="admin.withdrawals.table.actions" defaultMessage="Actions" />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!isLoading && filteredRequests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <FormattedMessage id="admin.withdrawals.empty" defaultMessage="No withdrawal requests matched the current filter." />
                </TableCell>
              </TableRow>
            ) : (
              filteredRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {request.requester?.name || request.requester?.email || '-'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {request.requester?.email || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatUsd(request.amount, request.currency)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      <FormattedMessage
                        id="admin.withdrawals.balanceSnapshot"
                        defaultMessage="Snapshot {amount}"
                        values={{ amount: formatUsd(request.balanceSnapshot, request.currency) }}
                      />
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={formatWithdrawalStatus(request.status)}
                      color={statusColorMap[request.status]}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <Typography variant="body2">{request.accountInfo}</Typography>
                    {request.note && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        {request.note}
                      </Typography>
                    )}
                    {request.adminNote && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        <FormattedMessage
                          id="admin.withdrawals.adminNote"
                          defaultMessage="Admin note: {note}"
                          values={{ note: request.adminNote }}
                        />
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      <FormattedMessage
                        id="admin.withdrawals.requestedAt"
                        defaultMessage="Requested: {date}"
                        values={{ date: formatDateTime(request.createdAt) }}
                      />
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                      <FormattedMessage
                        id="admin.withdrawals.processedAt"
                        defaultMessage="Processed: {date}"
                        values={{ date: formatDateTime(request.processedAt) }}
                      />
                    </Typography>
                    {request.processedBy && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        <FormattedMessage
                          id="admin.withdrawals.processedBy"
                          defaultMessage="By: {email}"
                          values={{ email: request.processedBy.email }}
                        />
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {request.status === 'pending' ? (
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                        <Button size="small" variant="contained" onClick={() => openActionDialog(request, 'paid')}>
                          <FormattedMessage id="admin.withdrawals.markPaid" defaultMessage="Mark Paid" />
                        </Button>
                        <Button size="small" variant="outlined" color="inherit" onClick={() => openActionDialog(request, 'rejected')}>
                          <FormattedMessage id="admin.withdrawals.reject" defaultMessage="Reject" />
                        </Button>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        <FormattedMessage id="admin.withdrawals.processed" defaultMessage="Processed" />
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(pendingAction)} onClose={closeActionDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {pendingAction?.status === 'paid'
            ? intl.formatMessage({ id: 'admin.withdrawals.markPaid', defaultMessage: 'Mark Paid' })
            : intl.formatMessage({ id: 'admin.withdrawals.reject', defaultMessage: 'Reject' })}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {pendingAction?.status === 'paid'
              ? intl.formatMessage({
                  id: 'admin.withdrawals.dialog.paidDescription',
                  defaultMessage: 'Confirm that the payout has been completed. You can optionally leave a note for the reseller.',
                })
              : intl.formatMessage({
                  id: 'admin.withdrawals.dialog.rejectDescription',
                  defaultMessage: 'Reject this withdrawal request. You can optionally explain the reason to the reseller.',
                })}
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={4}
            label={intl.formatMessage({ id: 'admin.withdrawals.dialog.adminNote', defaultMessage: 'Admin Note' })}
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeActionDialog}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button variant="contained" onClick={() => void handleSubmitAction()} disabled={submitting}>
            {pendingAction?.status === 'paid'
              ? <FormattedMessage id="admin.withdrawals.markPaid" defaultMessage="Mark Paid" />
              : <FormattedMessage id="admin.withdrawals.reject" defaultMessage="Reject" />}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
