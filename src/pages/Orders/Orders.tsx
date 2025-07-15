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
  TextField,
  InputAdornment,
  TablePagination,
} from '@mui/material';

import { FormattedMessage, useIntl } from 'react-intl';
import { OrderStatus } from "@/types";
import { useNavigate } from "react-router";
import PaymentIcon from '@mui/icons-material/Payment';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import SearchIcon from '@mui/icons-material/Search';
import { useState, useEffect, useMemo } from 'react';
import { Check, ChevronsRight, Info, Loader2, X } from "lucide-react";
import { useOrdersData } from '@/hooks';

export default function Orders() {
  const { ships, orders, loading, error } = useOrdersData();
  const navigate = useNavigate();
  const intl = useIntl();
  const isMobile = window.innerWidth < 768;
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [filteredOrders, setFilteredOrders] = useState(orders);

  // 使用useMemo过滤订单
  const filteredOrdersList = useMemo(() => {
    if (!orders) return [];
    
    return orders.filter(order => {
      if (searchTerm === '') return true;

      // 匹配订单ID
      if (order.id.toString().includes(searchTerm)) return true;

      // 匹配订单中的商品名称
      const orderItems = order.items;
      if (orderItems?.some((item) => {
        const marketItem = item.marketItem;
        const shipInfo = ships.find(ship => ship.skus?.some(sku => sku.id === Number(marketItem.skuId)));
        return shipInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          marketItem.name?.toLowerCase().includes(searchTerm.toLowerCase());
      })) {
        return true;
      }

      return false;
    });
  }, [searchTerm, orders, ships]);
  
  useEffect(() => {
    setFilteredOrders(filteredOrdersList);
    setPage(0);
  }, [filteredOrdersList]);

  // 处理搜索
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  // 处理分页
  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // 分页处理
  const paginatedOrders = filteredOrders.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  // 重新发起支付
  const handleRestartPayment = (orderId: number) => {
    const order = orders.find(order => order.id === orderId);
    if (!order) return;

    // 导航到结账页面并传递订单信息
    navigate('/checkout', {
      state: {
        pendingOrder: order,
        ships
      }
    });
  };

  const handleViewReceipt = (orderId: number) => {
    const order = orders.find(order => order.id === orderId);
    if (!order) return;

    // Navigate to the order details page
    navigate(`/orders/${orderId}`, {
      state: {
        order,
        ships
      }
    });
  };

  // 获取订单状态显示样式
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

  // 显示加载状态
  if (loading) {
    return (
      <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 px-8 py-4 overflow-auto max-w-[1280px] mx-auto'>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, md: { mt: 0 } }} className="app-header">
          <div className='flex flex-row items-center gap-4'>
            <Typography variant={isMobile ? "h6" : "h5"}>
              <FormattedMessage id="orders.title" defaultMessage="My Orders" />
            </Typography>
          </div>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <CircularProgress />
        </Box>
      </div>
    );
  }

  // 显示错误信息
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

  return (
    <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 px-8 py-4 overflow-auto max-w-[1280px] mx-auto'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, md: { mt: 0 } }} className="app-header">
        <div className='flex flex-row items-center gap-4'>
          <Typography variant={isMobile ? "h6" : "h5"}>
            <FormattedMessage id="orders.title" defaultMessage="My Orders" />
          </Typography>
        </div>
      </Box>

      {/* 搜索框 */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
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
                )
              }
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
        <Box sx={{ width: '100%', height: 'calc(100vh - 240px)', overflow: 'auto' }} className="resource-card">
          <TableContainer sx={{ mb: 2, maxHeight: 'calc(100% - 68px)' }}>
            <Table stickyHeader aria-label="orders list table">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                    <FormattedMessage id="orders.id" defaultMessage="ID" />
                  </TableCell>
                  <TableCell width="320px" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                    <FormattedMessage id="orders.image" defaultMessage="Image" />
                  </TableCell>
                  <TableCell sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                    <FormattedMessage id="orders.items" defaultMessage="Items" />
                  </TableCell>
                  <TableCell width="120px" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                    <FormattedMessage id="orders.price" defaultMessage="Price" />
                  </TableCell>
                  <TableCell width="120px" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                    <FormattedMessage id="orders.charge" defaultMessage="Charged" />
                  </TableCell>
                  <TableCell width="120px" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                    <FormattedMessage id="orders.status" defaultMessage="Status" />
                  </TableCell>
                  <TableCell width="120px" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                    <FormattedMessage id="orders.date" defaultMessage="Date" />
                  </TableCell>
                  <TableCell width="170px" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                    <FormattedMessage id="orders.actions" defaultMessage="Actions" />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedOrders.map((order) => {
                  const orderItems = order.items;
                  const date = new Date(order.createdAt).toLocaleDateString();

                  // 获取第一个商品的详情用于显示图片
                  const firstItem = orderItems?.length > 0 ? orderItems[0] : null;
                  const marketItem = firstItem?.marketItem;

                  const fromShipId = marketItem?.fromShipId;
                  const toShipId = marketItem?.toShipId;
                  const shipId = marketItem?.shipId;

                  const fromShip = fromShipId ? ships.find(ship => ship.id === fromShipId) : null;
                  const toShip = toShipId ? ships.find(ship => ship.id === toShipId) : null;
                  const ship = shipId ? ships.find(ship => ship.id === shipId) : null;

                  const isCCU = marketItem?.itemType === 'ccu' && fromShip && toShip;

                  return (
                    <TableRow
                      key={order.id}
                      hover
                      sx={{
                        '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' },
                        transition: 'background-color 0.2s'
                      }}
                    >
                      <TableCell sx={{
                        fontWeight: 500,
                        borderLeft: '4px solid',
                        borderLeftColor: order.status === OrderStatus.Paid ? 'success.main' :
                          order.status === OrderStatus.Pending ? 'warning.main' :
                            order.status === OrderStatus.Canceled ? 'error.main' :
                              'divider'
                      }}>
                        #{order.id}
                      </TableCell>
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
                        <div className='flex flex-col gap-2'>
                          {orderItems?.slice(0, 4).map((item, index: number) => {
                            const marketItem = item.marketItem;
                            const itemName = marketItem?.name;

                            return (
                              <div className="flex items-center" key={index}>
                                <div className='text-[14px] flex items-center gap-1 max-w-[200px]'>
                                  <div className='flex items-center gap-1'>
                                    {(item.quantity === item?.cancelledQuantity ||
                                      order.status === OrderStatus.Canceled) ? (
                                      <X className='w-4 h-4 text-red-500' />
                                    ) : order.status === OrderStatus.Pending ? <Loader2 className={`w-4 h-4 text-orange-500 animate-spin ${index !== 0 && 'animate-none opacity-0'}`} /> :
                                      item?.cancelledQuantity ? (<>
                                        <Info className='w-4 h-4 text-orange-500' />
                                        <div className='text-[12px] text-orange-500 text-nowrap'>
                                          {item.quantity - item?.cancelledQuantity} / {item.quantity}
                                        </div>
                                      </>) : (<>
                                        <Check className='w-4 h-4 text-green-500' />
                                        <div className='text-[12px] text-green-500 text-nowrap'>
                                          {item.quantity} / {item.quantity}
                                        </div>
                                      </>)}
                                  </div>
                                  <div className='truncate'>{itemName}</div>
                                </div>
                                {/* {item.quantity > 1 && (
                                  <Chip
                                    size="small"
                                    label={`x${item.quantity}`}
                                    sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                                  />
                                )} */}
                              </div>
                            );
                          })}
                          {orderItems?.length > 4 && (
                            <div className='text-[14px]'>
                              + {orderItems.length - 4} more
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='text-[16px] text-blue-500 font-bold'>
                          ${order.price}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='text-[16px] text-blue-500 font-bold'>
                          {
                            order.status === OrderStatus.Paid && <>${order.price - order.items.reduce((acc, item) => acc + item.price * (item?.cancelledQuantity || 0), 0)}</>
                          }
                        </div>
                      </TableCell>
                      <TableCell>{getStatusChip(order.status)}</TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {date}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {order.status === OrderStatus.Pending && (
                          <Button
                            fullWidth
                            variant="contained"
                            color="primary"
                            size="small"
                            startIcon={<PaymentIcon />}
                            onClick={() => handleRestartPayment(order.id)}
                          >
                            <FormattedMessage id="orders.restartPayment" defaultMessage="Pay" />
                          </Button>
                        )}
                        {order.status === OrderStatus.Paid && (
                          <Button
                            fullWidth
                            variant="outlined"
                            size="small"
                            startIcon={<ReceiptLongIcon />}
                            onClick={() => handleViewReceipt(order.id)}
                          >
                            <FormattedMessage id="orders.viewReceipt" defaultMessage="Details" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {!isMobile && (
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
          )}
        </Box>
      )}
    </div>
  );
}