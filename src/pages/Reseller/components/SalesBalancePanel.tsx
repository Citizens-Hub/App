import { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { useAuthApi } from '@/hooks';
import { useRelatedBalanceData } from '@/hooks/swr/orders';
import { RootState } from '@/store';
import {
  MarketItemType,
  MyWithdrawalRequestsResponse,
  ResellerBalanceTransaction,
  WithdrawalRequestItem,
} from '@/types';
import { formatOrderPublicId } from '@/utils/orderId';

const settlementStatusColor: Record<ResellerBalanceTransaction['settlementStatus'], 'success' | 'warning'> = {
  available: 'success',
  pending: 'warning',
};

const withdrawalStatusColor: Record<WithdrawalRequestItem['status'], 'warning' | 'success' | 'default'> = {
  pending: 'warning',
  paid: 'success',
  rejected: 'default',
};

function getItemTypeMessageId(itemType: MarketItemType) {
  switch (itemType) {
    case 'ccu':
      return 'reseller.balance.kind.ccu';
    case 'package':
      return 'reseller.balance.kind.package';
    case 'credit':
      return 'reseller.balance.kind.credit';
    default:
      return 'reseller.balance.kind.misc';
  }
}

function SummaryCard({
  titleId,
  titleDefaultMessage,
  value,
  caption,
}: {
  titleId: string;
  titleDefaultMessage: string;
  value: string;
  caption: string;
}) {
  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 3 }}>
      <Typography variant="body2" color="text.secondary">
        <FormattedMessage id={titleId} defaultMessage={titleDefaultMessage} />
      </Typography>
      <Typography variant="h5" sx={{ mt: 1, fontWeight: 700 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {caption}
      </Typography>
    </Paper>
  );
}

export default function SalesBalancePanel() {
  const intl = useIntl();
  const navigate = useNavigate();
  const token = useSelector((state: RootState) => state.user.user.token);
  const {
    summary,
    transactions,
    pagination,
    loading,
    error,
    handlePageChange,
    refresh,
  } = useRelatedBalanceData();
  const {
    data: withdrawalData,
    error: withdrawalError,
    isLoading: withdrawalLoading,
    mutate: mutateWithdrawalRequests,
  } = useAuthApi<MyWithdrawalRequestsResponse>('/api/withdrawals/me');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [accountInfo, setAccountInfo] = useState('');
  const [note, setNote] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const withdrawalRequests = withdrawalData?.requests || [];

  const formatUsd = (value: number) => value.toLocaleString(intl.locale, {
    style: 'currency',
    currency: summary.currency || 'USD',
  });

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) {
      return intl.formatMessage({
        id: 'reseller.withdrawal.none',
        defaultMessage: '-',
      });
    }

    return new Date(value).toLocaleString(intl.locale);
  };

  const formatWithdrawalStatus = (status: WithdrawalRequestItem['status']) => {
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

  const formatSettlementStatus = (status: ResellerBalanceTransaction['settlementStatus']) => {
    switch (status) {
      case 'available':
        return intl.formatMessage({ id: 'reseller.balance.status.available', defaultMessage: 'Withdrawable' });
      case 'pending':
        return intl.formatMessage({ id: 'reseller.balance.status.pending', defaultMessage: 'Pending' });
      default:
        return status;
    }
  };

  const getSettlementStatusTooltip = (transaction: ResellerBalanceTransaction) => {
    if (transaction.settlementStatus === 'available') {
      return intl.formatMessage({
        id: 'reseller.balance.status.available.tooltip',
        defaultMessage: 'Withdrawable now.',
      });
    }

    if (!transaction.shipped) {
      return intl.formatMessage({
        id: 'reseller.balance.status.pending.tooltip.unshipped',
        defaultMessage: 'Waiting for shipment.',
      });
    }

    if (transaction.settlementAvailableAt) {
      return intl.formatMessage(
        {
          id: 'reseller.balance.status.pending.tooltip.cooldown',
          defaultMessage: 'Withdrawable on {date}.',
        },
        { date: formatDateTime(transaction.settlementAvailableAt) },
      );
    }

    return intl.formatMessage({
      id: 'reseller.balance.status.pending.tooltip.default',
      defaultMessage: 'Pending settlement.',
    });
  };

  const handleRowClick = (orderId: string) => {
    navigate(`/reseller/orders/${orderId}`);
  };

  const handleSubmitWithdrawalRequest = async () => {
    try {
      setSubmitting(true);
      setSubmitError(null);
      setSubmitSuccess(null);

      const parsedAmount = Number(withdrawalAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error(intl.formatMessage({
          id: 'reseller.withdrawal.amountInvalid',
          defaultMessage: 'Enter a valid withdrawal amount.',
        }));
      }

      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/withdrawals/me`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: parsedAmount,
          accountInfo,
          note,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || intl.formatMessage({
          id: 'reseller.withdrawal.submitError',
          defaultMessage: 'Failed to submit withdrawal request.',
        }));
      }

      setWithdrawalAmount('');
      setAccountInfo('');
      setNote('');
      setSubmitSuccess(intl.formatMessage({
        id: 'reseller.withdrawal.submitSuccess',
        defaultMessage: 'Withdrawal request submitted.',
      }));

      await Promise.all([
        refresh(),
        mutateWithdrawalRequests(),
      ]);
    } catch (submitRequestError) {
      console.error(submitRequestError);
      setSubmitError(
        submitRequestError instanceof Error
          ? submitRequestError.message
          : intl.formatMessage({
              id: 'reseller.withdrawal.submitError',
              defaultMessage: 'Failed to submit withdrawal request.',
            }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              <FormattedMessage id="reseller.balance.title" defaultMessage="Sales Balance" />
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
              <FormattedMessage
                id="reseller.balance.description"
                defaultMessage="Track the money tied to your sold items in real time. Entries become withdrawable 7 days after shipment, while paid but unsettled entries remain pending."
              />
            </Typography>
          </div>
          <Button variant="outlined" onClick={() => void Promise.all([refresh(), mutateWithdrawalRequests()])}>
            <FormattedMessage id="reseller.balance.refresh" defaultMessage="Refresh" />
          </Button>
        </Box>

        {(error || withdrawalError) && (
          <Alert severity="error" sx={{ mt: 3 }}>
            <FormattedMessage id="reseller.balance.loadError" defaultMessage="Failed to load sales balance." />
          </Alert>
        )}
      </Paper>

      {loading ? (
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' } }}>
            <SummaryCard
              titleId="reseller.balance.withdrawable"
              titleDefaultMessage="Withdrawable Balance"
              value={formatUsd(summary.withdrawableBalance)}
              caption={intl.formatMessage(
                {
                  id: 'reseller.balance.withdrawableHelp',
                  defaultMessage: 'Income from orders shipped for at least 7 days, minus pending and paid withdrawals.',
                },
              )}
            />
            <SummaryCard
              titleId="reseller.balance.pendingWithdrawal"
              titleDefaultMessage="Pending Withdrawal"
              value={formatUsd(summary.pendingWithdrawalAmount)}
              caption={intl.formatMessage(
                {
                  id: 'reseller.balance.pendingWithdrawalHelp',
                  defaultMessage: '{count} requests are waiting for admin processing.',
                },
                { count: withdrawalRequests.filter((request) => request.status === 'pending').length },
              )}
            />
            <SummaryCard
              titleId="reseller.balance.pending"
              titleDefaultMessage="Pending Settlement"
              value={formatUsd(summary.pendingBalance)}
              caption={intl.formatMessage(
                {
                  id: 'reseller.balance.pendingHelp',
                  defaultMessage: '{count} paid transactions are waiting for shipment or the 7-day settlement window to pass.',
                },
                { count: summary.pendingCount },
              )}
            />
            <SummaryCard
              titleId="reseller.balance.totalRevenue"
              titleDefaultMessage="Total Revenue"
              value={formatUsd(summary.totalRevenue)}
              caption={intl.formatMessage(
                {
                  id: 'reseller.balance.totalRevenueHelp',
                  defaultMessage: 'Paid withdrawals: {amount}',
                },
                { amount: formatUsd(summary.paidWithdrawalAmount) },
              )}
            />
          </Box>

          <Paper elevation={0} sx={{ mt: 3, border: '1px solid', borderColor: 'divider', p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              <FormattedMessage id="reseller.withdrawal.title" defaultMessage="Submit Withdrawal Request" />
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
              <FormattedMessage
                id="reseller.withdrawal.description"
                defaultMessage="Submit the amount you want to withdraw together with your payout account details. Only orders shipped for at least 7 days count toward the withdrawable balance."
              />
            </Typography>

            <Box sx={{ mt: 3, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
              <TextField
                label={intl.formatMessage({ id: 'reseller.withdrawal.amount', defaultMessage: 'Amount' })}
                type="number"
                value={withdrawalAmount}
                onChange={(event) => setWithdrawalAmount(event.target.value)}
                inputProps={{ min: 0.01, max: summary.withdrawableBalance, step: 0.01 }}
                helperText={intl.formatMessage(
                  {
                    id: 'reseller.withdrawal.amountHelp',
                    defaultMessage: 'Withdrawable right now: {amount}',
                  },
                  { amount: formatUsd(summary.withdrawableBalance) },
                )}
              />
              <TextField
                label={intl.formatMessage({ id: 'reseller.withdrawal.accountInfo', defaultMessage: 'Payout Account Info' })}
                value={accountInfo}
                onChange={(event) => setAccountInfo(event.target.value)}
                multiline
                minRows={3}
                helperText={intl.formatMessage({
                  id: 'reseller.withdrawal.accountInfoHelp',
                  defaultMessage: 'Example: PayPal email, bank account, USDT address, or any instructions the admin needs.',
                })}
              />
            </Box>

            <TextField
              sx={{ mt: 2 }}
              fullWidth
              label={intl.formatMessage({ id: 'reseller.withdrawal.note', defaultMessage: 'Note' })}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              multiline
              minRows={3}
            />

            {submitError && (
              <Alert severity="error" sx={{ mt: 3 }}>
                {submitError}
              </Alert>
            )}

            {submitSuccess && (
              <Alert severity="success" sx={{ mt: 3 }}>
                {submitSuccess}
              </Alert>
            )}

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={() => void handleSubmitWithdrawalRequest()}
                disabled={submitting || summary.withdrawableBalance <= 0}
              >
                <FormattedMessage id="reseller.withdrawal.submit" defaultMessage="Submit Request" />
              </Button>
            </Box>
          </Paper>

          <Paper elevation={0} sx={{ mt: 3, border: '1px solid', borderColor: 'divider', p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              <FormattedMessage id="reseller.withdrawal.historyTitle" defaultMessage="Withdrawal History" />
            </Typography>

            {withdrawalLoading ? (
              <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table aria-label={intl.formatMessage({ id: 'reseller.withdrawal.table.ariaLabel', defaultMessage: 'Withdrawal history table' })}>
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <FormattedMessage id="reseller.withdrawal.table.id" defaultMessage="ID" />
                      </TableCell>
                      <TableCell>
                        <FormattedMessage id="reseller.withdrawal.table.amount" defaultMessage="Amount" />
                      </TableCell>
                      <TableCell>
                        <FormattedMessage id="reseller.withdrawal.table.accountInfo" defaultMessage="Payout Account" />
                      </TableCell>
                      <TableCell>
                        <FormattedMessage id="reseller.withdrawal.table.status" defaultMessage="Status" />
                      </TableCell>
                      <TableCell>
                        <FormattedMessage id="reseller.withdrawal.table.createdAt" defaultMessage="Requested At" />
                      </TableCell>
                      <TableCell>
                        <FormattedMessage id="reseller.withdrawal.table.processedAt" defaultMessage="Processed At" />
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {withdrawalRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          <FormattedMessage id="reseller.withdrawal.empty" defaultMessage="No withdrawal requests yet." />
                        </TableCell>
                      </TableRow>
                    ) : (
                      withdrawalRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>{request.id}</TableCell>
                          <TableCell>{formatUsd(request.amount)}</TableCell>
                          <TableCell sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            <Typography variant="body2">{request.accountInfo}</Typography>
                            {request.note && (
                              <Typography variant="caption" color="text.secondary">
                                {request.note}
                              </Typography>
                            )}
                            {request.adminNote && (
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                <FormattedMessage
                                  id="reseller.withdrawal.adminNote"
                                  defaultMessage="Admin note: {note}"
                                  values={{ note: request.adminNote }}
                                />
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={formatWithdrawalStatus(request.status)}
                              color={withdrawalStatusColor[request.status]}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>{formatDateTime(request.createdAt)}</TableCell>
                          <TableCell>{formatDateTime(request.processedAt)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>

          <TableContainer component={Paper} sx={{ mt: 3 }}>
            <Table
              sx={{ minWidth: 760 }}
              aria-label={intl.formatMessage({ id: 'reseller.balance.table.ariaLabel', defaultMessage: 'Reseller balance table' })}
            >
              <TableHead>
                <TableRow>
                  <TableCell>
                    <FormattedMessage id="reseller.balance.table.orderId" defaultMessage="Order ID" />
                  </TableCell>
                  <TableCell>
                    <FormattedMessage id="reseller.balance.table.item" defaultMessage="Item" />
                  </TableCell>
                  <TableCell>
                    <FormattedMessage id="reseller.balance.table.type" defaultMessage="Type" />
                  </TableCell>
                  <TableCell align="right">
                    <FormattedMessage id="reseller.balance.table.quantity" defaultMessage="Quantity / Face Value" />
                  </TableCell>
                  <TableCell align="right">
                    <FormattedMessage id="reseller.balance.table.amount" defaultMessage="Amount" />
                  </TableCell>
                  <TableCell>
                    <FormattedMessage id="reseller.balance.table.createdAt" defaultMessage="Sold At" />
                  </TableCell>
                  <TableCell align="right">
                    <FormattedMessage id="reseller.balance.table.status" defaultMessage="Status" />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <FormattedMessage id="reseller.balance.empty" defaultMessage="No sales transactions yet." />
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((transaction) => (
                    <TableRow
                      key={transaction.id}
                      hover
                      onClick={() => handleRowClick(transaction.orderId)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Tooltip title={transaction.orderId} placement="top-start">
                          <span style={{ fontFamily: 'monospace' }}>
                            {formatOrderPublicId(transaction.orderId)}
                          </span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {transaction.itemName}
                          </Typography>
                          {transaction.itemSubtitle && (
                            <Typography variant="caption" color="text.secondary">
                              {transaction.itemSubtitle}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={intl.formatMessage({
                            id: getItemTypeMessageId(transaction.itemType),
                            defaultMessage: transaction.itemType,
                          })}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        {transaction.itemType === 'credit' && transaction.creditAmount
                          ? intl.formatMessage(
                              { id: 'reseller.balance.creditAmount', defaultMessage: 'US${amount}' },
                              { amount: transaction.creditAmount },
                            )
                          : intl.formatMessage(
                              { id: 'reseller.balance.quantity', defaultMessage: 'x{count}' },
                              { count: transaction.quantity },
                            )}
                      </TableCell>
                      <TableCell align="right">
                        {formatUsd(transaction.grossAmount)}
                      </TableCell>
                      <TableCell>
                        {new Date(transaction.createdAt).toLocaleString(intl.locale)}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={getSettlementStatusTooltip(transaction)} placement="top">
                          <span>
                            <Chip
                              label={formatSettlementStatus(transaction.settlementStatus)}
                              color={settlementStatusColor[transaction.settlementStatus]}
                              size="small"
                            />
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {pagination.totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination
                count={pagination.totalPages}
                page={pagination.page}
                onChange={(_event, value) => handlePageChange(value)}
                color="primary"
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
