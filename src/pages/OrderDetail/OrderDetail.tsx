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
} from '@mui/material';
import { FormattedMessage } from 'react-intl';
import { DetailedOrderItem, OrderStatus } from "@/types";
import { useNavigate, useParams } from "react-router";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { Check, ChevronsRight, Info, X } from "lucide-react";
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useOrderData } from '@/hooks';

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const { ships, order, loading, error } = useOrderData(orderId || '');
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.user);
  const isMobile = window.innerWidth < 768;

  if (!order) {
    return <div>Order not found</div>;
  }

  // Handle view receipt
  const handleViewReceipt = () => {
    if (!order || !order.invoiceId) return;

    fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/invoice?invoiceId=${order.invoiceId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user?.token}`
      }
    }).then(res => res.json()).then(data => {
      window.open(data.url, '_blank');
    });
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
      case OrderStatus.Canceled:
        color = "error";
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
  const createdDate = new Date(order.createdAt).toLocaleString();
  const updatedDate = new Date(order.updatedAt).toLocaleString();
  const totalItemsCount = orderItems.reduce((acc: number, item: DetailedOrderItem) => acc + item.quantity, 0);
  const cancelledItemsCount = orderItems.reduce((acc: number, item: DetailedOrderItem) => acc + (item?.cancelledQuantity || 0), 0);
  const activeItemsCount = totalItemsCount - cancelledItemsCount;

  return (
    <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 px-8 py-4 overflow-auto'>
      <div className='w-full max-w-[1280px] mx-auto flex flex-col gap-4 pt-4'>
        {/* Header Section with Navigation and Action Buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, md: { mt: 0 } }} className="app-header">
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

          <Button
            variant="text"
            startIcon={<ReceiptLongIcon />}
            onClick={handleViewReceipt}
            disabled={order.status !== OrderStatus.Paid}
          >
            <FormattedMessage id="orderDetail.viewInvoice" defaultMessage="View Invoice" />
          </Button>
        </Box>

        {/* Order Progress Indicator */}
        <div className="bg-white dark:bg-slate-800 rounded-md p-6 shadow-sm mb-4 border border-gray-100 dark:border-slate-700">
          <Stepper activeStep={getActiveStep(order.status)} alternativeLabel>
            <Step completed={order.status !== OrderStatus.Pending}>
              <StepLabel>
                <FormattedMessage id="orderDetail.status.pending" defaultMessage="Pending" />
              </StepLabel>
            </Step>
            <Step completed={order.status === OrderStatus.Processing || order.status === OrderStatus.Paid || order.status === OrderStatus.Finished}>
              <StepLabel>
                <FormattedMessage id="orderDetail.status.processing" defaultMessage="Processing" />
              </StepLabel>
            </Step>
            <Step completed={order.status === OrderStatus.Paid || order.status === OrderStatus.Finished}>
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
        <div className="bg-white dark:bg-slate-800 rounded-md p-6 shadow-sm mb-6 border border-gray-100 dark:border-slate-700">
          <div className="flex flex-wrap gap-6 justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <Typography variant="h5" fontWeight="bold" 
                  sx={{
                    borderLeft: '4px solid',
                    borderLeftColor: order.status === OrderStatus.Paid ? 'success.main' :
                      order.status === OrderStatus.Pending ? 'warning.main' :
                        order.status === OrderStatus.Canceled ? 'error.main' : 'divider',
                    pl: 1
                  }}
                >
                  #{order.id}
                </Typography>
                {getStatusChip(order.status)}
              </div>
              
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
                
                {order.invoiceId && (
                  <div className="md:col-span-2">
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
                ${order.price - order.items.reduce((acc, item) => acc + item.price * (item.cancelledQuantity || 0), 0)}
              </div>
              
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                <FormattedMessage id="orderDetail.itemsCount" defaultMessage="Items Count" />
              </Typography>
              <Typography variant="body2">
                {activeItemsCount} / {totalItemsCount} <FormattedMessage id="orderDetail.active" defaultMessage="active" />
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
              label={`${activeItemsCount} ${activeItemsCount === 1 ? 'item' : 'items'}`} 
              size="small" 
              variant="outlined"
            />
          </div>

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
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orderItems.map((item: DetailedOrderItem, index: number) => {
                    const marketItem = item.marketItem;
                    const fromShipId = marketItem?.fromShipId;
                    const toShipId = marketItem?.toShipId;
                    const shipId = marketItem?.shipId;

                    const fromShip = fromShipId ? ships.find(ship => ship.id === fromShipId) : null;
                    const toShip = toShipId ? ships.find(ship => ship.id === toShipId) : null;
                    const ship = shipId ? ships.find(ship => ship.id === shipId) : null;

                    const isCCU = marketItem?.itemType === 'ccu' && fromShip && toShip;
                    const itemCancelledQty = item?.cancelledQuantity || 0;
                    const activeQty = item.quantity - itemCancelledQty;

                    return (
                      <TableRow 
                        key={index}
                        sx={{
                          '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' },
                          transition: 'background-color 0.2s'
                        }}
                      >
                        <TableCell>
                          {isCCU ? (
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
                                src={fromShip?.medias?.productThumbMediumAndSmall || 'https://via.placeholder.com/280x160?text=No+Image'}
                                alt={fromShip?.name || ''}
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
                                src={toShip?.medias?.productThumbMediumAndSmall || 'https://via.placeholder.com/280x160?text=No+Image'}
                                alt={toShip?.name || ''}
                              />
                              <div className='absolute top-[50%] left-[35%] -translate-y-[50%] -translate-x-[50%] text-white text-2xl font-bold'>
                                <ChevronsRight className='w-8 h-8' />
                              </div>
                            </Box>
                          ) : (
                            <Box
                              component="img"
                              sx={{ width: 280, height: 160, objectFit: 'cover' }}
                              src={(toShip || ship)?.medias?.productThumbMediumAndSmall || 'https://via.placeholder.com/280x160?text=No+Image'}
                              alt={marketItem?.name || ''}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography fontWeight="medium">{marketItem?.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {marketItem?.belongsTo && `${marketItem.belongsTo}`}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <div className="flex justify-center items-center">
                            {item.quantity === itemCancelledQty ? (
                              <div className="flex items-center text-red-500">
                                <X className='w-4 h-4 mr-1' /> 0/{item.quantity}
                              </div>
                            ) : itemCancelledQty > 0 ? (
                              <div className="flex items-center text-orange-500">
                                <Info className='w-4 h-4 mr-1' /> {activeQty}/{item.quantity}
                              </div>
                            ) : (
                              <div className="flex items-center text-green-500">
                                <Check className='w-4 h-4 mr-1' /> {item.quantity}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className='text-[16px] text-blue-500 font-bold'>
                            ${item.price}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className='text-[16px] text-blue-500 font-bold'>
                            ${item.price * activeQty}
                          </div>
                        </TableCell>
                        <TableCell align="center">
                          {
                            item.shipped ? (
                              <Chip
                                size="small"
                                color="success"
                                label={<FormattedMessage id="orderDetail.completed" defaultMessage="Delivered" />}
                              />
                            ) : (
                              <Chip
                                size="small"
                                color="warning"
                                label={<FormattedMessage id="orderDetail.sipping" defaultMessage="Delivering" />}
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
      </div>
    </div>
  );
} 