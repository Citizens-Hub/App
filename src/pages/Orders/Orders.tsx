import useOrdersData from "./hooks/useOrdersData";
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
  TablePagination
} from '@mui/material';

import { FormattedMessage, useIntl } from 'react-intl';
import { OrderStatus } from "../../types";
import { useNavigate } from "react-router";
import PaymentIcon from '@mui/icons-material/Payment';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import SearchIcon from '@mui/icons-material/Search';
import { useState, useEffect } from 'react';
import { ChevronsRight } from "lucide-react";
import { useSelector } from 'react-redux';
import { RootState } from '../../store';

export default function Orders() {
  const { ships, orders, listingItems, loading, error } = useOrdersData();
  const navigate = useNavigate();
  const intl = useIntl();
  const isMobile = window.innerWidth < 768;
  const { user } = useSelector((state: RootState) => state.user);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [filteredOrders, setFilteredOrders] = useState(orders);

  // 过滤订单
  useEffect(() => {
    if (orders) {
      const filtered = orders.filter(order => {
        if (searchTerm === '') return true;

        // 匹配订单ID
        if (order.id.toString().includes(searchTerm)) return true;

        // 匹配订单中的商品名称
        try {
          const orderItems = parseOrderItems(order.items);
          if (orderItems?.some((item: { skuId: string; quantity: number }) => {
            const shipInfo = ships.find(ship => ship.skus?.some(sku => sku.id === Number(item.skuId)));
            return shipInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase());
          })) {
            return true;
          }
        } catch (err) {
          console.error('Error parsing order items', err);
        }

        return false;
      });

      setFilteredOrders(filtered);
      setPage(0); // 重置到第一页
    }
  }, [searchTerm, orders, ships]);

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

    fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/invoice/?invoiceId=${order.invoiceId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user?.token}`
      }
    }).then(res => res.json()).then(data => {
      window.open(data.data.url, '_blank');
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

  // 解析订单项目
  const parseOrderItems = (itemsString: string) => {
    try {
      return JSON.parse(itemsString);
    } catch {
      return { items: [] };
    }
  };

  // 根据skuId获取商品详情
  const getItemDetails = (skuId: string) => {
    return listingItems.find(item => item.skuId.toString() === skuId);
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
                  <TableCell width="100px" sx={{ backgroundColor: 'background.paper', zIndex: 1 }}>
                    <FormattedMessage id="orders.id" defaultMessage="Order ID" />
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
                  const orderItems = parseOrderItems(order.items);
                  const date = new Date(order.createdAt).toLocaleDateString();

                  // 获取第一个商品的详情用于显示图片
                  const firstItem = orderItems?.length > 0 ? orderItems[0] : null;
                  const firstItemDetails = firstItem ? getItemDetails(firstItem.skuId) : null;
                  const fromShipId = firstItemDetails ? JSON.parse(firstItemDetails.item).from : null;
                  const toShipId = firstItemDetails ? JSON.parse(firstItemDetails.item).to : null;

                  const fromShip = fromShipId ? ships.find(ship => ship.id === fromShipId) : null;
                  const toShip = toShipId ? ships.find(ship => ship.id === toShipId) : null;
                  const isCCU = fromShip && toShip && fromShip.id !== toShip.id;

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
                            src={toShip?.medias?.productThumbMediumAndSmall || 'https://via.placeholder.com/280x160?text=No+Image'}
                            alt={firstItemDetails?.name || ''}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-col gap-2'>
                          {orderItems?.slice(0, 4).map((item: { skuId: string; quantity: number }, index: number) => {
                            // 查找商品信息
                            const itemDetails = getItemDetails(item.skuId);
                            const shipInfo = ships.find(ship => ship.skus?.some(sku => sku.id === Number(item.skuId)));

                            return (
                              <div key={index} className="flex items-center">
                                <div className='text-[14px]'>
                                  - {(itemDetails ? itemDetails.name : shipInfo ? shipInfo.name : `Item #${item.skuId}`)?.slice(0, 25)}...
                                </div>
                                {item.quantity > 1 && (
                                  <Chip
                                    size="small"
                                    label={`x${item.quantity}`}
                                    sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                                  />
                                )}
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
                            <FormattedMessage id="orders.restartPayment" defaultMessage="Pay Now" />
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
                            <FormattedMessage id="orders.viewReceipt" defaultMessage="View Receipt" />
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