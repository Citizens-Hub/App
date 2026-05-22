import {
  Typography,
  Box,
  Alert,
  Button,
  Chip,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
  Step,
  StepLabel,
  Stepper,
  Paper,
  Rating,
  TextField,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { DetailedOrderItem, OrderStatus } from "@/types";
import { useLocation, useNavigate, useParams } from "react-router";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { Check, ChevronsRight, Info, X } from "lucide-react";
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useOrderData, useUploadOrderReviewAttachment } from '@/hooks';
import { getMarketItemVisual, MARKET_ITEM_PLACEHOLDER } from '@/components/marketItemDisplay';
import OrderPaymentDeadline from '@/components/OrderPaymentDeadline';
import {
  formatOrderActiveItemsSummary,
  formatOrderCcuRoute,
  formatOrderItemCountLabel,
  formatOrderPackageSummary,
  formatOrderUsdPrice,
  getLocalizedOrderItemShipNames,
  getOrderChargedAmount,
  getOrderItemDisplayName,
} from './orderI18n';

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const { ships, order, loading, error, mutateOrder } = useOrderData(orderId || '');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state: RootState) => state.user);
  const intl = useIntl();
  const isMobile = window.innerWidth < 768;
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [reviewFlash, setReviewFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const reviewSectionRef = useRef<HTMLDivElement | null>(null);
  const { uploadFile, loading: uploadLoading } = useUploadOrderReviewAttachment();

  const canReview = order?.status === OrderStatus.Finished;
  const hasReview = order?.rating !== null && order?.rating !== undefined;
  const reviewMode = location.search.includes('review=1');

  useEffect(() => {
    setFeedbackRating(order?.rating ?? null);
    setFeedbackText(order?.feedback || '');
  }, [order?.feedback, order?.rating]);

  useEffect(() => {
    if (canReview && reviewMode) {
      reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [canReview, reviewMode]);

  // Handle view receipt
  const handleViewReceipt = () => {
    if (!order) return;

    if (order.invoiceUrl) {
      window.open(order.invoiceUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (!order.invoiceId) return;

    fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/invoice?invoiceId=${order.invoiceId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user?.token}`
      }
    }).then(res => res.json()).then(data => {
      if (!data?.url) {
        throw new Error('Invoice URL not found');
      }

      window.open(data.url, '_blank', 'noopener,noreferrer');
    }).catch((viewError) => {
      console.error(viewError);
    });
  };

  const handleSubmitFeedback = async () => {
    if (!order || !feedbackRating) {
      return;
    }

    try {
      setFeedbackSubmitting(true);
      setReviewFlash(null);

      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/${order.id}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`
        },
        body: JSON.stringify({
          rating: feedbackRating,
          feedback: feedbackText.trim() || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || intl.formatMessage({
          id: 'orders.reviewSubmitError',
          defaultMessage: 'Failed to submit review.',
        }));
      }

      await mutateOrder(payload, { revalidate: false });
      setReviewFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'orders.reviewSubmitSuccess',
          defaultMessage: 'Review submitted.',
        }),
      });
    } catch (submitError) {
      setReviewFlash({
        severity: 'error',
        text: submitError instanceof Error
          ? submitError.message
          : intl.formatMessage({
              id: 'orders.reviewSubmitError',
              defaultMessage: 'Failed to submit review.',
            }),
      });
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleReviewImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!order || !file) {
      return;
    }

    try {
      setReviewFlash(null);
      await uploadFile(order.id, file);
      await mutateOrder();
      setReviewFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'orders.reviewImageUploadSuccess',
          defaultMessage: 'Review image uploaded.',
        }),
      });
    } catch (uploadError) {
      setReviewFlash({
        severity: 'error',
        text: uploadError instanceof Error
          ? uploadError.message
          : intl.formatMessage({
              id: 'orders.reviewImageUploadError',
              defaultMessage: 'Failed to upload review image.',
            }),
      });
    }
  };

  // Get status chip
  const getStatusChip = (status: OrderStatus) => {
    let color: "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" = "default";

    switch (status) {
      case OrderStatus.Pending:
        color = "warning";
        break;
      case OrderStatus.Paid:
        color = "success";
        break;
      case OrderStatus.PaymentReview:
        color = "warning";
        break;
      case OrderStatus.Canceled:
        color = "error";
        break;
      case OrderStatus.Finished:
        color = "secondary";
        break;
      default:
        color = "default";
    }

    return (
      <Chip
        color={color}
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
  };

  // Get active step based on order status
  const getActiveStep = (status: OrderStatus) => {
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
  };

  // Loading state
  if (loading) {
    return (
      <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 px-8 py-4 overflow-auto max-w-[1280px] mx-auto'>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }} className="app-header">
          <Typography variant={isMobile ? "h6" : "h5"}>
            <FormattedMessage id="orderDetail.title" defaultMessage="Order Details" />
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <CircularProgress />
        </Box>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Box className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 px-8 py-4 overflow-auto max-w-[1280px] mx-auto" display="flex" flexDirection="column" alignItems="center" justifyContent="center">
        <Alert
          severity="error"
          sx={{
            maxWidth: 500,
            width: '100%',
            mb: 2,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            borderRadius: 2
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
    );
  }

  // If order not found
  if (!order) {
    return (
      <Box className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 px-8 py-4 overflow-auto" display="flex">
        <div className='w-full max-w-[1280px] mx-auto flex'>
          <Alert
            severity="warning"
            sx={{
              maxWidth: 500,
              width: '100%',
              mb: 2,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              borderRadius: 2
            }}
          >
            <FormattedMessage id="orderDetail.notFound" defaultMessage="Order not found" />
          </Alert>
          <Button
            variant="outlined"
            onClick={() => navigate('/orders')}
            startIcon={<ArrowBackIcon />}
          >
            <FormattedMessage id="orderDetail.backToOrders" defaultMessage="Back to Orders" />
          </Button>
        </div>
      </Box>
    );
  }

  const orderItems = order.items;
  const createdDate = new Date(order.createdAt).toLocaleString(intl.locale);
  const updatedDate = new Date(order.updatedAt).toLocaleString(intl.locale);
  const totalItemsCount = orderItems.reduce((acc: number, item: DetailedOrderItem) => acc + item.quantity, 0);
  const cancelledItemsCount = orderItems.reduce((acc: number, item: DetailedOrderItem) => acc + (item?.cancelledQuantity || 0), 0);
  const activeItemsCount = totalItemsCount - cancelledItemsCount;
  const deadlineMode = order.status === OrderStatus.Pending
    ? 'payment'
    : order.status === OrderStatus.Paid
      ? 'shipment'
      : null;
  const deadlineAt = deadlineMode === 'payment'
    ? order.expiresAt
    : order.shipmentDeadlineAt;
  const reviewImages = order.reviewAttachments || [];
  const canUploadMoreReviewImages = reviewImages.length < 5;
  const reviewSubmittedAt = order.feedbackAt ? new Date(order.feedbackAt).toLocaleString(intl.locale) : null;
  const reviewHintVisible = canReview && reviewMode && !hasReview;

  return (
    <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 px-8 py-4 overflow-auto'>
      <div className='w-full max-w-[1280px] mx-auto flex flex-col gap-4 pt-4'>
        {/* Header Section with Navigation and Action Buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, md: { mt: 0 }, gap: 2, flexWrap: 'wrap' }} className="app-header">
          <div className='flex flex-row items-center gap-4'>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate('/orders')}
              variant="text"
              sx={{ mr: 2 }}
            >
              <FormattedMessage id="orderDetail.backToOrders" defaultMessage="Back to Orders" />
            </Button>
            {/* <Typography variant={isMobile ? "h6" : "h5"}>
              <FormattedMessage id="orderDetail.title" defaultMessage="Order Details" />
            </Typography> */}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="text"
              onClick={() => navigate(`/tickets/create?orderId=${encodeURIComponent(order.id)}`)}
            >
              <FormattedMessage id="orderDetail.createTicket" defaultMessage="Open Support Ticket" />
            </Button>
            <Button
              variant="text"
              startIcon={<ReceiptLongIcon />}
              onClick={handleViewReceipt}
              disabled={order.status !== OrderStatus.Paid && order.status !== OrderStatus.Finished && order.status !== OrderStatus.PaymentReview}
            >
              <FormattedMessage id="orderDetail.viewInvoice" defaultMessage="View Invoice" />
            </Button>
          </div>
        </Box>

        {/* Order Progress Indicator */}
        <div className="bg-white dark:bg-neutral-900 py-6 shadow-sm mb-4 border border-gray-100 dark:border-neutral-700">
          <Stepper activeStep={getActiveStep(order.status)} alternativeLabel>
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

        {/* Order Header Information */}
        <div className="bg-white dark:bg-neutral-900 p-6 shadow-sm mb-6 border border-gray-100 dark:border-neutral-700">
          <div className="flex flex-wrap gap-6 justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <Typography variant="h5" fontWeight="bold" 
                  sx={{
                    borderLeft: '4px solid',
                    borderLeftColor: order.status === OrderStatus.Paid ? 'success.main' :
                      order.status === OrderStatus.Pending ? 'warning.main' :
                        order.status === OrderStatus.PaymentReview ? 'warning.main' :
                        order.status === OrderStatus.Canceled ? 'error.main' :
                          order.status === OrderStatus.Finished ? 'secondary.main' :
                            'divider',
                    pl: 1
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
              
              <div className="flex flex-col gap-2 items-start">
                <div>
                  <div className='text-xs text-gray-500 text-left'>
                    <FormattedMessage id="orderDetail.created" defaultMessage="Created At" />
                  </div>
                  <div className='text-sm text-left'>{createdDate}</div>
                </div>
                
                <div>
                  <div className='text-xs text-gray-500 text-left'>
                    <FormattedMessage id="orderDetail.updated" defaultMessage="Updated At" />
                  </div>
                  <div className='text-sm text-left'>{updatedDate}</div>
                </div>

                {deadlineMode && (
                  <div className="w-full text-left">
                    <OrderPaymentDeadline
                      status={order.status}
                      expiresAt={deadlineAt}
                      mode={deadlineMode}
                    />
                  </div>
                )}
                
                {order.invoiceId && (
                  <div className="md:col-span-2 text-left">
                    <Typography variant="caption" color="text.secondary">
                      <FormattedMessage id="orderDetail.invoiceId" defaultMessage="Invoice ID" />
                    </Typography>
                    <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                      {order.invoiceId}
                    </Typography>
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-right">
              <Typography variant="caption" color="text.secondary">
                <FormattedMessage id="orderDetail.totalPrice" defaultMessage="Total Price" />
              </Typography>
            <div className='text-[16px] text-blue-500 font-bold'>
                {order.status === OrderStatus.PaymentReview
                  ? <FormattedMessage id="orders.paymentReceivedReview" defaultMessage="Payment received, under review" />
                  : formatOrderUsdPrice(intl.locale, getOrderChargedAmount(order))}
              </div>
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                <FormattedMessage id="orderDetail.subtotal" defaultMessage="Subtotal" />
              </Typography>
              <Typography variant="body2">
                {formatOrderUsdPrice(intl.locale, order.subtotal || order.price)}
              </Typography>
              {(order.discountAmount || 0) > 0 && (
                <>
                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    <FormattedMessage id="orderDetail.discountAmount" defaultMessage="Discount" />
                  </Typography>
                  <Typography variant="body2" color="success.main">
                    -{formatOrderUsdPrice(intl.locale, order.discountAmount || 0)}
                  </Typography>
                </>
              )}
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                <FormattedMessage id="orderDetail.serviceFee" defaultMessage="Service Fee" />
              </Typography>
              <Typography variant="body2">
                {formatOrderUsdPrice(intl.locale, order.serviceFee || 0)}
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

        {/* Order Items Section */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <Typography variant="h6" fontWeight="medium">
              <FormattedMessage id="orderDetail.items" defaultMessage="Order Items" />
            </Typography>
            <Chip 
              label={formatOrderItemCountLabel(intl, activeItemsCount)}
              size="small" 
              variant="outlined"
            />
          </div>

          <Box sx={{ width: '100%', overflow: 'auto' }} className="resource-card">
            <TableContainer className="overflow-hidden mb-3">
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell width="320px" sx={{ backgroundColor: 'background.paper', zIndex: 1, textWrap: 'nowrap' }}>
                      <FormattedMessage id="orderDetail.image" defaultMessage="Image" />
                    </TableCell>
                    <TableCell sx={{ backgroundColor: 'background.paper', zIndex: 1, textWrap: 'nowrap' }}>
                      <FormattedMessage id="orderDetail.name" defaultMessage="Name" />
                    </TableCell>
                    <TableCell align="center" sx={{ backgroundColor: 'background.paper', zIndex: 1, textWrap: 'nowrap' }}>
                      <FormattedMessage id="orderDetail.quantity" defaultMessage="Quantity" />
                    </TableCell>
                    <TableCell align="right" sx={{ backgroundColor: 'background.paper', zIndex: 1, textWrap: 'nowrap' }}>
                      <FormattedMessage id="orderDetail.unitPrice" defaultMessage="Unit Price" />
                    </TableCell>
                    <TableCell align="right" sx={{ backgroundColor: 'background.paper', zIndex: 1, textWrap: 'nowrap' }}>
                      <FormattedMessage id="orderDetail.totalPrice" defaultMessage="Total Price" />
                    </TableCell>
                    <TableCell align="center" sx={{ backgroundColor: 'background.paper', zIndex: 1, textWrap: 'nowrap' }}>
                      <FormattedMessage id="orderDetail.status" defaultMessage="Status" />
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orderItems.map((item: DetailedOrderItem, index: number) => {
                    const marketItem = item.marketItem;
                    const itemName = getOrderItemDisplayName(intl, marketItem, ships);
                    const visual = marketItem ? getMarketItemVisual(marketItem, ships) : null;
                    const { shipName } = getLocalizedOrderItemShipNames(marketItem, ships);
                    const isCCU = marketItem?.itemType === 'ccu';
                    const isPackage = marketItem?.itemType === 'package';
                    const isCredit = marketItem?.itemType === 'credit';
                    const itemCancelledQty = item?.cancelledQuantity || 0;
                    const activeQty = item.quantity - itemCancelledQty;
                    const ccuRoute = formatOrderCcuRoute(intl, marketItem, ships);
                    const packageSummary = formatOrderPackageSummary(intl, marketItem);

                    return (
                      <TableRow 
                        key={index}
                        sx={{
                          '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' },
                          transition: 'background-color 0.2s'
                        }}
                      >
                        <TableCell>
                          {isCCU && visual ? (
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
                                  boxShadow: '0 0 20px 0 rgba(0, 0, 0, 0.2)'
                                }}
                                src={visual.toImage || MARKET_ITEM_PLACEHOLDER}
                                alt={visual.toShipName || itemName}
                              />
                              <div className='absolute top-[50%] left-[35%] -translate-y-[50%] -translate-x-[50%] text-white text-2xl font-bold'>
                                <ChevronsRight className='w-8 h-8' />
                              </div>
                            </Box>
                          ) : (
                            <Box
                              component="img"
                              sx={{ width: 280, height: 160, objectFit: 'cover' }}
                              src={visual?.thumbnail || MARKET_ITEM_PLACEHOLDER}
                              alt={itemName}
                            />
                          )}
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
                        </TableCell>
                        <TableCell align="center">
                          <div className="flex justify-center items-center">
                            {item.quantity === itemCancelledQty ? (
                              <div className="flex items-center text-red-500">
                                <X className='w-4 h-4 mr-1' />
                                <span>0/{item.quantity}</span>
                              </div>
                            ) : itemCancelledQty > 0 ? (
                              <div className="flex items-center text-orange-500">
                                <Info className='w-4 h-4 mr-1' />
                                <span>{activeQty}/{item.quantity}</span>
                              </div>
                            ) : (
                              <div className="flex items-center text-green-500">
                                <Check className='w-4 h-4 mr-1' />
                                <span>{item.quantity}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className='text-[16px] text-blue-500 font-bold'>
                            {formatOrderUsdPrice(intl.locale, item.price)}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className='text-[16px] text-blue-500 font-bold'>
                            {formatOrderUsdPrice(intl.locale, item.price * activeQty)}
                          </div>
                        </TableCell>
                        <TableCell align="center">
                          {
                            item.quantity === itemCancelledQty ? (
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
                            )
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </div>

        <Paper ref={reviewSectionRef} sx={{ p: 3, border: '1px solid', borderColor: 'divider', textAlign: 'left' }} elevation={0}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            <FormattedMessage id="orders.reviewTitle" defaultMessage="Order Review" />
          </Typography>

          {!canReview && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <FormattedMessage id="orders.reviewAfterComplete" defaultMessage="Review can be submitted after the order is completed." />
            </Alert>
          )}

          {reviewFlash && <Alert severity={reviewFlash.severity} sx={{ mb: 2 }}>{reviewFlash.text}</Alert>}

          {hasReview ? (
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Rating value={order.rating || null} readOnly />
              {reviewSubmittedAt && (
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage
                    id="orders.reviewSubmittedAt"
                    defaultMessage="Submitted at {time}"
                    values={{ time: reviewSubmittedAt }}
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
              {reviewImages.length > 0 && (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 1 }}>
                  {reviewImages.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
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
            <Box sx={{ display: 'grid', gap: 2 }}>
              {reviewHintVisible && (
                <Alert severity="success">
                  <FormattedMessage id="orders.reviewInvite" defaultMessage="Your order is complete. Please leave a rating and review." />
                </Alert>
              )}
              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <FormattedMessage id="orders.reviewRating" defaultMessage="Rating" />
                </Typography>
                <Rating
                  value={feedbackRating}
                  onChange={(_event, value) => setFeedbackRating(value)}
                  disabled={!canReview || feedbackSubmitting}
                />
              </Box>
              <TextField
                fullWidth
                multiline
                minRows={4}
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                label={intl.formatMessage({ id: 'orders.reviewComment', defaultMessage: 'Review comment (optional)' })}
                disabled={!canReview || feedbackSubmitting}
                sx={{
                  '& .MuiInputBase-input': {
                    textAlign: 'left',
                  },
                  '& .MuiInputBase-inputMultiline': {
                    textAlign: 'left',
                  },
                }}
              />
              <Box sx={{ display: 'grid', gap: 1 }}>
                <Typography variant="body2">
                  <FormattedMessage
                    id="orders.reviewImagesHelp"
                    defaultMessage="Upload up to 5 images. JPG, PNG, WEBP and other image formats are supported."
                  />
                </Typography>
                {reviewImages.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                    {reviewImages.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
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
                {canUploadMoreReviewImages && (
                  <Button
                    component="label"
                    variant="outlined"
                    disabled={!canReview || uploadLoading || feedbackSubmitting}
                    sx={{ width: 'fit-content' }}
                  >
                    <FormattedMessage id="orders.reviewUploadImage" defaultMessage="Upload Image" />
                    <input
                      hidden
                      accept="image/*"
                      type="file"
                      onChange={handleReviewImageUpload}
                    />
                  </Button>
                )}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  onClick={() => void handleSubmitFeedback()}
                  disabled={!canReview || feedbackSubmitting || uploadLoading || !feedbackRating}
                >
                  <FormattedMessage id="orders.reviewSubmit" defaultMessage="Submit Review" />
                </Button>
              </Box>
            </Box>
          )}
        </Paper>
      </div>
    </div>
  );
}
