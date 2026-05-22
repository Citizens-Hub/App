import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
  Rating,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useAuthApi } from '@/hooks';
import { RootState } from '@/store';
import { AdminOrderDetailResponse, AdminOrderItem, AdminOrderListResponse, OrderStatus } from '@/types';
import { formatOrderPublicId } from '@/utils/orderId';
import { formatOrderUsdPrice, getOrderChargedAmount } from '@/pages/Orders/orderI18n';

const STATUS_OPTIONS: Array<'all' | OrderStatus> = [
  'all',
  OrderStatus.Pending,
  OrderStatus.Processing,
  OrderStatus.Paid,
  OrderStatus.PaymentReview,
  OrderStatus.Finished,
  OrderStatus.Canceled,
];

export default function OrdersManager() {
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [resendingReceipt, setResendingReceipt] = useState(false);
  const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const listPath = useMemo(() => {
    const search = new URLSearchParams();
    search.set('page', '1');
    search.set('limit', '100');
    if (query.trim()) search.set('query', query.trim());
    if (statusFilter !== 'all') search.set('status', statusFilter);
    return `/api/admin/orders?${search.toString()}`;
  }, [query, statusFilter]);

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useAuthApi<AdminOrderListResponse>(listPath, {
    revalidateOnFocus: true,
  });

  const {
    data: detailData,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useAuthApi<AdminOrderDetailResponse>(
    selectedOrderId ? `/api/admin/orders/${selectedOrderId}` : null,
    { revalidateOnFocus: true },
  );

  const orders = data?.orders || [];
  const selectedOrder = detailData?.order || null;

  const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString(intl.locale) : '-';

  const formatStatusLabel = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.Pending:
        return intl.formatMessage({ id: 'orders.status.pending', defaultMessage: 'Pending' });
      case OrderStatus.Paid:
        return intl.formatMessage({ id: 'orders.status.paid', defaultMessage: 'Paid' });
      case OrderStatus.PaymentReview:
        return intl.formatMessage({ id: 'orders.status.payment_review', defaultMessage: 'Payment review' });
      case OrderStatus.Canceled:
        return intl.formatMessage({ id: 'orders.status.canceled', defaultMessage: 'Canceled' });
      case OrderStatus.Finished:
        return intl.formatMessage({ id: 'orders.status.finished', defaultMessage: 'Finished' });
      case OrderStatus.Processing:
        return intl.formatMessage({ id: 'orders.status.processing', defaultMessage: 'Processing' });
      default:
        return status;
    }
  };

  const getStatusColor = (status: OrderStatus): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    switch (status) {
      case OrderStatus.Pending:
        return 'warning';
      case OrderStatus.Paid:
        return 'success';
      case OrderStatus.PaymentReview:
        return 'warning';
      case OrderStatus.Canceled:
        return 'error';
      case OrderStatus.Finished:
        return 'secondary';
      default:
        return 'default';
    }
  };

  const handleResendReceipt = async (orderId: string) => {
    try {
      setResendingReceipt(true);
      setFlash(null);

      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/admin/orders/${encodeURIComponent(orderId)}/resend-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to resend receipt');
      }

      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.orders.resendReceiptSuccess',
          defaultMessage: 'Receipt resent successfully.',
        }),
      });

      await Promise.all([mutate(), mutateDetail()]);
    } catch (resendError) {
      console.error(resendError);
      setFlash({
        severity: 'error',
        text: resendError instanceof Error
          ? resendError.message
          : intl.formatMessage({
              id: 'admin.orders.resendReceiptError',
              defaultMessage: 'Failed to resend receipt.',
            }),
      });
    } finally {
      setResendingReceipt(false);
    }
  };

  const handleCancelReviewInvite = async (orderId: string, inviteId: string) => {
    try {
      setCancellingInviteId(inviteId);
      setFlash(null);

      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/admin/orders/${encodeURIComponent(orderId)}/review-invites/${encodeURIComponent(inviteId)}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to cancel review invite');
      }

      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.orders.reviewInviteCancelSuccess',
          defaultMessage: 'Scheduled review invite cancelled.',
        }),
      });

      await Promise.all([mutate(), mutateDetail(payload, { revalidate: false })]);
    } catch (cancelError) {
      setFlash({
        severity: 'error',
        text: cancelError instanceof Error
          ? cancelError.message
          : intl.formatMessage({
              id: 'admin.orders.reviewInviteCancelError',
              defaultMessage: 'Failed to cancel review invite.',
            }),
      });
    } finally {
      setCancellingInviteId(null);
    }
  };

  const renderSummary = (order: AdminOrderItem) => {
    const chargedAmount = order.status === OrderStatus.PaymentReview
      ? intl.formatMessage({
          id: 'orders.paymentReceivedReview',
          defaultMessage: 'Payment received, under review',
        })
      : formatOrderUsdPrice(intl.locale, getOrderChargedAmount(order));

    return (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            <FormattedMessage id="admin.orders.customer" defaultMessage="Customer" />
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {order.customer.name || order.customer.email}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {order.customer.email}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            <FormattedMessage id="orders.orderTotal" defaultMessage="Order total" />
          </Typography>
          <Typography variant="body2">{formatOrderUsdPrice(intl.locale, order.price)}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            <FormattedMessage id="orders.charged" defaultMessage="Charged" />
          </Typography>
          <Typography variant="body2">{chargedAmount}</Typography>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          <FormattedMessage id="admin.orders.title" defaultMessage="Order Management" />
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          <FormattedMessage id="admin.orders.description" defaultMessage="Review all orders, inspect buyer information, and manually resend receipts." />
        </Typography>

        <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label={intl.formatMessage({ id: 'admin.orders.filter.query', defaultMessage: 'Search orders' })}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            size="small"
            sx={{ minWidth: 260 }}
          />
          <TextField
            select
            label={intl.formatMessage({ id: 'admin.orders.filter.status', defaultMessage: 'Status' })}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | OrderStatus)}
            size="small"
            sx={{ minWidth: 180 }}
          >
            {STATUS_OPTIONS.map((status) => (
              <MenuItem key={status} value={status}>
                {status === 'all'
                  ? intl.formatMessage({ id: 'admin.orders.filter.all', defaultMessage: 'All' })
                  : formatStatusLabel(status)}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </Paper>

      {flash && <Alert severity={flash.severity}>{flash.text}</Alert>}
      {error && (
        <Alert severity="error">
          <FormattedMessage id="admin.orders.loadError" defaultMessage="Failed to load orders." />
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <FormattedMessage id="orders.orderNumber" defaultMessage="Order ID" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.orders.customer" defaultMessage="Customer" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="tickets.table.status" defaultMessage="Status" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="orders.orderTotal" defaultMessage="Order total" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="orderDetail.created" defaultMessage="Created At" />
              </TableCell>
              <TableCell align="right">
                <FormattedMessage id="tickets.table.actions" defaultMessage="Actions" />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <FormattedMessage id="admin.orders.empty" defaultMessage="No orders matched the current filter." />
                </TableCell>
              </TableRow>
            ) : orders.map((order) => (
              <TableRow key={order.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {formatOrderPublicId(order.id)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {order.id}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{order.customer.name || order.customer.email}</Typography>
                  <Typography variant="caption" color="text.secondary">{order.customer.email}</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={getStatusColor(order.status)}
                    label={formatStatusLabel(order.status)}
                  />
                </TableCell>
                <TableCell>{formatOrderUsdPrice(intl.locale, order.price)}</TableCell>
                <TableCell>{formatDateTime(order.createdAt)}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setSelectedOrderId(order.id)}>
                    <FormattedMessage id="common.view" defaultMessage="View" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={Boolean(selectedOrderId)}
        onClose={() => setSelectedOrderId(null)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>
          <FormattedMessage id="admin.orders.detailTitle" defaultMessage="Order Detail" />
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : detailError ? (
            <Alert severity="error">
              <FormattedMessage id="admin.orders.detailLoadError" defaultMessage="Failed to load order detail." />
            </Alert>
          ) : selectedOrder ? (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 2.5 }}>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' } }}>
                  <Box sx={{ display: 'grid', gap: 1.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {formatOrderPublicId(selectedOrder.id)}
                    </Typography>
                    <Chip
                      size="small"
                      color={getStatusColor(selectedOrder.status)}
                      label={formatStatusLabel(selectedOrder.status)}
                      sx={{ width: 'fit-content' }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      <FormattedMessage id="orderDetail.created" defaultMessage="Created At" />: {formatDateTime(selectedOrder.createdAt)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <FormattedMessage id="orderDetail.updated" defaultMessage="Updated At" />: {formatDateTime(selectedOrder.updatedAt)}
                    </Typography>
                    {selectedOrder.invoiceId && (
                      <Typography variant="body2" color="text.secondary">
                        <FormattedMessage id="orderDetail.invoiceId" defaultMessage="Invoice ID" />: {selectedOrder.invoiceId}
                      </Typography>
                    )}
                    {selectedOrder.invoiceUrl && (
                      <Button
                        size="small"
                        variant="outlined"
                        href={selectedOrder.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ width: 'fit-content' }}
                      >
                        <FormattedMessage id="orderDetail.viewInvoice" defaultMessage="View Invoice" />
                      </Button>
                    )}
                  </Box>
                  {renderSummary(selectedOrder)}
                </Box>
              </Paper>

              <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  <FormattedMessage id="admin.orders.buyerInfo" defaultMessage="Buyer Information" />
                </Typography>
                <Box sx={{ display: 'grid', gap: 1 }}>
                  <Typography variant="body2">
                    <strong>{intl.formatMessage({ id: 'reseller.order.customerName', defaultMessage: 'Customer name' })}:</strong> {selectedOrder.customer.name || '-'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{intl.formatMessage({ id: 'orders.customerEmail', defaultMessage: 'Customer email' })}:</strong> {selectedOrder.customer.email}
                  </Typography>
                  <Typography variant="body2">
                    <strong>User ID:</strong> {selectedOrder.customer.id}
                  </Typography>
                </Box>
              </Paper>

              <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  <FormattedMessage id="orderDetail.items" defaultMessage="Order Items" />
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          <FormattedMessage id="orderDetail.name" defaultMessage="Name" />
                        </TableCell>
                        <TableCell>
                          <FormattedMessage id="orderDetail.quantity" defaultMessage="Quantity" />
                        </TableCell>
                        <TableCell>
                          <FormattedMessage id="orderDetail.unitPrice" defaultMessage="Unit Price" />
                        </TableCell>
                        <TableCell>
                          <FormattedMessage id="orderDetail.totalPrice" defaultMessage="Total Price" />
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedOrder.items.map((item) => {
                        const activeQty = item.quantity - (item.cancelledQuantity || 0);
                        return (
                          <TableRow key={`${selectedOrder.id}-${item.id}`}>
                            <TableCell>{item.marketItem.name}</TableCell>
                            <TableCell>{activeQty} / {item.quantity}</TableCell>
                            <TableCell>{formatOrderUsdPrice(intl.locale, item.price)}</TableCell>
                            <TableCell>{formatOrderUsdPrice(intl.locale, item.price * activeQty)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  <FormattedMessage id="admin.orders.review" defaultMessage="Order Review" />
                </Typography>
                {selectedOrder.rating ? (
                  <Box sx={{ display: 'grid', gap: 1.5 }}>
                    <Rating value={selectedOrder.rating} readOnly />
                    {selectedOrder.feedbackAt && (
                      <Typography variant="body2" color="text.secondary">
                        <FormattedMessage
                          id="orders.reviewSubmittedAt"
                          defaultMessage="Submitted at {time}"
                          values={{ time: formatDateTime(selectedOrder.feedbackAt) }}
                        />
                      </Typography>
                    )}
                    {selectedOrder.feedback ? (
                      <Paper variant="outlined" sx={{ p: 2, whiteSpace: 'pre-wrap', textAlign: 'left' }}>
                        {selectedOrder.feedback}
                      </Paper>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        <FormattedMessage id="orders.reviewNoComment" defaultMessage="No written review provided." />
                      </Typography>
                    )}
                    {(selectedOrder.reviewAttachments || []).length > 0 && (
                      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                        {(selectedOrder.reviewAttachments || []).map((attachment) => (
                          <a key={attachment.id} href={attachment.imageUrl} target="_blank" rel="noreferrer">
                            <Box
                              component="img"
                              src={attachment.imageUrl}
                              alt={attachment.fileName}
                              sx={{
                                width: 96,
                                height: 96,
                                objectFit: 'cover',
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider',
                              }}
                            />
                          </a>
                        ))}
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    <FormattedMessage id="admin.orders.reviewEmpty" defaultMessage="No review submitted yet." />
                  </Typography>
                )}
              </Paper>

              <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  <FormattedMessage id="admin.orders.reviewInvites" defaultMessage="Scheduled Review Emails" />
                </Typography>
                {(selectedOrder.reviewInviteEmails || []).length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>
                            <FormattedMessage id="admin.orders.reviewInviteRecipient" defaultMessage="Recipient" />
                          </TableCell>
                          <TableCell>
                            <FormattedMessage id="admin.orders.reviewInviteScheduledAt" defaultMessage="Scheduled At" />
                          </TableCell>
                          <TableCell>
                            <FormattedMessage id="admin.orders.reviewInviteStatus" defaultMessage="Status" />
                          </TableCell>
                          <TableCell>
                            <FormattedMessage id="admin.orders.reviewInviteUpdatedAt" defaultMessage="Updated At" />
                          </TableCell>
                          <TableCell align="right">
                            <FormattedMessage id="tickets.table.actions" defaultMessage="Actions" />
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(selectedOrder.reviewInviteEmails || []).map((invite) => (
                          <TableRow key={invite.id}>
                            <TableCell>
                              <Typography variant="body2">{invite.recipientName || invite.recipientEmail}</Typography>
                              <Typography variant="caption" color="text.secondary">{invite.recipientEmail}</Typography>
                            </TableCell>
                            <TableCell>{formatDateTime(invite.scheduledAt)}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                color={invite.status === 'sent' ? 'success' : invite.status === 'cancelled' ? 'default' : 'warning'}
                                label={invite.status}
                              />
                            </TableCell>
                            <TableCell>
                              {invite.sentAt
                                ? formatDateTime(invite.sentAt)
                                : invite.cancelledAt
                                  ? formatDateTime(invite.cancelledAt)
                                  : formatDateTime(invite.updatedAt)}
                            </TableCell>
                            <TableCell align="right">
                              {invite.status === 'scheduled' ? (
                                <Button
                                  size="small"
                                  color="warning"
                                  disabled={cancellingInviteId === invite.id}
                                  onClick={() => void handleCancelReviewInvite(selectedOrder.id, invite.id)}
                                >
                                  <FormattedMessage id="admin.orders.reviewInviteCancel" defaultMessage="Cancel" />
                                </Button>
                              ) : (
                                <Typography variant="caption" color="text.secondary">
                                  {invite.cancelReason || '-'}
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    <FormattedMessage id="admin.orders.reviewInvitesEmpty" defaultMessage="No scheduled review emails." />
                  </Typography>
                )}
              </Paper>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          {selectedOrder && (
            <Button
              onClick={() => void handleResendReceipt(selectedOrder.id)}
              disabled={resendingReceipt || ![OrderStatus.Paid, OrderStatus.Finished, OrderStatus.PaymentReview].includes(selectedOrder.status)}
            >
              <FormattedMessage id="admin.orders.resendReceipt" defaultMessage="Resend Receipt" />
            </Button>
          )}
          <Button onClick={() => setSelectedOrderId(null)}>
            <FormattedMessage id="common.close" defaultMessage="Close" />
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
