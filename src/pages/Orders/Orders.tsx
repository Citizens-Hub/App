import {
  Typography,
  Box,
  Alert,
  Button,
  Chip,
  CircularProgress,
  TextField,
  InputAdornment,
  TablePagination,
  Tooltip,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { OrderCheckoutSessionStatus, OrderStatus } from '@/types';
import { useNavigate, useSearchParams } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import PaymentIcon from '@mui/icons-material/Payment';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import SearchIcon from '@mui/icons-material/Search';
import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronsRight } from 'lucide-react';
import { useOrdersData } from '@/hooks';
import { clearCart } from '@/store/cartStore';
import { getMarketItemVisual, MARKET_ITEM_PLACEHOLDER } from '@/components/marketItemDisplay';
import OrderPaymentDeadline from '@/components/OrderPaymentDeadline';
import { formatOrderPublicId } from '@/utils/orderId';
import {
  formatOrderChargedLabel,
  formatOrderItemQuantitySummary,
  formatOrderLeadSummary,
  formatOrderMoreItemsLabel,
  formatOrderUsdPrice,
  getOrderItemDisplayName,
} from './orderI18n';
import {
  formatGoogleCustomerReviewsDate,
  getGoogleCustomerReviewsDeliveryDays,
  renderGoogleCustomerReviewsOptIn,
} from '@/utils/googleCustomerReviews';

const GOOGLE_ADS_PURCHASE_SEND_TO = (
  import.meta.env.VITE_PUBLIC_GOOGLE_ADS_PURCHASE_SEND_TO
  || 'AW-17708781265/ydRzCJftvakcENGdmvxB'
).trim();
const GOOGLE_ADS_TRACKED_SESSION_PREFIX = 'google-ads:purchase:';

async function waitForGoogleTag(timeoutMs = 3000) {
  const startedAt = Date.now();

  while ((Date.now() - startedAt) < timeoutMs) {
    if (typeof window.gtag === 'function') {
      return true;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 50);
    });
  }

  return typeof window.gtag === 'function';
}

function getGoogleAdsTrackedSessionKey(sessionId: string) {
  return `${GOOGLE_ADS_TRACKED_SESSION_PREFIX}${sessionId}`;
}

function hasTrackedGoogleAdsPurchase(sessionId: string) {
  return window.sessionStorage.getItem(getGoogleAdsTrackedSessionKey(sessionId)) === '1';
}

function markGoogleAdsPurchaseTracked(sessionId: string) {
  window.sessionStorage.setItem(getGoogleAdsTrackedSessionKey(sessionId), '1');
}

async function sendGoogleAdsPurchaseConversion(checkoutSessionStatus: OrderCheckoutSessionStatus) {
  const amount = checkoutSessionStatus.paymentInfo?.amountTotal ?? checkoutSessionStatus.paymentInfo?.amountCaptured;
  const currency = checkoutSessionStatus.paymentInfo?.currency || 'USD';

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    return false;
  }

  if (!GOOGLE_ADS_PURCHASE_SEND_TO || GOOGLE_ADS_PURCHASE_SEND_TO === '-') {
    console.warn('Google Ads conversion send_to is not configured.');
    return false;
  }

  const isGoogleTagReady = await waitForGoogleTag();
  if (!isGoogleTagReady || !window.gtag) {
    console.warn('Google Ads conversion skipped because gtag is not ready.');
    return false;
  }

  window.gtag('event', 'conversion', {
    send_to: GOOGLE_ADS_PURCHASE_SEND_TO,
    value: amount,
    currency,
    transaction_id: checkoutSessionStatus.orderId,
  });

  return true;
}

function resolveGoogleCustomerReviewsEstimatedDeliveryDate(
  checkoutSessionStatus: OrderCheckoutSessionStatus,
  matchedOrder?: {
    shipmentDeadlineAt?: string | null;
  } | null,
) {
  if (matchedOrder?.shipmentDeadlineAt) {
    const matchedOrderDate = new Date(matchedOrder.shipmentDeadlineAt);
    if (!Number.isNaN(matchedOrderDate.getTime())) {
      return formatGoogleCustomerReviewsDate(matchedOrderDate);
    }
  }

  const paidAt = checkoutSessionStatus.paidAt || checkoutSessionStatus.paymentInfo?.paidAt;
  const baseDate = paidAt ? new Date(paidAt) : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    return '';
  }

  const estimatedDeliveryDate = new Date(baseDate);
  estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + getGoogleCustomerReviewsDeliveryDays());
  return formatGoogleCustomerReviewsDate(estimatedDeliveryDate);
}

export default function Orders() {
  const { ships, orders, loading, error, mutate, userInfo } = useOrdersData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useDispatch();
  const currentUser = useSelector((state: RootState) => state.user.user);
  const token = currentUser.token;
  const intl = useIntl();
  const isMobile = window.innerWidth < 768;
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const handledCheckoutKeyRef = useRef<string | null>(null);
  const searchQuery = searchParams.toString();
  const checkoutStatus = searchParams.get('checkout');
  const checkoutSessionId = searchParams.get('session_id');

  // const renderItemState = (order: Order, item: OrderItem, index: number) => {
  //   if (item.quantity === item.cancelledQuantity || order.status === OrderStatus.Canceled) {
  //     return <X className="h-4 w-4 text-red-500" />;
  //   }

  //   if (order.status === OrderStatus.Pending) {
  //     return <Loader2 className={`h-4 w-4 text-orange-500 ${index === 0 ? 'animate-spin' : ''}`} />;
  //   }

  //   if (item.cancelledQuantity) {
  //     return <Info className="h-4 w-4 text-orange-500" />;
  //   }

  //   return <Check className="h-4 w-4 text-green-500" />;
  // };

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();

    return [...orders]
      .filter((order) => {
        if (searchTerm === '') return true;

        if (order.id.toLowerCase().includes(normalizedSearch)) return true;

        return order.items?.some((item) => {
          const marketItem = item.marketItem;
          return [
            marketItem?.name,
            marketItem?.skuId,
            marketItem?.fromShipName,
            marketItem?.toShipName,
            marketItem?.shipName,
            marketItem?.packageKind,
            marketItem?.insuranceType,
          ].filter(Boolean).some((value) => value!.toLowerCase().includes(normalizedSearch));
        });
      })
      .sort((left, right) => {
        const leftTs = new Date(left.updatedAt || left.createdAt).getTime();
        const rightTs = new Date(right.updatedAt || right.createdAt).getTime();
        return rightTs - leftTs;
      });
  }, [orders, searchTerm]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm]);

  useEffect(() => {
    if (!checkoutStatus) {
      return;
    }

    const checkoutKey = `${checkoutStatus}:${checkoutSessionId || ''}`;
    if (handledCheckoutKeyRef.current === checkoutKey) {
      return;
    }
    handledCheckoutKeyRef.current = checkoutKey;

    const nextSearchParams = new URLSearchParams(searchQuery);
    nextSearchParams.delete('checkout');
    nextSearchParams.delete('session_id');
    setSearchParams(nextSearchParams, { replace: true });

    const finalizeCheckoutLanding = async () => {
      if (checkoutStatus === 'success') {
        dispatch(clearCart());

        if (checkoutSessionId) {
          try {
            const response = await fetch(
              `${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/checkout-session/${encodeURIComponent(checkoutSessionId)}`,
              {
                headers: {
                  Authorization: token ? `Bearer ${token}` : '',
                  'Content-Type': 'application/json',
                },
              },
            );

            if (!response.ok) {
              throw new Error(`Failed to load checkout session status: ${response.status}`);
            }

            const sessionStatus = await response.json() as OrderCheckoutSessionStatus;
            const isPaidOrder = [OrderStatus.Paid, OrderStatus.Finished, OrderStatus.PaymentReview].includes(sessionStatus.status);

            if (isPaidOrder && !hasTrackedGoogleAdsPurchase(checkoutSessionId) && await sendGoogleAdsPurchaseConversion(sessionStatus)) {
              markGoogleAdsPurchaseTracked(checkoutSessionId);
            }

            if (isPaidOrder) {
              const matchedOrder = orders.find((order) => order.id === sessionStatus.orderId);
              await renderGoogleCustomerReviewsOptIn({
                checkoutSessionId,
                orderId: sessionStatus.orderId,
                email: sessionStatus.paymentInfo?.customerEmail || userInfo?.email || currentUser.email || '',
                deliveryCountry: sessionStatus.paymentInfo?.billingCountry || '',
                estimatedDeliveryDate: resolveGoogleCustomerReviewsEstimatedDeliveryDate(sessionStatus, matchedOrder),
              });
            }
          } catch (checkoutError) {
            console.error('Failed to process checkout success integrations:', checkoutError);
          }
        }

        await mutate();
      }
    };

    void finalizeCheckoutLanding();
  }, [checkoutSessionId, checkoutStatus, currentUser.email, dispatch, mutate, orders, searchQuery, setSearchParams, token, userInfo]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredOrders.length / rowsPerPage) - 1);
    setPage((currentPage) => (currentPage > maxPage ? maxPage : currentPage));
  }, [filteredOrders.length, rowsPerPage]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const paginatedOrders = filteredOrders.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  const handleRestartPayment = (orderId: string) => {
    const order = orders.find((currentOrder) => currentOrder.id === orderId);
    if (!order) return;

    navigate('/checkout', {
      state: {
        pendingOrder: order,
        ships,
      },
    });
  };

  const handleViewReceipt = (orderId: string) => {
    const order = orders.find((currentOrder) => currentOrder.id === orderId);
    if (!order) return;

    navigate(`/orders/${orderId}`, {
      state: {
        order,
        ships,
      },
    });
  };

  const getStatusChip = (status: OrderStatus) => {
    let color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' = 'default';

    switch (status) {
      case OrderStatus.Pending:
        color = 'warning';
        break;
      case OrderStatus.Paid:
        color = 'success';
        break;
      case OrderStatus.PaymentReview:
        color = 'warning';
        break;
      case OrderStatus.Canceled:
        color = 'error';
        break;
      case OrderStatus.Finished:
        color = 'secondary';
        break;
      default:
        color = 'default';
    }

    return (
      <Chip
        color={color}
        label={(
          <FormattedMessage
            id={`orders.status.${status.toLowerCase()}`}
            defaultMessage={status}
          />
        )}
        size="small"
        sx={{ fontWeight: 500 }}
      />
    );
  };

  if (loading) {
    return (
      <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] w-full overflow-auto">
        <div className="mx-auto w-full max-w-[1280px] px-8 py-4">
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2 }} className="app-header">
            <div className="flex flex-row items-center gap-4">
              <Typography variant={isMobile ? 'h6' : 'h5'}>
                <FormattedMessage id="orders.title" defaultMessage="My Orders" />
              </Typography>
            </div>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            <CircularProgress />
          </Box>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] w-full overflow-auto">
        <Box className="mx-auto w-full max-w-[1280px] px-8 py-4" display="flex" flexDirection="column" alignItems="center" justifyContent="center">
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
            startIcon={<ReceiptLongIcon />}
          >
            <FormattedMessage id="orders.retry" defaultMessage="Retry" />
          </Button>
        </Box>
      </div>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] w-full overflow-auto">
      <div className="mx-auto w-full max-w-[1280px] px-8 py-4">
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2 }} className="app-header">
          <div className="flex flex-row items-center gap-4">
            <Typography variant={isMobile ? 'h6' : 'h5'}>
              <FormattedMessage id="orders.title" defaultMessage="My Orders" />
            </Typography>
          </div>
        </Box>

        <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ flexGrow: 1, flexBasis: { xs: '100%', md: '100%' } }} className="search-box">
            <TextField
              fullWidth
              variant="outlined"
              placeholder={intl.formatMessage({ id: 'orders.searchPlaceholder', defaultMessage: 'Search orders...' })}
              value={searchTerm}
              onChange={handleSearchChange}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
              }}
              size="small"
            />
          </Box>
        </Box>

        {filteredOrders.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Box display="flex" justifyContent="center" alignItems="center" py={10} flexDirection="column">
              <ShoppingBagIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                <FormattedMessage id="orders.noOrders" defaultMessage="No orders found" />
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
                <FormattedMessage id="orders.noOrdersDescription" defaultMessage="When you make purchases, your orders will appear here" />
              </Typography>
              <Button
                variant="contained"
                color="primary"
                onClick={() => navigate('/')}
              >
                <FormattedMessage id="orders.startShopping" defaultMessage="Start Shopping" />
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {paginatedOrders.map((order) => {
              const orderItems = order.items;
              const createdDate = new Date(order.createdAt).toLocaleDateString(intl.locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              });
              const updatedDate = order.updatedAt
                ? new Date(order.updatedAt).toLocaleString(intl.locale)
                : null;

              const firstItem = orderItems.length > 0 ? orderItems[0] : null;
              const marketItem = firstItem?.marketItem;
              const firstItemName = getOrderItemDisplayName(intl, marketItem, ships);
              const visual = marketItem ? getMarketItemVisual(marketItem, ships) : null;
              const isCCU = marketItem?.itemType === 'ccu';
              const totalItemsCount = orderItems.reduce((acc, item) => acc + item.quantity, 0);
              // const cancelledItemsCount = orderItems.reduce((acc, item) => acc + (item.cancelledQuantity || 0), 0);
              // const activeItemsCount = totalItemsCount - cancelledItemsCount;
              const visibleItems = orderItems.slice(0, 3);
              const hiddenItemsCount = Math.max(orderItems.length - visibleItems.length, 0);
              const deadlineMode = order.status === OrderStatus.Pending
                ? 'payment'
                : order.status === OrderStatus.Paid
                  ? 'shipment'
                  : null;
              const deadlineAt = deadlineMode === 'payment'
                ? order.expiresAt
                : order.shipmentDeadlineAt;

              return (
                <Box
                  key={order.id}
                  className="bg-white dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-700 overflow-hidden"
                >
                  <Box
                    sx={{
                      display: 'grid',
                      gap: 2,
                      px: { xs: 2, md: 3 },
                      py: 2,
                      gridTemplateColumns: { xs: '1fr', lg: 'repeat(4, minmax(0, 1fr)) 240px' },
                      textAlign: 'left',
                    }}
                    className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900/40"
                  >
                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        <FormattedMessage id="orders.orderPlaced" defaultMessage="Order placed" />
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                        {createdDate}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        <FormattedMessage id="orders.orderTotal" defaultMessage="Order total" />
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
                        {formatOrderUsdPrice(intl.locale, order.price)}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        <FormattedMessage id="orders.charged" defaultMessage="Charged" />
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
                        {formatOrderChargedLabel(intl, order)}
                      </Typography>
                    </Box>

                    <Box sx={{ textAlign: 'left' }}>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        <FormattedMessage id="orders.orderNumber" defaultMessage="Order Id" />
                      </Typography>
                      <Tooltip title={order.id} placement="top-start">
                        <Typography
                          variant="body1"
                          sx={{ mt: 0.5, fontWeight: 700, fontFamily: 'monospace' }}
                        >
                          {formatOrderPublicId(order.id)}
                        </Typography>
                      </Tooltip>
                      {/* <Button
                      variant="text"
                      size="small"
                      sx={{ mt: 0.75, px: 0, minWidth: 0 }}
                      onClick={() => handleViewReceipt(order.id)}
                    >
                      <FormattedMessage id="orders.viewReceipt" defaultMessage="Details" />
                    </Button> */}
                    </Box>

                    <Box>
                      {deadlineMode ? (
                        <>
                          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                            <FormattedMessage id="orders.lastUpdated" defaultMessage="Last updated" />
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                            {updatedDate || createdDate}
                          </Typography>

                          <OrderPaymentDeadline
                            status={order.status}
                            expiresAt={deadlineAt}
                            compact
                            mode={deadlineMode}
                            onExpired={deadlineMode === 'payment'
                              ? () => {
                                  void mutate();
                                }
                              : undefined}
                          />
                        </>
                      ) : (
                        <>
                          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                            <FormattedMessage id="orders.lastUpdated" defaultMessage="Last updated" />
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                            {updatedDate || createdDate}
                          </Typography>
                        </>
                      )}
                    </Box>
                  </Box>

                  <Box
                    sx={{
                      display: 'grid',
                      gap: 3,
                      px: { xs: 2, md: 3 },
                      py: { xs: 2, md: 2.5 },
                      alignItems: 'stretch',
                      gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr) 220px' },
                      textAlign: 'left',
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      {isCCU && visual ? (
                        <Box sx={{ position: 'relative', width: '100%', maxWidth: 280, height: { xs: 180, md: 160 }, overflow: 'hidden', borderRadius: 0 }}>
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
                            alt={visual.fromShipName || firstItemName}
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
                            alt={visual.toShipName || firstItemName}
                          />
                          <div className="absolute left-[35%] top-[50%] -translate-x-[50%] -translate-y-[50%] text-2xl font-bold text-white">
                            <ChevronsRight className="h-8 w-8" />
                          </div>
                        </Box>
                      ) : (
                        <Box
                          component="img"
                          sx={{
                            width: '100%',
                            maxWidth: 280,
                            height: { xs: 180, md: 160 },
                            objectFit: 'cover',
                            borderRadius: 0,
                          }}
                          src={visual?.thumbnail || MARKET_ITEM_PLACEHOLDER}
                          alt={firstItemName}
                        />
                      )}
                    </Box>

                    <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5, textAlign: 'left' }}>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                        {getStatusChip(order.status)}
                      </Box>

                      {order.status === OrderStatus.PaymentReview && (
                        <Alert severity="warning" sx={{ py: 0.75 }}>
                          <FormattedMessage
                            id="orders.paymentReviewDescription"
                            defaultMessage="Payment was received, but seller settlement needs manual review before fulfillment."
                          />
                        </Alert>
                      )}

                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                          {firstItemName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {formatOrderLeadSummary(intl, totalItemsCount)}
                        </Typography>
                      </Box>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {visibleItems.map((item, index) => {
                          const itemName = getOrderItemDisplayName(intl, item.marketItem, ships);
                          const cancelledQuantity = item.cancelledQuantity || 0;
                          const activeQuantity = item.quantity - cancelledQuantity;

                          return (
                            <Box
                              key={`${order.id}-${item.skuId || itemName}-${index}`}
                              sx={{
                                display: 'flex',
                                gap: 1.25,
                                alignItems: 'flex-start',
                                borderRadius: 2,
                                px: 3,
                                py: 1.25,
                                bgcolor: 'rgba(15, 23, 42, 0.03)',
                              }}
                            >
                              {/* <Box sx={{ mt: '2px', flexShrink: 0 }}>
                              {renderItemState(order, item, index)}
                            </Box> */}
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                  {itemName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {formatOrderItemQuantitySummary(intl, activeQuantity, item.quantity, item.price)}
                                </Typography>
                              </Box>
                            </Box>
                          );
                        })}

                        {hiddenItemsCount > 0 && (
                          <Typography variant="body2" color="text.secondary" sx={{ pl: 0.5 }}>
                            {formatOrderMoreItemsLabel(intl, hiddenItemsCount)}
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        // justifyContent: 'space-between',
                        gap: 2,
                        px: 2,
                        py: 2,
                        textAlign: 'left',
                      }}
                    >
                      <Box>
                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                          <FormattedMessage id="orders.actionPanel" defaultMessage="Actions" />
                        </Typography>
                      </Box>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                        {order.status === OrderStatus.Pending && (
                          <Button
                            fullWidth
                            variant="outlined"
                            color="primary"
                            size="medium"
                            startIcon={<PaymentIcon />}
                            onClick={() => handleRestartPayment(order.id)}
                          >
                            <FormattedMessage id="orders.restartPayment" defaultMessage="Pay" />
                          </Button>
                        )}

                        <Button
                          fullWidth
                          variant="outlined"
                          color="primary"
                          size="medium"
                          startIcon={<ReceiptLongIcon />}
                          onClick={() => handleViewReceipt(order.id)}
                        >
                          <FormattedMessage id="orders.viewReceipt" defaultMessage="Details" />
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              );
            })}

            {!isMobile && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <TablePagination
                  rowsPerPageOptions={[5, 10, 25]}
                  component="div"
                  count={filteredOrders.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: 'Rows per page:' })}
                  labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'Total' })} ${count}`}
                />
              </Box>
            )}
          </Box>
        )}
      </div>
    </div>
  );
}
