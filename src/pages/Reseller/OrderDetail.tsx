import { ReactNode, useState } from 'react';
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
  Divider,
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
  Tooltip,
  Typography,
  type ChipProps,
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
};

const riskColor: Record<string, ChipProps['color']> = {
  normal: 'success',
  elevated: 'warning',
  highest: 'error',
  not_assessed: 'default',
  unknown: 'default',
};

const darkPageBackground = `
  linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)
`;
const darkSurfaceBg = 'rgba(255, 255, 255, 0.96)';
const darkSurfaceAltBg = 'rgba(248, 250, 252, 0.92)';
const darkSurfaceBorder = 'rgba(148, 163, 184, 0.28)';
const darkTextPrimary = '#0f172a';
const darkTextSecondary = '#64748b';
const darkMutedText = '#94a3b8';
const accentBlue = '#3b82f6';
const accentOrange = '#f97316';
const accentRed = '#ef4444';
const accentGreen = '#22c55e';
const accentFont = 'inherit';

const statusAccent: Record<OrderStatus, string> = {
  [OrderStatus.Pending]: '#93c5fd',
  [OrderStatus.Processing]: '#38bdf8',
  [OrderStatus.Paid]: accentBlue,
  [OrderStatus.Canceled]: accentOrange,
  [OrderStatus.Finished]: accentGreen,
};

function getActiveStep(status: OrderStatus) {
  switch (status) {
    case OrderStatus.Pending:
      return 0;
    case OrderStatus.Processing:
      return 1;
    case OrderStatus.Paid:
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
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: 160,
          overflow: 'hidden',
          borderRadius: 1,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: darkSurfaceBorder,
        }}
      >
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
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '35%',
            transform: 'translate(-50%, -50%)',
            width: 42,
            height: 42,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(15, 23, 42, 0.72)',
            color: 'common.white',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <ChevronsRight size={24} />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      sx={{
        width: '100%',
        height: 160,
        objectFit: 'cover',
        borderRadius: 1,
        border: '1px solid',
        borderColor: darkSurfaceBorder,
        bgcolor: 'background.paper',
      }}
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
  tone = 'default',
  valueVariant = 'body2',
}: {
  label: ReactNode;
  value: ReactNode;
  action?: ReactNode;
  mono?: boolean;
  tone?: 'default' | 'inverse';
  valueVariant?: 'body1' | 'body2';
}) {
  const isInverse = tone === 'inverse';

  return (
    <Box sx={{ textAlign: 'left' }}>
      <Typography
        variant="caption"
        sx={{
          color: isInverse ? darkTextSecondary : 'text.secondary',
          fontWeight: isInverse ? 700 : 400,
          letterSpacing: isInverse ? '0.08em' : 'normal',
          textTransform: isInverse ? 'uppercase' : 'none',
        }}
      >
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 0.5 }}>
        <Typography
          variant={valueVariant}
          sx={{
            fontFamily: mono ? '"Roboto Mono", "Consolas", monospace' : 'inherit',
            wordBreak: 'break-all',
            flex: 1,
            color: isInverse ? darkTextPrimary : 'text.primary',
            fontWeight: isInverse ? 600 : 400,
          }}
        >
          {value}
        </Typography>
        {action}
      </Box>
    </Box>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone = 'default',
  valueColor,
}: {
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  tone?: 'default' | 'inverse';
  valueColor?: string;
}) {
  const isInverse = tone === 'inverse';

  return (
    <Paper
      variant="outlined"
      sx={{
        p: isInverse ? 2.25 : 2,
        borderRadius: 3,
        textAlign: 'left',
        bgcolor: isInverse ? darkSurfaceAltBg : 'rgba(248, 250, 252, 0.88)',
        borderColor: isInverse ? darkSurfaceBorder : 'rgba(148, 163, 184, 0.28)',
        boxShadow: isInverse ? 'inset 0 1px 0 rgba(255,255,255,0.03)' : 'none',
        height: '100%',
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: isInverse ? darkTextSecondary : 'text.secondary',
          fontWeight: isInverse ? 700 : 400,
          letterSpacing: isInverse ? '0.08em' : 'normal',
          textTransform: isInverse ? 'uppercase' : 'none',
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          mt: 1,
          minHeight: isInverse ? 36 : 'auto',
          color: valueColor || (isInverse ? darkTextPrimary : 'text.primary'),
          fontFamily: isInverse ? accentFont : 'inherit',
          fontWeight: 700,
          fontSize: isInverse ? { xs: '1.35rem', md: '1.65rem' } : undefined,
          lineHeight: 1.05,
        }}
      >
        {value}
      </Box>
      {helper ? (
        <Typography
          variant="body2"
          sx={{
            mt: 0.75,
            color: isInverse ? darkTextSecondary : 'text.secondary',
          }}
        >
          {helper}
        </Typography>
      ) : null}
    </Paper>
  );
}

const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const intl = useIntl();
  const { token } = useSelector((state: RootState) => state.user.user);
  const items = useSelector((state: RootState) => state.upgrades.items);
  const pageShellClassName = 'absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto';

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

  const handleLoadPaymentInfo = async () => {
    if (!order?.id) {
      return;
    }

    setPaymentInfoRequested(true);
    setPaymentInfoLoading(true);
    setPaymentInfoError(null);

    try {
      const refreshQuery = paymentInfo ? '?refresh=1' : '';
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
  };

  const handleOpenPaymentDocument = async () => {
    const targetUrl = paymentInfo?.hostedInvoiceUrl || paymentInfo?.receiptUrl;
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
              url: `https://robertsspaceindustries.com/en/account/buy-back-pledges?page=${pageId}&product-type=upgrade&pagesize=1`,
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
      <Box
        className={pageShellClassName}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: darkPageBackground,
        }}
      >
        <CircularProgress sx={{ color: accentBlue }} />
      </Box>
    );
  }

  if (error || !order) {
    return (
      <Box
        className={pageShellClassName}
        sx={{
          background: darkPageBackground,
        }}
      >
        <Box sx={{ maxWidth: 960, mx: 'auto', px: { xs: 2, md: 4 }, py: { xs: 4, md: 6 } }}>
          <Alert
            severity="error"
            sx={{
              mb: 2,
              bgcolor: 'rgba(127, 29, 29, 0.32)',
              color: darkTextPrimary,
              border: '1px solid rgba(248, 113, 113, 0.3)',
            }}
          >
            <FormattedMessage id="orders.notFound" defaultMessage="Order not found or error loading order" />
          </Alert>
          <Button
            startIcon={<ArrowBack />}
            onClick={handleBack}
            variant="outlined"
            sx={{
              color: darkTextPrimary,
              borderColor: 'rgba(148, 163, 184, 0.24)',
            }}
          >
            <FormattedMessage id="common.back" defaultMessage="Back" />
          </Button>
        </Box>
      </Box>
    );
  }

  const total = order.items.reduce((sum, item) => {
    const activeQty = item.quantity - (item.cancelledQuantity || 0);
    return sum + (activeQty * item.price);
  }, 0);
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const availableItems = order.items.reduce((sum, item) => sum + (item.quantity - (item.cancelledQuantity || 0)), 0);
  const paymentDocumentUrl = paymentInfo?.hostedInvoiceUrl || paymentInfo?.receiptUrl || null;
  const paymentDocumentAvailable = Boolean(paymentDocumentUrl || order.invoiceId);
  const chargedLabel = paymentInfo
    ? formatMoney(intl.locale, paymentInfo.amountTotal, paymentInfo.currency)
    : formatOrderChargedLabel(intl, order);
  const activeStep = getActiveStep(order.status);
  const orderProgressSteps = [
    intl.formatMessage({ id: 'orderDetail.status.pending', defaultMessage: 'Pending' }),
    intl.formatMessage({ id: 'orderDetail.status.processing', defaultMessage: 'Processing' }),
    intl.formatMessage({ id: 'orderDetail.status.paid', defaultMessage: 'Paid' }),
    intl.formatMessage({ id: 'orderDetail.status.finished', defaultMessage: 'Finished' }),
  ];
  const actionButtonSx = {
    color: darkTextPrimary,
    borderColor: 'rgba(148, 163, 184, 0.26)',
    bgcolor: 'rgba(255,255,255,0.02)',
    '&:hover': {
      borderColor: 'rgba(148, 163, 184, 0.4)',
      bgcolor: 'rgba(255,255,255,0.05)',
    },
  } as const;

  return (
    <Box
      className={pageShellClassName}
      sx={{
        background: darkPageBackground,
      }}
    >
      <Box
        sx={{
          maxWidth: 1440,
          mx: 'auto',
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 4.5 },
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 3.5,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={handleBack}
            variant="text"
            sx={{
              color: darkTextPrimary,
              px: 0,
              fontWeight: 700,
              '&:hover': { bgcolor: 'transparent', color: accentBlue },
            }}
          >
            <FormattedMessage id="common.back" defaultMessage="Back" />
          </Button>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              variant="outlined"
              startIcon={paymentInfoLoading ? <CircularProgress size={16} color="inherit" /> : paymentInfo ? <Refresh /> : <PaymentsOutlined />}
              onClick={handleLoadPaymentInfo}
              disabled={paymentInfoLoading}
              sx={actionButtonSx}
            >
              <FormattedMessage
                id={paymentInfo ? 'reseller.order.refreshPaymentInfo' : 'reseller.order.fetchPaymentInfo'}
                defaultMessage={paymentInfo ? 'Refresh Payment Details' : 'Fetch Payment Details'}
              />
            </Button>
            <Button
              variant="outlined"
              startIcon={<OpenInNew />}
              onClick={handleOpenPaymentDocument}
              disabled={!paymentDocumentAvailable}
              sx={actionButtonSx}
            >
              <FormattedMessage id="reseller.order.openPaymentDocument" defaultMessage="Open Invoice / Receipt" />
            </Button>
          </Stack>
        </Box>

        <Paper
          sx={{
            p: { xs: 2.25, md: 3 },
            borderRadius: 4,
            background: darkSurfaceBg,
            border: '1px solid',
            borderColor: darkSurfaceBorder,
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.28)',
          }}
        >
          <Stepper
            activeStep={activeStep}
            alternativeLabel
            sx={{
              '& .MuiStepLabel-label': {
                mt: 1,
                color: darkTextSecondary,
                fontWeight: 700,
                fontSize: { xs: '0.72rem', md: '0.82rem' },
              },
              '& .Mui-active .MuiStepLabel-label, & .Mui-completed .MuiStepLabel-label': {
                color: darkTextPrimary,
              },
              '& .MuiStepConnector-line': {
                borderColor: 'rgba(71, 85, 105, 0.6)',
                borderTopWidth: 2,
              },
              '& .Mui-completed .MuiStepConnector-line': {
                borderColor: accentBlue,
              },
              '& .MuiStepIcon-root': {
                color: 'rgba(51, 65, 85, 0.92)',
              },
              '& .MuiStepIcon-text': {
                fill: darkTextPrimary,
                fontSize: '0.72rem',
                fontFamily: accentFont,
                fontWeight: 700,
              },
              '& .Mui-active .MuiStepIcon-root': {
                color: statusAccent[order.status],
                filter: `drop-shadow(0 0 16px ${statusAccent[order.status]}55)`,
              },
              '& .Mui-completed .MuiStepIcon-root': {
                color: accentBlue,
              },
            }}
          >
            {orderProgressSteps.map((label, index) => (
              <Step key={label} completed={index < activeStep}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Paper>

        <Paper
          sx={{
            p: { xs: 2.5, md: 3.5 },
            borderRadius: 5,
            color: darkTextPrimary,
            background: `radial-gradient(circle at top right, rgba(110,168,255,0.18), transparent 26%), ${darkSurfaceBg}`,
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid',
            borderColor: darkSurfaceBorder,
            boxShadow: '0 28px 90px rgba(0, 0, 0, 0.32)',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.03), transparent 40%)',
              pointerEvents: 'none',
            },
          }}
        >
          <Box
            sx={{
              position: 'relative',
              zIndex: 1,
              textAlign: 'left',
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.35fr) 420px' },
              gap: 3,
              alignItems: 'start',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ borderLeft: '4px solid', borderLeftColor: statusAccent[order.status], pl: 2.25, mb: 3 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                  <Typography
                    variant="h3"
                    sx={{
                      fontFamily: accentFont,
                      fontWeight: 700,
                      letterSpacing: '0.01em',
                      wordBreak: 'break-word',
                      lineHeight: 1,
                    }}
                  >
                    {order.id}
                  </Typography>
                  <Chip
                    label={<FormattedMessage id={`orders.status.${order.status}`} defaultMessage={order.status} />}
                    color={statusColor[order.status] || 'default'}
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>

                <Typography variant="body1" sx={{ maxWidth: 760, color: darkTextSecondary }}>
                  <FormattedMessage
                    id="reseller.order.heroSummary"
                    defaultMessage="Track fulfillment, review customer details, and fetch Stripe payment signals only when you need them."
                  />
                </Typography>
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                  gap: 2.25,
                }}
              >
                <DataField
                  tone="inverse"
                  valueVariant="body1"
                  label={<FormattedMessage id="orders.createTime" defaultMessage="Created at" />}
                  value={formatDateTime(intl.locale, order.createdAt)}
                />
                <DataField
                  tone="inverse"
                  valueVariant="body1"
                  label={<FormattedMessage id="orders.updateTime" defaultMessage="Updated at" />}
                  value={formatDateTime(intl.locale, order.updatedAt)}
                />
                <DataField
                  tone="inverse"
                  valueVariant="body1"
                  label={<FormattedMessage id="orders.customerEmail" defaultMessage="Customer email" />}
                  value={order.customerEmail || '—'}
                  action={order.customerEmail ? (
                    <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="Copy" />}>
                      <IconButton size="small" sx={{ color: darkTextPrimary }} onClick={() => handleCopyValue(order.customerEmail)}>
                        <ContentCopy fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : undefined}
                />
                <DataField
                  tone="inverse"
                  valueVariant="body1"
                  label={<FormattedMessage id="orders.itemsAvailability" defaultMessage="Items" />}
                  value={formatOrderActiveItemsSummary(intl, availableItems, totalItems)}
                />
              </Box>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 1.5,
                alignSelf: 'start',
              }}
            >
              <MetricCard
                tone="inverse"
                label={<FormattedMessage id="orders.orderTotal" defaultMessage="Order total" />}
                value={formatOrderUsdPrice(intl.locale, total)}
                helper={<FormattedMessage id="orderDetail.totalPrice" defaultMessage="Total Price" />}
                valueColor={accentBlue}
              />
              <MetricCard
                tone="inverse"
                label={<FormattedMessage id="orders.charged" defaultMessage="Charged" />}
                value={chargedLabel}
                helper={paymentInfo?.currency || intl.formatMessage({ id: `orders.status.${order.status}`, defaultMessage: order.status })}
                valueColor={order.status === OrderStatus.Canceled ? accentOrange : accentBlue}
              />
              <MetricCard
                tone="inverse"
                label={<FormattedMessage id="orders.items" defaultMessage="Items" />}
                value={formatOrderItemCountLabel(intl, availableItems)}
                helper={<FormattedMessage id="orderDetail.activeItemsSummary" defaultMessage="{active} / {total} active" values={{ active: availableItems, total: totalItems }} />}
              />
              <MetricCard
                tone="inverse"
                label={<FormattedMessage id="reseller.order.paymentSignal" defaultMessage="Payment Signal" />}
                value={paymentInfo ? formatStateLabel(paymentInfo.paymentStatus || paymentInfo.paymentIntentStatus) : 'On demand'}
                helper={paymentInfo ? getPaymentMethodLabel(paymentInfo) : intl.formatMessage({
                  id: 'reseller.order.paymentSignalHelper',
                  defaultMessage: 'Fetch Stripe details only when needed',
                })}
              />
            </Box>
          </Box>
        </Paper>

        <Paper
          sx={{
            p: { xs: 2.5, md: 3.25 },
            borderRadius: 5,
            border: '1px solid',
            borderColor: darkSurfaceBorder,
            textAlign: 'left',
            background: darkSurfaceBg,
            boxShadow: '0 24px 72px rgba(0, 0, 0, 0.26)',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: darkTextPrimary, fontFamily: accentFont }}>
                <FormattedMessage id="orders.itemsList" defaultMessage="Order Items" />
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: darkTextSecondary }}>
                <FormattedMessage
                  id="reseller.order.itemsSummary"
                  defaultMessage="{count} sellable lines · {amount} currently active"
                  values={{
                    count: order.items.length,
                    amount: formatOrderActiveItemsSummary(intl, availableItems, totalItems),
                  }}
                />
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Chip
                label={formatOrderItemCountLabel(intl, order.items.length)}
                sx={{
                  alignSelf: { xs: 'flex-start', sm: 'center' },
                  color: darkTextPrimary,
                  bgcolor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontWeight: 700,
                }}
              />
              <Crawler ships={ships} />
              <Button variant="outlined" onClick={handleGoShippingClick} sx={actionButtonSx}>
                <FormattedMessage id="orders.goShipping" defaultMessage="Go Shipping" />
              </Button>
            </Stack>
          </Box>

          <Box
            sx={{
              display: { xs: 'none', lg: 'grid' },
              gridTemplateColumns: '280px minmax(0, 1.5fr) 120px 140px 140px 150px 140px',
              gap: 2,
              px: 2.5,
              pb: 1.5,
            }}
          >
            {[
              intl.formatMessage({ id: 'orderDetail.image', defaultMessage: 'Image' }),
              intl.formatMessage({ id: 'orderDetail.name', defaultMessage: 'Name' }),
              intl.formatMessage({ id: 'orderDetail.quantity', defaultMessage: 'Quantity' }),
              intl.formatMessage({ id: 'orderDetail.unitPrice', defaultMessage: 'Unit Price' }),
              intl.formatMessage({ id: 'orderDetail.totalPrice', defaultMessage: 'Total Price' }),
              intl.formatMessage({ id: 'orders.status', defaultMessage: 'Status' }),
              intl.formatMessage({ id: 'orders.actionPanel', defaultMessage: 'Actions' }),
            ].map((label) => (
              <Typography
                key={label}
                variant="caption"
                sx={{
                  color: darkTextSecondary,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                {label}
              </Typography>
            ))}
          </Box>

          <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.12)', mb: 2.5 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {order.items.map((item) => {
              const marketItem = item.marketItem;
              const itemName = getOrderItemDisplayName(intl, marketItem, ships);
              const { shipName } = getLocalizedOrderItemShipNames(marketItem, ships);
              const isPackage = marketItem.itemType === 'package';
              const isCredit = marketItem.itemType === 'credit';
              const itemCancelledQty = item.cancelledQuantity || 0;
              const activeQty = item.quantity - itemCancelledQty;
              const ccuRoute = formatOrderCcuRoute(intl, marketItem, ships);
              const packageSummary = formatOrderPackageSummary(intl, marketItem);
              const isFullyCancelled = item.quantity === itemCancelledQty;
              const canShip = !item.shipped && activeQty > 0;

              return (
                <Paper
                  key={item.id}
                  variant="outlined"
                  sx={{
                    p: { xs: 2, md: 2.5 },
                    borderRadius: 4,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.015))',
                    borderColor: 'rgba(148, 163, 184, 0.12)',
                  }}
                >
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        lg: '280px minmax(0, 1.5fr) 120px 140px 140px 150px 140px',
                      },
                      gap: { xs: 2, lg: 2 },
                      alignItems: { xs: 'stretch', lg: 'center' },
                    }}
                  >
                    <Box>{renderOrderItemVisual(item, itemName, ships)}</Box>

                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1.25 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, wordBreak: 'break-word', color: darkTextPrimary }}>
                          {itemName}
                        </Typography>
                        {isFullyCancelled ? (
                          <Chip size="small" color="error" label={<FormattedMessage id="orderDetail.cancelled" defaultMessage="Cancelled" />} sx={{ fontWeight: 700 }} />
                        ) : item.shipped ? (
                          <Chip size="small" color="success" label={<FormattedMessage id="orderDetail.delivered" defaultMessage="Delivered" />} sx={{ fontWeight: 700 }} />
                        ) : (
                          <Chip size="small" color="warning" label={<FormattedMessage id="orderDetail.delivering" defaultMessage="Delivering" />} sx={{ fontWeight: 700 }} />
                        )}
                      </Stack>

                      <Stack spacing={0.75}>
                        {ccuRoute ? (
                          <Typography variant="body2" sx={{ color: darkTextSecondary }}>
                            {ccuRoute}
                          </Typography>
                        ) : null}

                        {isPackage && shipName && shipName !== itemName ? (
                          <Typography variant="body2" sx={{ color: darkTextSecondary }}>
                            {shipName}
                          </Typography>
                        ) : null}

                        {isPackage && packageSummary ? (
                          <Typography variant="body2" sx={{ color: darkTextSecondary }}>
                            {packageSummary}
                          </Typography>
                        ) : null}

                        {(marketItem.itemType === 'misc' || isCredit) && marketItem.description ? (
                          <Typography variant="body2" sx={{ color: darkTextSecondary }}>
                            {marketItem.description}
                          </Typography>
                        ) : null}

                        {marketItem.externalRef ? (
                          <Typography variant="body2" sx={{ color: darkTextSecondary }}>
                            {marketItem.externalRef}
                          </Typography>
                        ) : null}

                        <Typography variant="caption" sx={{ color: darkMutedText }}>
                          {marketItem.skuId}
                        </Typography>
                      </Stack>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, alignItems: { xs: 'center', lg: 'flex-start' }, gap: 1 }}>
                      <Typography variant="caption" sx={{ display: { xs: 'inline', lg: 'block' }, color: darkTextSecondary, textTransform: { lg: 'uppercase' }, letterSpacing: { lg: '0.08em' }, minWidth: { xs: 70, lg: 'auto' } }}>
                        <FormattedMessage id="orderDetail.quantity" defaultMessage="Quantity" />
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {isFullyCancelled ? (
                          <>
                            <X size={16} color={accentRed} />
                            <Typography variant="body1" sx={{ fontWeight: 700, color: accentRed }}>
                              0 / {item.quantity}
                            </Typography>
                          </>
                        ) : itemCancelledQty > 0 ? (
                          <>
                            <Info size={16} color={accentOrange} />
                            <Typography variant="body1" sx={{ fontWeight: 700, color: darkTextPrimary }}>
                              {activeQty} / {item.quantity}
                            </Typography>
                          </>
                        ) : (
                          <>
                            <Check size={16} color={accentGreen} />
                            <Typography variant="body1" sx={{ fontWeight: 700, color: darkTextPrimary }}>
                              {activeQty}
                            </Typography>
                          </>
                        )}
                      </Box>
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ display: { xs: 'inline', lg: 'block' }, color: darkTextSecondary, textTransform: { lg: 'uppercase' }, letterSpacing: { lg: '0.08em' } }}>
                        <FormattedMessage id="orderDetail.unitPrice" defaultMessage="Unit Price" />
                      </Typography>
                      <Typography variant="h6" sx={{ mt: { xs: 0, lg: 0.75 }, fontWeight: 700, color: accentBlue, fontFamily: accentFont }}>
                        {formatOrderUsdPrice(intl.locale, item.price)}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ display: { xs: 'inline', lg: 'block' }, color: darkTextSecondary, textTransform: { lg: 'uppercase' }, letterSpacing: { lg: '0.08em' } }}>
                        <FormattedMessage id="orderDetail.totalPrice" defaultMessage="Total Price" />
                      </Typography>
                      <Typography variant="h6" sx={{ mt: { xs: 0, lg: 0.75 }, fontWeight: 700, color: accentBlue, fontFamily: accentFont }}>
                        {formatOrderUsdPrice(intl.locale, activeQty * item.price)}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ display: { xs: 'inline', lg: 'block' }, color: darkTextSecondary, textTransform: { lg: 'uppercase' }, letterSpacing: { lg: '0.08em' } }}>
                        <FormattedMessage id="orders.status" defaultMessage="Status" />
                      </Typography>
                      <Box sx={{ mt: { xs: 0, lg: 0.75 } }}>
                        {isFullyCancelled ? (
                          <Chip
                            size="small"
                            label={<FormattedMessage id="orderDetail.cancelled" defaultMessage="Cancelled" />}
                            sx={{
                              bgcolor: 'rgba(255, 135, 94, 0.18)',
                              color: accentOrange,
                              fontWeight: 700,
                              border: '1px solid rgba(255, 135, 94, 0.24)',
                            }}
                          />
                        ) : item.shipped ? (
                          <Chip
                            size="small"
                            label={<FormattedMessage id="orderDetail.delivered" defaultMessage="Delivered" />}
                            sx={{
                              bgcolor: 'rgba(74, 222, 128, 0.16)',
                              color: accentGreen,
                              fontWeight: 700,
                              border: '1px solid rgba(74, 222, 128, 0.22)',
                            }}
                          />
                        ) : (
                          <Chip
                            size="small"
                            label={<FormattedMessage id="orderDetail.delivering" defaultMessage="Delivering" />}
                            sx={{
                              bgcolor: 'rgba(110, 168, 255, 0.18)',
                              color: accentBlue,
                              fontWeight: 700,
                              border: '1px solid rgba(110, 168, 255, 0.24)',
                            }}
                          />
                        )}
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: { xs: 'stretch', lg: 'flex-end' }, alignItems: 'center' }}>
                      <Button
                        fullWidth
                        variant={canShip ? 'contained' : 'outlined'}
                        color={canShip ? 'primary' : item.shipped ? 'success' : 'inherit'}
                        disabled={!canShip || isLoading}
                        onClick={() => handleOpenShippingDialog(item)}
                        sx={canShip ? {
                          fontWeight: 700,
                          boxShadow: 'none',
                          bgcolor: accentBlue,
                          '&:hover': {
                            bgcolor: '#5b97eb',
                            boxShadow: 'none',
                          },
                        } : actionButtonSx}
                      >
                        {item.shipped ? (
                          <FormattedMessage id="orders.shipped" defaultMessage="Shipped" />
                        ) : (
                          <FormattedMessage id="orders.ship" defaultMessage="Ship" />
                        )}
                      </Button>
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', mt: 3, pt: 2.5, borderTop: '1px solid', borderColor: 'rgba(148, 163, 184, 0.12)' }}>
            <Box>
              <Typography variant="body2" sx={{ color: darkTextSecondary }}>
                <FormattedMessage id="orderDetail.summary" defaultMessage="Order Summary" />
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, color: accentBlue, fontFamily: accentFont }}>
                {formatOrderUsdPrice(intl.locale, total)}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: darkTextSecondary, maxWidth: 620 }}>
              <FormattedMessage
                id="reseller.order.orderFootnote"
                defaultMessage="Only active quantities contribute to the reseller fulfillment total."
              />
            </Typography>
          </Box>
        </Paper>

        <Paper
          sx={{
            p: { xs: 2.5, md: 3.25 },
            borderRadius: 5,
            border: '1px solid',
            borderColor: darkSurfaceBorder,
            textAlign: 'left',
            background: darkSurfaceBg,
            boxShadow: '0 24px 72px rgba(0, 0, 0, 0.26)',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: darkTextPrimary, fontFamily: accentFont }}>
                <FormattedMessage id="reseller.order.paymentInfo" defaultMessage="Payment Details" />
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: darkTextSecondary }}>
                <FormattedMessage
                  id="reseller.order.paymentInfoHint"
                  defaultMessage="Stripe fields are loaded only after you request them, so the page stays fast by default."
                />
              </Typography>
            </Box>
          </Box>

          {paymentInfoLoading ? (
            <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress sx={{ color: accentBlue }} />
              <Typography variant="body2" sx={{ color: darkTextSecondary }}>
                <FormattedMessage id="common.loading" defaultMessage="Loading..." />
              </Typography>
            </Box>
          ) : !paymentInfoRequested ? (
            <Box
              sx={{
                p: 3,
                borderRadius: 3,
                border: '1px dashed',
                borderColor: 'rgba(148, 163, 184, 0.22)',
                bgcolor: 'rgba(255,255,255,0.02)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: darkTextPrimary }}>
                  <FormattedMessage id="reseller.order.paymentNotLoaded" defaultMessage="Payment details are not loaded yet" />
                </Typography>
                <Typography variant="body2" sx={{ color: darkTextSecondary }}>
                  <FormattedMessage
                    id="reseller.order.paymentNotLoadedHint"
                    defaultMessage="Click the button once to fetch billing, payment method, receipt, and Radar signals from Stripe."
                  />
                </Typography>
              </Box>
              <Button variant="contained" startIcon={<PaymentsOutlined />} onClick={handleLoadPaymentInfo} sx={{
                fontWeight: 700,
                boxShadow: 'none',
                bgcolor: accentBlue,
                '&:hover': {
                  bgcolor: '#5b97eb',
                  boxShadow: 'none',
                },
              }}>
                <FormattedMessage id="reseller.order.fetchPaymentInfo" defaultMessage="Fetch Payment Details" />
              </Button>
            </Box>
          ) : !paymentInfo ? (
            <Alert
              severity="info"
              sx={{
                bgcolor: 'rgba(30, 64, 175, 0.18)',
                color: darkTextPrimary,
                border: '1px solid rgba(96, 165, 250, 0.2)',
              }}
            >
              {paymentInfoError || intl.formatMessage({
                id: 'reseller.order.paymentUnavailable',
                defaultMessage: 'No payment details are available for this order yet.',
              })}
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
                  gap: 2,
                }}
              >
                <MetricCard
                  tone="inverse"
                  label={<FormattedMessage id="orders.charged" defaultMessage="Charged" />}
                  value={formatMoney(intl.locale, paymentInfo.amountTotal, paymentInfo.currency)}
                  helper={paymentInfo.currency || 'USD'}
                  valueColor={accentBlue}
                />
                <MetricCard
                  tone="inverse"
                  label={<FormattedMessage id="orderDetail.subtotal" defaultMessage="Subtotal" />}
                  value={formatMoney(intl.locale, paymentInfo.amountSubtotal, paymentInfo.currency)}
                  helper={<FormattedMessage id="reseller.order.tax" defaultMessage="Tax: {value}" values={{ value: formatMoney(intl.locale, paymentInfo.amountTax, paymentInfo.currency) }} />}
                />
                <MetricCard
                  tone="inverse"
                  label={<FormattedMessage id="reseller.order.paymentMethod" defaultMessage="Payment Method" />}
                  value={getPaymentMethodLabel(paymentInfo)}
                  helper={paymentInfo.paymentMethodType ? formatStateLabel(paymentInfo.paymentMethodType) : '—'}
                />
                <MetricCard
                  tone="inverse"
                  label={<FormattedMessage id="reseller.order.riskSignal" defaultMessage="Risk Signal" />}
                  value={(
                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                      <Chip
                        size="small"
                        color={paymentInfo.riskLevel ? (riskColor[paymentInfo.riskLevel] || 'default') : 'default'}
                        label={paymentInfo.riskLevel ? formatStateLabel(paymentInfo.riskLevel) : '—'}
                      />
                      {typeof paymentInfo.riskScore === 'number' ? (
                        <Typography variant="body2" sx={{ fontWeight: 700, color: darkTextPrimary }}>
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
                <Alert
                  severity="warning"
                  sx={{
                    bgcolor: 'rgba(120, 53, 15, 0.22)',
                    color: darkTextPrimary,
                    border: '1px solid rgba(251, 191, 36, 0.22)',
                  }}
                >
                  {paymentInfoError}
                </Alert>
              ) : null}

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' },
                  gap: 2,
                }}
              >
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(148, 163, 184, 0.12)' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: darkTextPrimary }}>
                    <FormattedMessage id="reseller.order.billing" defaultMessage="Billing" />
                  </Typography>
                  <Stack spacing={1.5}>
                    <DataField
                      tone="inverse"
                      label={<FormattedMessage id="reseller.order.customerName" defaultMessage="Customer name" />}
                      value={paymentInfo.customerName || '—'}
                    />
                    <DataField
                      tone="inverse"
                      label={<FormattedMessage id="orders.customerEmail" defaultMessage="Customer email" />}
                      value={paymentInfo.customerEmail || order.customerEmail || '—'}
                      action={(paymentInfo.customerEmail || order.customerEmail) ? (
                        <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="Copy" />}>
                          <IconButton size="small" sx={{ color: darkTextPrimary }} onClick={() => handleCopyValue(paymentInfo.customerEmail || order.customerEmail)}>
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : undefined}
                    />
                    <DataField
                      tone="inverse"
                      label={<FormattedMessage id="reseller.order.billingCountry" defaultMessage="Billing country" />}
                      value={formatCountry(intl.locale, paymentInfo.billingCountry)}
                    />
                    <DataField
                      tone="inverse"
                      label={<FormattedMessage id="reseller.order.capturedAmount" defaultMessage="Captured amount" />}
                      value={formatMoney(intl.locale, paymentInfo.amountCaptured, paymentInfo.currency)}
                    />
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(148, 163, 184, 0.12)' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: darkTextPrimary }}>
                    <FormattedMessage id="reseller.order.paymentState" defaultMessage="Payment State" />
                  </Typography>
                  <Stack spacing={1.5}>
                    <DataField
                      tone="inverse"
                      label={<FormattedMessage id="reseller.order.checkoutStatus" defaultMessage="Checkout status" />}
                      value={formatStateLabel(paymentInfo.checkoutStatus)}
                    />
                    <DataField
                      tone="inverse"
                      label={<FormattedMessage id="reseller.order.paymentStatus" defaultMessage="Payment status" />}
                      value={formatStateLabel(paymentInfo.paymentStatus)}
                    />
                    <DataField
                      tone="inverse"
                      label={<FormattedMessage id="reseller.order.intentStatus" defaultMessage="Intent status" />}
                      value={formatStateLabel(paymentInfo.paymentIntentStatus)}
                    />
                    <DataField
                      tone="inverse"
                      label={<FormattedMessage id="reseller.order.cvcCheck" defaultMessage="CVC check" />}
                      value={formatStateLabel(paymentInfo.cvcCheck)}
                    />
                    <DataField
                      tone="inverse"
                      label={<FormattedMessage id="reseller.order.postalCheck" defaultMessage="Postal code check" />}
                      value={formatStateLabel(paymentInfo.postalCodeCheck)}
                    />
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(148, 163, 184, 0.12)' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: darkTextPrimary }}>
                      <FormattedMessage id="reseller.order.paymentReferences" defaultMessage="Payment References" />
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<OpenInNew />}
                      onClick={handleOpenPaymentDocument}
                      disabled={!paymentDocumentAvailable}
                      sx={actionButtonSx}
                    >
                      <FormattedMessage id="reseller.order.openPaymentDocument" defaultMessage="Open Invoice / Receipt" />
                    </Button>
                  </Box>
                  <Stack spacing={1.5}>
                    <DataField
                      mono
                      tone="inverse"
                      label={<FormattedMessage id="reseller.order.sessionId" defaultMessage="Checkout session ID" />}
                      value={paymentInfo.checkoutSessionId || '—'}
                      action={paymentInfo.checkoutSessionId ? (
                        <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="Copy" />}>
                          <IconButton size="small" sx={{ color: darkTextPrimary }} onClick={() => handleCopyValue(paymentInfo.checkoutSessionId)}>
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : undefined}
                    />
                    <DataField
                      mono
                      tone="inverse"
                      label={<FormattedMessage id="reseller.order.paymentIntentId" defaultMessage="Payment intent ID" />}
                      value={paymentInfo.paymentIntentId || '—'}
                      action={paymentInfo.paymentIntentId ? (
                        <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="Copy" />}>
                          <IconButton size="small" sx={{ color: darkTextPrimary }} onClick={() => handleCopyValue(paymentInfo.paymentIntentId)}>
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : undefined}
                    />
                    <DataField
                      mono
                      tone="inverse"
                      label={<FormattedMessage id="orderDetail.invoiceId" defaultMessage="Invoice ID" />}
                      value={paymentInfo.invoiceId || order.invoiceId || '—'}
                      action={(paymentInfo.invoiceId || order.invoiceId) ? (
                        <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="Copy" />}>
                          <IconButton size="small" sx={{ color: darkTextPrimary }} onClick={() => handleCopyValue(paymentInfo.invoiceId || order.invoiceId)}>
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : undefined}
                    />
                  </Stack>
                </Paper>
              </Box>
            </Box>
          )}
        </Paper>
      </Box>

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
    </Box>
  );
};

export default OrderDetail;
