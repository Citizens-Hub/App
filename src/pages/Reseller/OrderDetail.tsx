import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  type ChipProps,
  Rating,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  ArrowBack,
  ContentCopy,
  OpenInNew,
  PaymentsOutlined,
  Refresh,
} from '@mui/icons-material';
import { Check, ChevronsRight, Info, X } from 'lucide-react';
import Crawler from '@/components/Crawler';
import OrderPaymentDeadline from '@/components/OrderPaymentDeadline';
import { getMarketItemVisual, MARKET_ITEM_PLACEHOLDER } from '@/components/marketItemDisplay';
import { useRelatedOrderData } from '@/hooks';
import { DetailedOrderItem, OrderPaymentInfo, OrderStatus, Ship } from '@/types';
import {
  formatOrderActiveItemsSummary,
  formatOrderChargedLabel,
  formatOrderCcuRoute,
  formatOrderItemCountLabel,
  formatOrderPackageSummary,
  formatOrderUsdPrice,
  getLocalizedOrderItemShipNames,
  getOrderItemDisplayName,
} from '../Orders/orderI18n';

const statusColor: Record<OrderStatus, ChipProps['color']> = {
  [OrderStatus.Paid]: 'success',
  [OrderStatus.Pending]: 'warning',
  [OrderStatus.Processing]: 'info',
  [OrderStatus.Canceled]: 'error',
  [OrderStatus.Finished]: 'secondary',
  [OrderStatus.PaymentReview]: 'warning',
};

const riskColor: Record<string, ChipProps['color']> = {
  normal: 'success',
  elevated: 'warning',
  highest: 'error',
  not_assessed: 'default',
  unknown: 'default',
};

const pageContainerClassName = 'w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 px-8 py-4 overflow-auto';
const sectionClassName = 'bg-white dark:bg-neutral-900 p-6 shadow-sm border border-gray-100 dark:border-neutral-700';

const statusAccentColor: Record<OrderStatus, string> = {
  [OrderStatus.Pending]: '#ed6c02',
  [OrderStatus.Processing]: '#0288d1',
  [OrderStatus.Paid]: '#2e7d32',
  [OrderStatus.Canceled]: '#d32f2f',
  [OrderStatus.Finished]: '#9c27b0',
  [OrderStatus.PaymentReview]: '#ed6c02',
};

function getActiveStep(status: OrderStatus) {
  switch (status) {
    case OrderStatus.Pending:
      return 0;
    case OrderStatus.Processing:
      return 1;
    case OrderStatus.Paid:
    case OrderStatus.PaymentReview:
      return 2;
    case OrderStatus.Finished:
      return 3;
    default:
      return 0;
  }
}

interface CCUToOpen {
  name: string;
  pageId: number;
  type: 'normal' | 'buyback';
  url: string;
}

function normalizeAbsoluteUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'robertsspaceindustries.com' || hostname.endsWith('.robertsspaceindustries.com')) {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function parseRsiUrlFromExternalRef(value?: string | null) {
  const raw = value?.split('|')[1]?.trim();
  return normalizeAbsoluteUrl(raw);
}

function getConciergePaintStoreUrl(item?: DetailedOrderItem['marketItem'] | null) {
  if (!item || item.sourceKind !== 'rsi-concierge-paint-sync') {
    return null;
  }

  return normalizeAbsoluteUrl(item.sourceUrl) || parseRsiUrlFromExternalRef(item.externalRef);
}

function formatMoney(locale: string, value?: number | null, currency?: string | null) {
  if (typeof value !== 'number') {
    return '—';
  }

  const safeCurrency = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : 'USD';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: safeCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(locale: string, value?: string | null) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString(locale);
}

function formatCountry(locale: string, countryCode?: string | null) {
  if (!countryCode) {
    return '—';
  }

  try {
    const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
    return displayNames.of(countryCode.toUpperCase()) || countryCode;
  } catch {
    return countryCode;
  }
}

function formatStateLabel(value?: string | null) {
  if (!value) {
    return '—';
  }

  return value.replace(/_/g, ' ');
}

function getPaymentMethodLabel(paymentInfo?: OrderPaymentInfo | null) {
  if (!paymentInfo) {
    return '—';
  }

  const brand = paymentInfo.paymentMethodBrand?.toUpperCase();
  const last4 = paymentInfo.paymentMethodLast4 ? `•••• ${paymentInfo.paymentMethodLast4}` : null;
  const methodType = paymentInfo.paymentMethodType ? formatStateLabel(paymentInfo.paymentMethodType) : null;

  return [brand, last4, methodType].filter(Boolean).join(' · ') || '—';
}

function renderOrderItemVisual(item: DetailedOrderItem, itemName: string, ships: Ship[]) {
  const visual = getMarketItemVisual(item.marketItem, ships);

  if (item.marketItem.itemType === 'ccu' && (visual.fromImage || visual.toImage)) {
    return (
      <Box sx={{ position: 'relative', width: 280, height: 160, overflow: 'hidden' }}>
        <Box
          component="img"
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '35%',
            height: '100%',
            objectFit: 'cover',
          }}
          src={visual.fromImage || MARKET_ITEM_PLACEHOLDER}
          alt={visual.fromShipName || itemName}
        />
        <Box
          component="img"
          sx={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: '65%',
            height: '100%',
            objectFit: 'cover',
            boxShadow: '0 0 20px 0 rgba(0, 0, 0, 0.2)',
          }}
          src={visual.toImage || MARKET_ITEM_PLACEHOLDER}
          alt={visual.toShipName || itemName}
        />
        <div className="absolute top-[50%] left-[35%] -translate-y-[50%] -translate-x-[50%] text-white text-2xl font-bold">
          <ChevronsRight className="w-8 h-8" />
        </div>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      sx={{ width: 280, height: 160, objectFit: 'cover' }}
      src={visual.thumbnail || MARKET_ITEM_PLACEHOLDER}
      alt={itemName}
    />
  );
}

function DataField({
  label,
  value,
  action,
  mono = false,
}: {
  label: ReactNode;
  value: ReactNode;
  action?: ReactNode;
  mono?: boolean;
}) {
  return (
    <Box sx={{ textAlign: 'left' }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 0.5 }}>
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            wordBreak: 'break-all',
            fontFamily: mono ? '"Roboto Mono", "Consolas", monospace' : 'inherit',
          }}
        >
          {value}
        </Typography>
        {action}
      </Box>
    </Box>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  valueColor,
}: {
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  valueColor?: string;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        boxShadow: 'none',
        borderColor: 'divider',
        bgcolor: 'background.default',
        height: '100%',
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box
        sx={{
          mt: 1,
          color: valueColor || 'text.primary',
          fontWeight: 700,
          fontSize: '1.125rem',
          lineHeight: 1.2,
        }}
      >
        {value}
      </Box>
      {helper ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          {helper}
        </Typography>
      ) : null}
    </Paper>
  );
}

function getStatusChip(status: OrderStatus) {
  return (
    <Chip
      color={statusColor[status] || 'default'}
      label={
        <FormattedMessage
          id={`orders.status.${status.toLowerCase()}`}
          defaultMessage={status}
        />
      }
      size="small"
      sx={{ fontWeight: 500 }}
    />
  );
}

const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const intl = useIntl();
  const { token } = useSelector((state: RootState) => state.user.user);
  const items = useSelector((state: RootState) => state.upgrades.items);

  const [isShippingDialogOpen, setIsShippingDialogOpen] = useState(false);
  const [isGoShippingDialogOpen, setIsGoShippingDialogOpen] = useState(false);
  const [ccusToOpen, setCcusToOpen] = useState<{ found: CCUToOpen[]; notFound: string[] }>({ found: [], notFound: [] });
  const [currentItem, setCurrentItem] = useState<DetailedOrderItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState<'success' | 'error'>('success');
  const [paymentInfo, setPaymentInfo] = useState<OrderPaymentInfo | null>(null);
  const [paymentInfoRequested, setPaymentInfoRequested] = useState(false);
  const [paymentInfoLoading, setPaymentInfoLoading] = useState(false);
  const [paymentInfoError, setPaymentInfoError] = useState<string | null>(null);
  const autoLoadedPaymentInfoOrderIdRef = useRef<string | null>(null);

  const { order, error, loading, mutateOrder: mutate, ships } = useRelatedOrderData(orderId || '');

  const showAlert = (message: string, severity: 'success' | 'error' = 'success') => {
    setAlertMessage(message);
    setAlertSeverity(severity);
    setAlertOpen(true);
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/reseller');
  };

  const handleOpenShippingDialog = (item: DetailedOrderItem) => {
    setCurrentItem(item);
    setIsShippingDialogOpen(true);
  };

  const handleCloseShippingDialog = () => {
    setIsShippingDialogOpen(false);
    setCurrentItem(null);
  };

  const handleShip = async () => {
    if (!currentItem || !order) return;

    setIsLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/ship`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          itemId: currentItem.id,
          orderId: order.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to ship item');
      }

      showAlert(intl.formatMessage({ id: 'orders.shipSuccess', defaultMessage: 'Item shipped successfully' }));
      mutate();
    } catch (shipError) {
      console.error(shipError);
      showAlert(intl.formatMessage({ id: 'orders.shipError', defaultMessage: 'Error shipping item' }), 'error');
    } finally {
      setIsLoading(false);
      handleCloseShippingDialog();
    }
  };

  const handleAlertClose = () => {
    setAlertOpen(false);
  };

  const handleCopyValue = async (value?: string | null) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      showAlert(intl.formatMessage({ id: 'common.copied', defaultMessage: 'Copied to clipboard' }));
    } catch (copyError) {
      console.error(copyError);
      showAlert(
        intl.formatMessage({
          id: 'reseller.order.copyFailed',
          defaultMessage: 'Failed to copy value',
        }),
        'error',
      );
    }
  };

  const handleLoadPaymentInfo = useCallback(async (refresh = Boolean(paymentInfo)) => {
    if (!order?.id) {
      return;
    }

    setPaymentInfoRequested(true);
    setPaymentInfoLoading(true);
    setPaymentInfoError(null);

    try {
      const refreshQuery = refresh ? '?refresh=1' : '';
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/related/payment/${order.id}${refreshQuery}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch payment info');
      }

      const data = await response.json() as OrderPaymentInfo | null;
      setPaymentInfo(data);

      if (!data) {
        setPaymentInfoError(intl.formatMessage({
          id: 'reseller.order.paymentUnavailable',
          defaultMessage: 'No payment details are available for this order yet.',
        }));
      }
    } catch (paymentError) {
      console.error(paymentError);
      setPaymentInfo(null);
      setPaymentInfoError(intl.formatMessage({
        id: 'reseller.order.paymentFetchError',
        defaultMessage: 'Failed to load payment details.',
      }));
      showAlert(
        intl.formatMessage({
          id: 'reseller.order.paymentFetchError',
          defaultMessage: 'Failed to load payment details.',
        }),
        'error',
      );
    } finally {
      setPaymentInfoLoading(false);
    }
  }, [intl, order?.id, paymentInfo, token]);

  useEffect(() => {
    setPaymentInfo(null);
    setPaymentInfoRequested(false);
    setPaymentInfoError(null);
    autoLoadedPaymentInfoOrderIdRef.current = null;
  }, [order?.id]);

  useEffect(() => {
    if (!order?.id) {
      return;
    }

    if (![OrderStatus.Paid, OrderStatus.Finished, OrderStatus.PaymentReview].includes(order.status)) {
      return;
    }

    if (autoLoadedPaymentInfoOrderIdRef.current === order.id) {
      return;
    }

    autoLoadedPaymentInfoOrderIdRef.current = order.id;
    void handleLoadPaymentInfo(false);
  }, [handleLoadPaymentInfo, order?.id, order?.status]);

  const handleOpenPaymentDocument = async () => {
    const targetUrl = order?.invoiceUrl || paymentInfo?.hostedInvoiceUrl || paymentInfo?.receiptUrl;
    if (!targetUrl) {
      if (!order?.invoiceId) {
        return;
      }

      try {
        const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/invoice?invoiceId=${order.invoiceId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch invoice document');
        }

        const data = await response.json() as { url?: string };
        if (!data.url) {
          throw new Error('Invoice document url missing');
        }

        window.open(data.url, '_blank', 'noopener,noreferrer');
      } catch (documentError) {
        console.error(documentError);
        showAlert(
          intl.formatMessage({
            id: 'reseller.order.paymentFetchError',
            defaultMessage: 'Failed to load payment details.',
          }),
          'error',
        );
      }

      return;
    }

    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const handleGoShippingClick = () => {
    if (!order || !items?.ccus) return;

    const currentRSIAccount = sessionStorage.getItem('currentRSIAccount');
    if (!currentRSIAccount) {
      showAlert(intl.formatMessage({ id: 'orders.noRSIAccount', defaultMessage: 'No RSI account selected' }), 'error');
      return;
    }

    const foundCcus: CCUToOpen[] = [];
    const notFoundCcus: string[] = [];

    order.items.forEach((orderItem) => {
      const { marketItem } = orderItem;
      if (marketItem.itemType !== 'ccu') return;

      const currentRSIAccountNumber = parseInt(currentRSIAccount, 10);
      const matchingCCUs = items.ccus.filter((ccu) => (
        ccu.name === marketItem.name
        && ccu.belongsTo === currentRSIAccountNumber
      ));

      if (!matchingCCUs.length) {
        notFoundCcus.push(marketItem.name);
        return;
      }

      const sortedCCUs = [...matchingCCUs].sort((a, b) => {
        if (a.isBuyBack === b.isBuyBack) return 0;
        return a.isBuyBack ? 1 : -1;
      });

      const effectiveQuantity = orderItem.quantity - (orderItem.cancelledQuantity || 0);
      let remainingToOpen = effectiveQuantity;

      const nonBuybackCCUs = sortedCCUs.filter((ccu) => !ccu.isBuyBack);
      const buybackCCUs = sortedCCUs.filter((ccu) => ccu.isBuyBack);

      nonBuybackCCUs.forEach((ccu) => {
        if (remainingToOpen <= 0) return;

        ccu.pageIds?.forEach((pageId) => {
          if (remainingToOpen <= 0) return;

          foundCcus.push({
            name: ccu.name,
            pageId,
            type: 'normal',
            url: `https://robertsspaceindustries.com/en/account/pledges?page=${Math.ceil(pageId / 10)}`,
          });
          remainingToOpen -= 1;
        });
      });

      if (remainingToOpen > 0) {
        buybackCCUs.forEach((ccu) => {
          if (remainingToOpen <= 0) return;

          ccu.pageIds?.forEach((pageId) => {
            if (remainingToOpen <= 0) return;

            foundCcus.push({
              name: ccu.name,
              pageId,
              type: 'buyback',
              url: `https://robertsspaceindustries.com/en/account/buy-back-pledges?page=${pageId}&pagesize=1`,
            });
            remainingToOpen -= 1;
          });
        });
      }
    });

    setCcusToOpen({ found: foundCcus, notFound: notFoundCcus });
    setIsGoShippingDialogOpen(true);
  };

  const handleConfirmOpenPages = () => {
    ccusToOpen.found.forEach((ccu) => {
      window.open(ccu.url, '_blank');
    });
    setIsGoShippingDialogOpen(false);
  };

  if (loading) {
    return (
      <div className={pageContainerClassName}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }} className="app-header">
          <Typography variant="h5">
            <FormattedMessage id="orderDetail.title" defaultMessage="Order Details" />
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <CircularProgress />
        </Box>
      </div>
    );
  }

  if (error) {
    return (
      <Box className={pageContainerClassName} display="flex" flexDirection="column" alignItems="center" justifyContent="center">
        <Alert
          severity="error"
          sx={{
            maxWidth: 500,
            width: '100%',
            mb: 2,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            borderRadius: 2,
          }}
        >
          {error}
        </Alert>
        <Button
          variant="outlined"
          onClick={() => window.location.reload()}
          startIcon={<Refresh />}
        >
          <FormattedMessage id="orders.retry" defaultMessage="Retry" />
        </Button>
      </Box>
    );
  }

  if (!order) {
    return (
      <Box className={pageContainerClassName} display="flex">
        <div className="w-full max-w-[1280px] mx-auto flex gap-4 items-start">
          <Alert
            severity="warning"
            sx={{
              maxWidth: 500,
              width: '100%',
              mb: 2,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              borderRadius: 2,
            }}
          >
            <FormattedMessage id="orderDetail.notFound" defaultMessage="Order not found" />
          </Alert>
          <Button
            variant="outlined"
            onClick={handleBack}
            startIcon={<ArrowBack />}
          >
            <FormattedMessage id="common.back" defaultMessage="Back" />
          </Button>
        </div>
      </Box>
    );
  }

  const orderItems = order.items;
  const createdDate = new Date(order.createdAt).toLocaleString(intl.locale);
  const updatedDate = new Date(order.updatedAt).toLocaleString(intl.locale);
  const totalItemsCount = orderItems.reduce((acc, item) => acc + item.quantity, 0);
  const cancelledItemsCount = orderItems.reduce((acc, item) => acc + (item.cancelledQuantity || 0), 0);
  const activeItemsCount = totalItemsCount - cancelledItemsCount;
  const total = orderItems.reduce((sum, item) => sum + (item.sellerNetAmount ?? ((item.quantity - (item.cancelledQuantity || 0)) * item.price)), 0);
  const paymentDocumentAvailable = Boolean(order.invoiceUrl || paymentInfo?.hostedInvoiceUrl || paymentInfo?.receiptUrl || order.invoiceId);
  const chargedLabel = paymentInfo
    ? formatMoney(intl.locale, paymentInfo.amountTotal, paymentInfo.currency)
    : formatOrderChargedLabel(intl, order);
  const activeStep = getActiveStep(order.status);

  return (
    <div className={pageContainerClassName}>
      <div className="w-full max-w-[1280px] mx-auto flex flex-col gap-4 pt-4">
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', md: 'center' },
            gap: 2,
            flexWrap: 'wrap',
          }}
          className="app-header"
        >
          <div className="flex flex-row items-center gap-4">
            <Button
              startIcon={<ArrowBack />}
              onClick={handleBack}
              variant="text"
              sx={{ mr: 2 }}
            >
              <FormattedMessage id="common.back" defaultMessage="Back" />
            </Button>
          </div>

          {/* <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              variant="outlined"
              startIcon={paymentInfoLoading ? <CircularProgress size={16} color="inherit" /> : paymentInfo ? <Refresh /> : <PaymentsOutlined />}
              onClick={() => void handleLoadPaymentInfo()}
              disabled={paymentInfoLoading}
            >
              <FormattedMessage
                id={paymentInfo ? 'reseller.order.refreshPaymentInfo' : 'reseller.order.fetchPaymentInfo'}
                defaultMessage={paymentInfo ? 'Refresh Payment Details' : 'Fetch Payment Details'}
              />
            </Button>
            <Button
              variant="text"
              startIcon={paymentDocumentAvailable ? <ReceiptLong /> : <OpenInNew />}
              onClick={handleOpenPaymentDocument}
              disabled={!paymentDocumentAvailable}
            >
              <FormattedMessage id="reseller.order.openPaymentDocument" defaultMessage="Open Invoice / Receipt" />
            </Button>
          </Stack> */}
        </Box>

        <div className="bg-white dark:bg-neutral-900 py-6 shadow-sm mb-4 border border-gray-100 dark:border-neutral-700">
          <Stepper activeStep={activeStep} alternativeLabel>
            <Step completed={order.status !== OrderStatus.Pending}>
              <StepLabel>
                <FormattedMessage id="orderDetail.status.pending" defaultMessage="Pending" />
              </StepLabel>
            </Step>
            <Step completed={order.status === OrderStatus.Processing || order.status === OrderStatus.Paid || order.status === OrderStatus.Finished || order.status === OrderStatus.PaymentReview}>
              <StepLabel>
                <FormattedMessage id="orderDetail.status.processing" defaultMessage="Processing" />
              </StepLabel>
            </Step>
            <Step completed={order.status === OrderStatus.Paid || order.status === OrderStatus.Finished || order.status === OrderStatus.PaymentReview}>
              <StepLabel>
                <FormattedMessage id="orderDetail.status.paid" defaultMessage="Paid" />
              </StepLabel>
            </Step>
            <Step completed={order.status === OrderStatus.Finished}>
              <StepLabel>
                <FormattedMessage id="orderDetail.status.finished" defaultMessage="Finished" />
              </StepLabel>
            </Step>
          </Stepper>
        </div>

        <div className={`${sectionClassName} mb-6`}>
          <div className="flex flex-wrap gap-6 justify-between">
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-3 mb-3">
                <Typography
                  variant="h5"
                  fontWeight="bold"
                  sx={{
                    borderLeft: '4px solid',
                    borderLeftColor: statusAccentColor[order.status],
                    pl: 1,
                  }}
                >
                  {order.id}
                </Typography>
                {getStatusChip(order.status)}
              </div>

              {order.status === OrderStatus.PaymentReview && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <FormattedMessage
                    id="orders.paymentReviewDescription"
                    defaultMessage="Payment was received, but seller settlement needs manual review before fulfillment."
                  />
                </Alert>
              )}

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                  gap: 2,
                  maxWidth: 760,
                }}
              >
                <DataField
                  label={<FormattedMessage id="orderDetail.created" defaultMessage="Created At" />}
                  value={createdDate}
                />
                <DataField
                  label={<FormattedMessage id="orderDetail.updated" defaultMessage="Updated At" />}
                  value={updatedDate}
                />
                <DataField
                  label={<FormattedMessage id="orders.customerEmail" defaultMessage="Customer email" />}
                  value={order.customerEmail || '—'}
                  action={order.customerEmail ? (
                    <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="Copy" />}>
                      <IconButton size="small" onClick={() => handleCopyValue(order.customerEmail)}>
                        <ContentCopy fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : undefined}
                />
                <DataField
                  label={<FormattedMessage id="orderDetail.invoiceId" defaultMessage="Invoice ID" />}
                  value={order.invoiceId || '—'}
                  action={order.invoiceId ? (
                    <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="Copy" />}>
                      <IconButton size="small" onClick={() => handleCopyValue(order.invoiceId)}>
                        <ContentCopy fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : undefined}
                />
              </Box>

              <Box sx={{ mt: 2 }}>
                <OrderPaymentDeadline
                  status={order.status}
                  expiresAt={order.expiresAt}
                />
              </Box>
            </div>

            <div className="min-w-[220px] text-left md:text-right">
              <Typography variant="caption" color="text.secondary">
                <FormattedMessage id="orderDetail.totalPrice" defaultMessage="Total Price" />
              </Typography>
              <div className="text-[16px] text-blue-500 font-bold">
                {formatOrderUsdPrice(intl.locale, total)}
              </div>

              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                <FormattedMessage id="orders.charged" defaultMessage="Charged" />
              </Typography>
              <Typography variant="body2">
                {chargedLabel}
              </Typography>

              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                <FormattedMessage id="orderDetail.itemsCount" defaultMessage="Items Count" />
              </Typography>
              <Typography variant="body2">
                {formatOrderActiveItemsSummary(intl, activeItemsCount, totalItemsCount)}
              </Typography>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
              gap: 2,
              flexWrap: 'wrap',
              mb: 2,
            }}
          >
            <div className="flex items-center gap-3">
              <Typography variant="h6" fontWeight="medium">
                <FormattedMessage id="orderDetail.items" defaultMessage="Order Items" />
              </Typography>
              <Chip
                label={formatOrderItemCountLabel(intl, activeItemsCount)}
                size="small"
                variant="outlined"
              />
            </div>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Crawler ships={ships} />
              <Button variant="outlined" onClick={handleGoShippingClick}>
                <FormattedMessage id="orders.goShipping" defaultMessage="Go Shipping" />
              </Button>
            </Stack>
          </Box>

          <Box sx={{ width: '100%', overflow: 'auto' }} className="resource-card">
            <TableContainer className="overflow-hidden mb-3">
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell width="320px" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                      <FormattedMessage id="orderDetail.image" defaultMessage="Image" />
                    </TableCell>
                    <TableCell sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                      <FormattedMessage id="orderDetail.name" defaultMessage="Name" />
                    </TableCell>
                    <TableCell align="center" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                      <FormattedMessage id="orderDetail.quantity" defaultMessage="Quantity" />
                    </TableCell>
                    <TableCell align="right" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                      <FormattedMessage id="orderDetail.unitPrice" defaultMessage="Unit Price" />
                    </TableCell>
                    <TableCell align="right" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                      <FormattedMessage id="orderDetail.totalPrice" defaultMessage="Total Price" />
                    </TableCell>
                    <TableCell align="center" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                      <FormattedMessage id="orderDetail.status" defaultMessage="Status" />
                    </TableCell>
                    <TableCell align="center" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                      <FormattedMessage id="orders.actionPanel" defaultMessage="Actions" />
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orderItems.map((item, index) => {
                    const marketItem = item.marketItem;
                    const itemName = getOrderItemDisplayName(intl, marketItem, ships);
                    const { shipName } = getLocalizedOrderItemShipNames(marketItem, ships);
                    const isCCU = marketItem?.itemType === 'ccu';
                    const isPackage = marketItem?.itemType === 'package';
                    const isCredit = marketItem?.itemType === 'credit';
                    const itemCancelledQty = item.cancelledQuantity || 0;
                    const activeQty = item.quantity - itemCancelledQty;
                    const ccuRoute = formatOrderCcuRoute(intl, marketItem, ships);
                    const packageSummary = formatOrderPackageSummary(intl, marketItem);
                    const isFullyCancelled = item.quantity === itemCancelledQty;
                    const canShip = order.status === OrderStatus.Paid && order.discountSettlementStatus === 'settled' && !item.shipped && activeQty > 0;
                    const conciergePaintStoreUrl = getConciergePaintStoreUrl(marketItem);

                    return (
                      <TableRow
                        key={item.id || index}
                        sx={{
                          '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' },
                          transition: 'background-color 0.2s',
                        }}
                      >
                        <TableCell>
                          {renderOrderItemVisual(item, itemName, ships)}
                        </TableCell>
                        <TableCell>
                          <Typography fontWeight="medium">{itemName}</Typography>
                          {isCCU && ccuRoute && (
                            <Typography variant="body2" color="text.secondary">
                              {ccuRoute}
                            </Typography>
                          )}
                          {isPackage && (
                            <>
                              {shipName && shipName !== itemName && (
                                <Typography variant="body2" color="text.secondary">
                                  {shipName}
                                </Typography>
                              )}
                              {packageSummary && (
                                <Typography variant="body2" color="text.secondary">
                                  {packageSummary}
                                </Typography>
                              )}
                            </>
                          )}
                          {(marketItem?.itemType === 'misc' || isCredit) && (
                            <>
                              {marketItem?.description && (
                                <Typography variant="body2" color="text.secondary">
                                  {marketItem.description}
                                </Typography>
                              )}
                              {marketItem?.externalRef && (
                                <Typography variant="body2" color="text.secondary">
                                  {marketItem.externalRef}
                                </Typography>
                              )}
                            </>
                          )}
                          {!marketItem?.name && (
                            <Typography variant="body2" color="text.secondary">
                              <FormattedMessage
                                id="orderDetail.unavailableItem"
                                defaultMessage="This product is no longer listed in the marketplace, but the order record is preserved."
                              />
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary">
                            {marketItem?.belongsTo && `${marketItem.belongsTo}`}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <div className="flex justify-center items-center">
                            {isFullyCancelled ? (
                              <div className="flex items-center text-red-500">
                                <X className="w-4 h-4 mr-1" />
                                <span>0/{item.quantity}</span>
                              </div>
                            ) : itemCancelledQty > 0 ? (
                              <div className="flex items-center text-orange-500">
                                <Info className="w-4 h-4 mr-1" />
                                <span>{activeQty}/{item.quantity}</span>
                              </div>
                            ) : (
                              <div className="flex items-center text-green-500">
                                <Check className="w-4 h-4 mr-1" />
                                <span>{item.quantity}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className="text-[16px] text-blue-500 font-bold">
                            {formatOrderUsdPrice(intl.locale, item.price)}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className="text-[16px] text-blue-500 font-bold">
                            {formatOrderUsdPrice(intl.locale, item.sellerNetAmount ?? (item.price * activeQty))}
                          </div>
                          {(item.sellerDiscountShare || 0) > 0 && (
                            <Typography variant="caption" color="text.secondary">
                              <FormattedMessage
                                id="reseller.balance.discountShare"
                                defaultMessage="Discount share: -{amount}"
                                values={{ amount: formatOrderUsdPrice(intl.locale, item.sellerDiscountShare || 0) }}
                              />
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {isFullyCancelled ? (
                            <Chip
                              size="small"
                              color="error"
                              label={<FormattedMessage id="orderDetail.cancelled" defaultMessage="Cancelled" />}
                            />
                          ) : item.shipped ? (
                            <Chip
                              size="small"
                              color="success"
                              label={<FormattedMessage id="orderDetail.delivered" defaultMessage="Delivered" />}
                            />
                          ) : (
                            <Chip
                              size="small"
                              color="warning"
                              label={<FormattedMessage id="orderDetail.delivering" defaultMessage="Delivering" />}
                            />
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Stack spacing={1} alignItems="center">
                            {conciergePaintStoreUrl && (
                              <Button
                                size="small"
                                variant="text"
                                color="inherit"
                                endIcon={<OpenInNew fontSize="small" />}
                                onClick={() => window.open(conciergePaintStoreUrl, '_blank', 'noopener,noreferrer')}
                              >
                                <FormattedMessage id="reseller.order.openRsiStore" defaultMessage="Open RSI Store" />
                              </Button>
                            )}
                            <Button
                              size="small"
                              variant={canShip ? 'contained' : 'outlined'}
                              color={item.shipped ? 'success' : 'primary'}
                              disabled={!canShip || isLoading}
                              onClick={() => handleOpenShippingDialog(item)}
                              sx={canShip ? { boxShadow: 'none' } : undefined}
                            >
                              {isFullyCancelled ? (
                                <FormattedMessage id="orderDetail.cancelled" defaultMessage="Cancelled" />
                              ) : item.shipped ? (
                                <FormattedMessage id="orders.shipped" defaultMessage="Shipped" />
                              ) : (
                                <FormattedMessage id="orders.ship" defaultMessage="Ship" />
                              )}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </div>

        <div className={sectionClassName}>
          <Typography variant="h6" fontWeight="medium" align='left' sx={{ mb: 2 }}>
            <FormattedMessage id="reseller.order.review" defaultMessage="Customer Review" />
          </Typography>
          {order.rating ? (
            <Box sx={{ display: 'grid', gap: 1.5, textAlign: 'left' }}>
              <Rating value={order.rating} readOnly />
              {order.feedbackAt && (
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage
                    id="orders.reviewSubmittedAt"
                    defaultMessage="Submitted at {time}"
                    values={{ time: formatDateTime(intl.locale, order.feedbackAt) }}
                  />
                </Typography>
              )}
              {order.feedback ? (
                <Paper variant="outlined" sx={{ p: 2, whiteSpace: 'pre-wrap', textAlign: 'left' }}>
                  {order.feedback}
                </Paper>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage id="orders.reviewNoComment" defaultMessage="No written review provided." />
                </Typography>
              )}
              {(order.reviewAttachments || []).length > 0 && (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {(order.reviewAttachments || []).map((attachment) => (
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
            <Typography variant="body2" color="text.secondary" align='left'>
              <FormattedMessage id="reseller.order.reviewEmpty" defaultMessage="No customer review submitted yet." />
            </Typography>
          )}
        </div>

        <div className={sectionClassName}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
              gap: 2,
              flexWrap: 'wrap',
              mb: 2.5,
            }}
          >
            <Box>
              <Typography variant="h6" fontWeight="medium" align='left'>
                <FormattedMessage id="reseller.order.paymentInfo" defaultMessage="Payment Details" />
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="outlined"
                startIcon={paymentInfoLoading ? <CircularProgress size={16} color="inherit" /> : paymentInfo ? <Refresh /> : <PaymentsOutlined />}
                onClick={() => void handleLoadPaymentInfo()}
                disabled={paymentInfoLoading}
              >
                <FormattedMessage
                  id={paymentInfo ? 'reseller.order.refreshPaymentInfo' : 'reseller.order.fetchPaymentInfo'}
                  defaultMessage={paymentInfo ? 'Refresh Payment Details' : 'Fetch Payment Details'}
                />
              </Button>
              <Button
                variant="text"
                startIcon={<OpenInNew />}
                onClick={handleOpenPaymentDocument}
                disabled={!paymentDocumentAvailable}
              >
                <FormattedMessage id="reseller.order.openPaymentDocument" defaultMessage="Open Invoice / Receipt" />
              </Button>
            </Stack>
          </Box>

          {paymentInfoLoading ? (
            <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary">
                <FormattedMessage id="common.loading" defaultMessage="Loading..." />
              </Typography>
            </Box>
          ) : [OrderStatus.Paid, OrderStatus.Finished, OrderStatus.PaymentReview].includes(order.status) && !paymentInfoRequested ? (
            <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary">
                <FormattedMessage id="common.loading" defaultMessage="Loading..." />
              </Typography>
            </Box>
          ) : !paymentInfoRequested ? (
            <></>
          ) : !paymentInfo ? (
            <Alert severity={paymentInfoError ? 'warning' : 'info'}>
              {paymentInfoError || intl.formatMessage({
                id: 'reseller.order.paymentUnavailable',
                defaultMessage: 'No payment details are available for this order yet.',
              })}
            </Alert>
          ) : (
            <>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
                  gap: 2,
                  mb: 2.5,
                  textAlign: 'left'
                }}
              >
                <SummaryCard
                  label={<FormattedMessage id="orders.charged" defaultMessage="Charged" />}
                  value={formatMoney(intl.locale, paymentInfo.amountTotal, paymentInfo.currency)}
                  helper={paymentInfo.currency || 'USD'}
                  valueColor="#1976d2"
                />
                <SummaryCard
                  label={<FormattedMessage id="orderDetail.subtotal" defaultMessage="Subtotal" />}
                  value={formatMoney(intl.locale, paymentInfo.amountSubtotal, paymentInfo.currency)}
                  helper={intl.formatMessage({
                    id: 'reseller.order.tax',
                    defaultMessage: 'Tax: {value}',
                  }, {
                    value: formatMoney(intl.locale, paymentInfo.amountTax, paymentInfo.currency),
                  })}
                />
                <SummaryCard
                  label={<FormattedMessage id="reseller.order.paymentMethod" defaultMessage="Payment Method" />}
                  value={getPaymentMethodLabel(paymentInfo)}
                  helper={paymentInfo.paymentMethodType ? formatStateLabel(paymentInfo.paymentMethodType) : '—'}
                />
                <SummaryCard
                  label={<FormattedMessage id="reseller.order.riskSignal" defaultMessage="Risk Signal" />}
                  value={(
                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                      <Chip
                        size="small"
                        color={paymentInfo.riskLevel ? (riskColor[paymentInfo.riskLevel] || 'default') : 'default'}
                        label={paymentInfo.riskLevel ? formatStateLabel(paymentInfo.riskLevel) : '—'}
                      />
                      {typeof paymentInfo.riskScore === 'number' ? (
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {paymentInfo.riskScore}
                        </Typography>
                      ) : null}
                    </Stack>
                  )}
                  helper={intl.formatMessage({
                    id: 'reseller.order.paidAt',
                    defaultMessage: 'Paid at: {value}',
                  }, {
                    value: formatDateTime(intl.locale, paymentInfo.paidAt),
                  })}
                />
              </Box>

              {paymentInfoError ? (
                <Alert severity="warning" sx={{ mb: 2.5 }}>
                  {paymentInfoError}
                </Alert>
              ) : null}

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' },
                  gap: 2,
                  textAlign: 'left'
                }}
              >
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, boxShadow: 'none' }}>
                  <Typography variant="subtitle1" fontWeight="medium" sx={{ mb: 2 }}>
                    <FormattedMessage id="reseller.order.billing" defaultMessage="Billing" />
                  </Typography>
                  <Stack spacing={1.5}>
                    <DataField
                      label={<FormattedMessage id="reseller.order.customerName" defaultMessage="Customer name" />}
                      value={paymentInfo.customerName || '—'}
                    />
                    <DataField
                      label={<FormattedMessage id="orders.customerEmail" defaultMessage="Customer email" />}
                      value={paymentInfo.customerEmail || order.customerEmail || '—'}
                      action={(paymentInfo.customerEmail || order.customerEmail) ? (
                        <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="Copy" />}>
                          <IconButton size="small" onClick={() => handleCopyValue(paymentInfo.customerEmail || order.customerEmail)}>
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : undefined}
                    />
                    <DataField
                      label={<FormattedMessage id="reseller.order.billingCountry" defaultMessage="Billing country" />}
                      value={formatCountry(intl.locale, paymentInfo.billingCountry)}
                    />
                    <DataField
                      label={<FormattedMessage id="reseller.order.capturedAmount" defaultMessage="Captured amount" />}
                      value={formatMoney(intl.locale, paymentInfo.amountCaptured, paymentInfo.currency)}
                    />
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, boxShadow: 'none' }}>
                  <Typography variant="subtitle1" fontWeight="medium" sx={{ mb: 2 }}>
                    <FormattedMessage id="reseller.order.paymentState" defaultMessage="Payment State" />
                  </Typography>
                  <Stack spacing={1.5}>
                    <DataField
                      label={<FormattedMessage id="reseller.order.checkoutStatus" defaultMessage="Checkout status" />}
                      value={formatStateLabel(paymentInfo.checkoutStatus)}
                    />
                    <DataField
                      label={<FormattedMessage id="reseller.order.paymentStatus" defaultMessage="Payment status" />}
                      value={formatStateLabel(paymentInfo.paymentStatus)}
                    />
                    <DataField
                      label={<FormattedMessage id="reseller.order.intentStatus" defaultMessage="Intent status" />}
                      value={formatStateLabel(paymentInfo.paymentIntentStatus)}
                    />
                    <DataField
                      label={<FormattedMessage id="reseller.order.cvcCheck" defaultMessage="CVC check" />}
                      value={formatStateLabel(paymentInfo.cvcCheck)}
                    />
                    <DataField
                      label={<FormattedMessage id="reseller.order.postalCheck" defaultMessage="Postal code check" />}
                      value={formatStateLabel(paymentInfo.postalCodeCheck)}
                    />
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, boxShadow: 'none' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Typography variant="subtitle1" fontWeight="medium">
                      <FormattedMessage id="reseller.order.paymentReferences" defaultMessage="Payment References" />
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<OpenInNew />}
                      onClick={handleOpenPaymentDocument}
                      disabled={!paymentDocumentAvailable}
                    >
                      <FormattedMessage id="reseller.order.openPaymentDocument" defaultMessage="Open Invoice / Receipt" />
                    </Button>
                  </Box>
                  <Stack spacing={1.5}>
                    <DataField
                      mono
                      label={<FormattedMessage id="reseller.order.sessionId" defaultMessage="Checkout session ID" />}
                      value={paymentInfo.checkoutSessionId || '—'}
                      action={paymentInfo.checkoutSessionId ? (
                        <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="Copy" />}>
                          <IconButton size="small" onClick={() => handleCopyValue(paymentInfo.checkoutSessionId)}>
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : undefined}
                    />
                    <DataField
                      mono
                      label={<FormattedMessage id="reseller.order.paymentIntentId" defaultMessage="Payment intent ID" />}
                      value={paymentInfo.paymentIntentId || '—'}
                      action={paymentInfo.paymentIntentId ? (
                        <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="Copy" />}>
                          <IconButton size="small" onClick={() => handleCopyValue(paymentInfo.paymentIntentId)}>
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : undefined}
                    />
                    <DataField
                      mono
                      label={<FormattedMessage id="orderDetail.invoiceId" defaultMessage="Invoice ID" />}
                      value={paymentInfo.invoiceId || order.invoiceId || '—'}
                      action={(paymentInfo.invoiceId || order.invoiceId) ? (
                        <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="Copy" />}>
                          <IconButton size="small" onClick={() => handleCopyValue(paymentInfo.invoiceId || order.invoiceId)}>
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : undefined}
                    />
                  </Stack>
                </Paper>
              </Box>
            </>
          )}
        </div>
      </div>

      <Dialog open={isShippingDialogOpen} onClose={handleCloseShippingDialog}>
        <DialogTitle>
          <FormattedMessage id="orders.confirmShipment" defaultMessage="Confirm Shipment" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            <FormattedMessage
              id="orders.confirmShipmentText"
              defaultMessage="Are you sure you want to mark this item as shipped?"
            />
          </DialogContentText>
          {currentItem ? (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1">{currentItem.marketItem.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                <FormattedMessage
                  id="orders.quantityPrice"
                  defaultMessage="Quantity: {quantity} - Price: ${price}"
                  values={{
                    quantity: currentItem.quantity - (currentItem.cancelledQuantity || 0),
                    price: currentItem.price.toFixed(2),
                  }}
                />
              </Typography>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseShippingDialog} disabled={isLoading}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleShip} color="primary" disabled={isLoading} autoFocus>
            <FormattedMessage id="orders.confirmShip" defaultMessage="Confirm Ship" />
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isGoShippingDialogOpen}
        onClose={() => setIsGoShippingDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <FormattedMessage id="orders.confirmOpenPages" defaultMessage="Confirm Opening CCU Pages" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            <FormattedMessage
              id="orders.confirmOpenPagesText"
              defaultMessage="The following CCU pages will be opened:"
            />
          </DialogContentText>

          {ccusToOpen.found.length > 0 ? (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                <FormattedMessage id="orders.ccusToOpen" defaultMessage="CCUs to open:" />
              </Typography>
              <List dense>
                {ccusToOpen.found.map((ccu, index) => (
                  <ListItem key={`${ccu.name}-${ccu.pageId}-${index}`}>
                    <ListItemText
                      primary={ccu.name}
                      secondary={ccu.type === 'buyback'
                        ? intl.formatMessage({ id: 'orders.buybackCcu', defaultMessage: 'Buyback CCU' })
                        : intl.formatMessage({ id: 'orders.normalCcu', defaultMessage: 'Normal CCU' })}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : null}

          {ccusToOpen.notFound.length > 0 ? (
            <Box>
              <Alert severity="warning" sx={{ mb: 1 }}>
                <Typography variant="subtitle1">
                  <FormattedMessage id="orders.ccusNotFound" defaultMessage="These CCUs were not found in the current RSI account:" />
                </Typography>
              </Alert>
              <List dense>
                {ccusToOpen.notFound.map((name, index) => (
                  <ListItem key={`${name}-${index}`}>
                    <ListItemText primary={name} />
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsGoShippingDialogOpen(false)}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button
            onClick={handleConfirmOpenPages}
            color="primary"
            disabled={ccusToOpen.found.length === 0}
            autoFocus
          >
            <FormattedMessage id="orders.openPages" defaultMessage="Open Pages" />
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={alertOpen}
        autoHideDuration={6000}
        onClose={handleAlertClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleAlertClose} severity={alertSeverity} sx={{ width: '100%' }}>
          {alertMessage}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default OrderDetail;
