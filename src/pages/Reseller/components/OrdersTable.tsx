import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  Pagination,
  Chip,
  Tooltip,
  TextField
} from '@mui/material';
import { useRelatedOrdersData } from '@/hooks/swr/orders';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { OrderItem as MarketOrderItem } from '@/types';
import { formatOrderPublicId } from '@/utils/orderId';

// Order delivery status
const deliveryStatus: Record<string, string> = {
  delivering: 'warning',
  delivered: 'success',
  pending: 'default',
};

const OrdersTable: React.FC = () => {
  const intl = useIntl();
  const navigate = useNavigate();
  const { orders, pagination, loading, handlePageChange } = useRelatedOrdersData();
  const [searchTerm, setSearchTerm] = React.useState('');

  // Handle pagination change
  const onPageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    handlePageChange(value);
  };

  // Handle search
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  // Navigate to order detail page
  const handleOrderClick = (orderId: string) => {
    navigate(`/reseller/orders/${orderId}`);
  };

  // Calculate order total
  const calculateTotal = (items: MarketOrderItem[]) => {
    return items.reduce((sum, item) => {
      const effectiveQuantity = item.quantity - (item.cancelledQuantity || 0);
      return sum + (effectiveQuantity * item.price);
    }, 0);
  };

  const formatUsd = (value: number) => value.toLocaleString(intl.locale, {
    style: 'currency',
    currency: 'USD',
  });

  // Filter orders data
  const normalizedSearchTerm = searchTerm.toLowerCase();

  const filteredOrders = orders.filter(order =>
    order.id.toLowerCase().includes(normalizedSearchTerm) ||
    order.status.toLowerCase().includes(normalizedSearchTerm) ||
    order.items.some(item => item.marketItem.name.toLowerCase().includes(normalizedSearchTerm))
  );

  if (loading) {
    return <Typography variant="body1"><FormattedMessage id="common.loading" /></Typography>;
  }

  // Get delivery status for display
  const getDeliveryStatus = (items: MarketOrderItem[]) => {
    if (items.every(item => Boolean(item.shipped))) {
      return 'delivered';
    } else if (items.some(item => Boolean(item.shipped))) {
      return 'delivering';
    }
    return 'pending';
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Search box */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <TextField
          sx={{ flexGrow: 1 }}
          variant="outlined"
          placeholder={intl.formatMessage({ id: 'orders.search.placeholder', defaultMessage: 'Search orders...' })}
          value={searchTerm}
          onChange={handleSearchChange}
          slotProps={{
            input: {
              sx: {
                color: 'text.primary',
              },
            },
          }}
          size="small"
        />
      </Box>

      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }} aria-label="orders table">
          <TableHead>
            <TableRow>
              <TableCell><FormattedMessage id="orders.id" defaultMessage="ID" /></TableCell>
              <TableCell><FormattedMessage id="orders.date" defaultMessage="Date" /></TableCell>
              {/* <TableCell><FormattedMessage id="orders.status" defaultMessage="Status" /></TableCell> */}
              <TableCell><FormattedMessage id="orders.items" defaultMessage="Items" /></TableCell>
              <TableCell align="right"><FormattedMessage id="orders.total" defaultMessage="Total" /></TableCell>
              {/* <TableCell align="right"><FormattedMessage id="orders.action" defaultMessage="Action" /></TableCell> */}
              <TableCell align="right"><FormattedMessage id="orders.delivery" defaultMessage="Delivery" /></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <FormattedMessage id="orders.noOrders" />
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => (
                <TableRow
                  key={order.id}
                  sx={{
                    '&:last-child td, &:last-child th': { border: 0 },
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
                  }}
                  onClick={() => handleOrderClick(order.id)}
                >
                  <TableCell component="th" scope="row">
                    <Tooltip title={order.id} placement="top-start">
                      <span style={{ fontFamily: 'monospace' }}>
                        {formatOrderPublicId(order.id)}
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {new Date(order.createdAt).toLocaleString(intl.locale)}
                  </TableCell>
                  {/* <TableCell>
                    <Chip
                      label={<FormattedMessage id={`orders.status.${order.status}`} />}
                      color={(statusColor[order.status] as "success" | "warning" | "error" | "default" | "info") || 'default'}
                      size="small"
                      sx={{ borderRadius: '4px', fontWeight: 500 }}
                    />
                  </TableCell> */}
                  <TableCell>
                    <Box>
                      {order.items.map((item, index) => (
                        <Tooltip
                          key={item.id || `${order.id}-${item.marketItem.skuId}-${index}`}
                          title={
                            <Box>
                              <Typography variant="body2">{item.marketItem.name}</Typography>
                              <Typography variant="caption">
                                {item.quantity}x @ {formatUsd(item.price)}
                                {item.cancelledQuantity ? ` (${intl.formatMessage(
                                  { id: 'orders.cancelledQuantity', defaultMessage: '{count} cancelled' },
                                  { count: item.cancelledQuantity },
                                )})` : ''}
                              </Typography>
                            </Box>
                          }
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              mb: index !== order.items.length - 1 ? 0.5 : 0,
                              textDecoration: item.cancelledQuantity === item.quantity ? 'line-through' : 'none',
                            }}
                          >
                            {item.marketItem.name.length > 30
                              ? `${item.marketItem.name.substring(0, 30)}...`
                              : item.marketItem.name} ({item.quantity}x)
                          </Typography>
                        </Tooltip>
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    {formatUsd(calculateTotal(order.items))}
                  </TableCell>
                  {/* <TableCell align="right">
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOrderClick(order.id);
                      }}
                    >
                      <FormattedMessage id="orders.details" defaultMessage="Details" />
                    </Button>
                  </TableCell> */}
                  <TableCell align="right">
                    <Chip
                      label={
                        order.items.every(item => Boolean(item.shipped)) 
                          ? <FormattedMessage id="orders.delivered" defaultMessage="Delivered" />
                          : order.items.some(item => Boolean(item.shipped))
                            ? <FormattedMessage id="orders.delivering" defaultMessage="Delivering" />
                            : <FormattedMessage id="orders.notShipped" defaultMessage="Not Shipped" />
                      }
                      color={(deliveryStatus[getDeliveryStatus(order.items)] as "success" | "warning" | "default") || 'default'}
                      size="small"
                      sx={{ 
                        borderRadius: '4px', 
                        bgcolor: getDeliveryStatus(order.items) === 'delivering' ? '#FFA726' : undefined,
                        color: getDeliveryStatus(order.items) === 'delivering' ? 'white' : undefined
                      }}
                    />
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
            onChange={onPageChange}
            color="primary"
          />
        </Box>
      )}
    </Box>
  );
};

export default OrdersTable;
