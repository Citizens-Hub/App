import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { ArrowBack, ContentCopy } from '@mui/icons-material';
import Crawler from '@/components/Crawler';
import { useRelatedOrderData } from '@/hooks';
import { DetailedOrderItem } from '@/types';

// 订单状态颜色映射
const statusColor: Record<string, string> = {
  paid: 'success',
  pending: 'warning',
  processing: 'info',
  cancelled: 'error',
  refunded: 'default',
  finished: 'default',
};

interface CCUToOpen {
  name: string;
  pageId: number;
  type: 'normal' | 'buyback';
  url: string;
}

const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const intl = useIntl();
  const { token } = useSelector((state: RootState) => state.user.user);
  const items = useSelector((state: RootState) => state.upgrades.items);

  const [isShippingDialogOpen, setIsShippingDialogOpen] = useState(false);
  const [isGoShippingDialogOpen, setIsGoShippingDialogOpen] = useState(false);
  const [ccusToOpen, setCcusToOpen] = useState<{found: CCUToOpen[], notFound: string[]}>({found: [], notFound: []});
  const [currentItem, setCurrentItem] = useState<DetailedOrderItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState<'success' | 'error'>('success');

  const { order, error, mutateOrder: mutate, ships } = useRelatedOrderData(orderId || '');

  // 处理返回上一页
  const handleBack = () => {
    navigate(-1);
  };

  // 计算订单总价
  const calculateTotal = (items: DetailedOrderItem[]) => {
    return items?.reduce((sum, item) => {
      const effectiveQuantity = item.quantity - (item.cancelledQuantity || 0);
      return sum + (effectiveQuantity * item.price);
    }, 0) || 0;
  };

  // 打开发货对话框
  const handleOpenShippingDialog = (item: DetailedOrderItem) => {
    setCurrentItem(item);
    setIsShippingDialogOpen(true);
  };

  // 关闭发货对话框
  const handleCloseShippingDialog = () => {
    setIsShippingDialogOpen(false);
    setCurrentItem(null);
  };

  // 处理发货
  const handleShip = async () => {
    if (!currentItem || !order) return;

    setIsLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/ship`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          itemId: currentItem.id,
          orderId: order.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to ship item');
      }

      setAlertMessage(intl.formatMessage({ id: 'orders.shipSuccess', defaultMessage: 'Item shipped successfully' }));
      setAlertSeverity('success');
      setAlertOpen(true);

      // 刷新订单数据
      mutate();
    } catch (error) {
      console.error(error);
      setAlertMessage(intl.formatMessage({ id: 'orders.shipError', defaultMessage: 'Error shipping item' }));
      setAlertSeverity('error');
      setAlertOpen(true);
    } finally {
      setIsLoading(false);
      handleCloseShippingDialog();
    }
  };

  // 处理消息通知关闭
  const handleAlertClose = () => {
    setAlertOpen(false);
  };

  // 复制邮箱到剪贴板
  const handleCopyEmail = () => {
    if (order?.customerEmail) {
      navigator.clipboard.writeText(order.customerEmail);
      setAlertMessage(intl.formatMessage({ id: 'common.copied', defaultMessage: 'Copied to clipboard' }));
      setAlertSeverity('success');
      setAlertOpen(true);
    }
  };

  // 处理Go Shipping按钮点击
  const handleGoShippingClick = () => {
    if (!order || !items?.ccus) return;

    const currentRSIAccount = sessionStorage.getItem("currentRSIAccount");
    if (!currentRSIAccount) {
      setAlertMessage(intl.formatMessage({ id: 'orders.noRSIAccount', defaultMessage: 'No RSI account selected' }));
      setAlertSeverity('error');
      setAlertOpen(true);
      return;
    }

    const foundCcus: CCUToOpen[] = [];
    const notFoundCcus: string[] = [];

    // 遍历订单项
    order.items.forEach(orderItem => {
      const { marketItem } = orderItem;
      if (marketItem.itemType !== 'ccu') return;

      // 查找匹配的CCU，只查找当前账号的
      const currentRSIAccountNumber = parseInt(currentRSIAccount, 10);
      const matchingCCUs = items.ccus.filter(ccu => 
        ccu.name === marketItem.name && 
        ccu.belongsTo === currentRSIAccountNumber
      );

      if (!matchingCCUs.length) {
        // 没找到匹配的CCU
        notFoundCcus.push(marketItem.name);
        return;
      }

      // 按优先级排序 - 非buyback优先
      const sortedCCUs = [...matchingCCUs].sort((a, b) => {
        if (a.isBuyBack === b.isBuyBack) return 0;
        return a.isBuyBack ? 1 : -1; // 非buyback排在前面
      });

      // 计算需要打开的数量
      const effectiveQuantity = orderItem.quantity - (orderItem.cancelledQuantity || 0);
      let remainingToOpen = effectiveQuantity;

      // 先使用非buyback的CCU
      const nonBuybackCCUs = sortedCCUs.filter(ccu => !ccu.isBuyBack);
      const buybackCCUs = sortedCCUs.filter(ccu => ccu.isBuyBack);

      // 收集非buyback CCU
      nonBuybackCCUs.forEach(ccu => {
        if (remainingToOpen <= 0) return;

        if (ccu.pageIds && ccu.pageIds.length > 0) {
          ccu.pageIds.forEach((pageId) => {
            if (remainingToOpen <= 0) return;

            foundCcus.push({
              name: ccu.name,
              pageId,
              type: 'normal',
              url: `https://robertsspaceindustries.com/en/account/pledges?page=${pageId}&pagesize=1`
            });
            remainingToOpen--;
          });
        }
      });

      // 如果还需要更多，收集buyback CCU
      if (remainingToOpen > 0) {
        buybackCCUs.forEach(ccu => {
          if (remainingToOpen <= 0) return;
          if (ccu.pageIds && ccu.pageIds.length > 0) {
            ccu.pageIds.forEach((pageId) => {
              if (remainingToOpen <= 0) return;

              foundCcus.push({
                name: ccu.name,
                pageId,
                type: 'buyback',
                url: `https://robertsspaceindustries.com/en/account/buy-back-pledges?page=${pageId}&product-type=upgrade&pagesize=1`
              });
              remainingToOpen--;
            });
          }
        });
      }
    });

    // 设置找到和未找到的CCU
    setCcusToOpen({ found: foundCcus, notFound: notFoundCcus });
    setIsGoShippingDialogOpen(true);
  };

  // 处理确认打开页面
  const handleConfirmOpenPages = () => {
    ccusToOpen.found.forEach(ccu => {
      window.open(ccu.url, '_blank');
    });
    setIsGoShippingDialogOpen(false);
  };

  // if (isLoadingOrder) {
  //   return (
  //     <Box sx={{ p: 3 }}>
  //       <Typography><FormattedMessage id="common.loading" defaultMessage="Loading..." /></Typography>
  //     </Box>
  //   );
  // }

  if (error || !order) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          <FormattedMessage id="orders.notFound" defaultMessage="Order not found or error loading order" />
        </Alert>
        <Button startIcon={<ArrowBack />} onClick={handleBack} sx={{ mt: 2 }}>
          <FormattedMessage id="common.back" defaultMessage="返回订单列表" />
        </Button>
      </Box>
    );
  }

  const total = calculateTotal(order.items);
  const availableItems = order.items.reduce((total, item) => total + (item.quantity - (item.cancelledQuantity || 0)), 0);
  const totalItems = order.items.reduce((total, item) => total + item.quantity, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Button startIcon={<ArrowBack />} onClick={handleBack} sx={{ mb: 3 }}>
        <FormattedMessage id="common.back" defaultMessage="返回订单列表" />
      </Button>

      {/* <Paper elevation={2} sx={{ p: 4, mb: 3 }}>
        <Stepper activeStep={currentStep} alternativeLabel>
          {orderStatusSteps.map((step, index) => (
            <Step key={step.status} completed={index <= currentStep && currentStep >= 0}>
              <StepLabel>{step.label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper> */}

      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center">
            <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
              #{order.id}
            </Typography>
            <Chip
              label={<FormattedMessage id={`orders.status.${order.status}`} defaultMessage={order.status} />}
              color={(statusColor[order.status] as "success" | "warning" | "error" | "default" | "info") || 'default'}
              size="small"
              sx={{ ml: 2 }}
            />
          </div>
          <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
            <FormattedMessage id="orders.total" defaultMessage="总价" /> ${total.toFixed(2)}
          </Typography>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Typography variant="body2" color="textSecondary">
              <FormattedMessage id="orders.createTime" defaultMessage="创建时间" />
            </Typography>
            <Typography variant="body1">
              {new Date(order.createdAt).toLocaleString()}
            </Typography>
          </div>

          <div className="text-right">
            <Typography variant="body2" color="textSecondary">
              <FormattedMessage id="orders.itemsAvailability" defaultMessage="商品数量" />
            </Typography>
            <Typography variant="body1">
              {availableItems} / {totalItems} <FormattedMessage id="orders.available" defaultMessage="有效" />
            </Typography>
          </div>

          <div>
            <Typography variant="body2" color="textSecondary">
              <FormattedMessage id="orders.updateTime" defaultMessage="更新时间" />
            </Typography>
            <Typography variant="body1">
              {new Date(order.updatedAt).toLocaleString()}
            </Typography>
          </div>

          {order.customerEmail && (
            <div className="text-right">
              <Typography variant="body2" color="textSecondary">
                <FormattedMessage id="orders.customerEmail" defaultMessage="客户邮箱" />
              </Typography>
              <div className="flex items-center justify-end">
                <Typography variant="body1" sx={{ mr: 1 }}>
                  {order.customerEmail}
                </Typography>
                <Tooltip title={<FormattedMessage id="common.copy" defaultMessage="复制" />}>
                  <IconButton size="small" onClick={handleCopyEmail}>
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          )}
        </div>
      </Paper>

      <Paper elevation={2} sx={{ p: 2 }}>
        <div className="flex justify-between items-center mb-4">
          <Typography variant="h6" gutterBottom>
            <FormattedMessage id="orders.itemsList" defaultMessage="订单商品" />
          </Typography>
          <Typography variant="body2">
            <FormattedMessage id="orders.itemCount" defaultMessage="{count} items" values={{ count: order.items.length }} />
          </Typography>
        </div>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><FormattedMessage id="orders.image" defaultMessage="图片" /></TableCell>
                <TableCell><FormattedMessage id="orders.item" defaultMessage="名称" /></TableCell>
                <TableCell align="center"><FormattedMessage id="orders.quantity" defaultMessage="数量" /></TableCell>
                <TableCell align="center"><FormattedMessage id="orders.price" defaultMessage="单价" /></TableCell>
                <TableCell align="center"><FormattedMessage id="orders.subtotal" defaultMessage="总价" /></TableCell>
                <TableCell align="center"><FormattedMessage id="orders.status" defaultMessage="状态" /></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {order.items.map(item => {
                const effectiveQuantity = item.quantity - (item.cancelledQuantity || 0);
                return (
                  <TableRow key={item.id} hover>
                    <TableCell width="120px">
                      <div className="w-24 h-24 bg-gray-200 flex items-center justify-center">No image</div>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{item.marketItem.name}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {item.marketItem.skuId}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      {item.shipped ? (
                        <Typography color="success">{effectiveQuantity}</Typography>
                      ) : (
                        effectiveQuantity
                      )}
                    </TableCell>
                    <TableCell align="center">${item.price.toFixed(2)}</TableCell>
                    <TableCell align="center">${(effectiveQuantity * item.price).toFixed(2)}</TableCell>
                    <TableCell align="center">
                      {item.shipped ? (
                        <Chip
                          label={<FormattedMessage id="orders.shipped" defaultMessage="Shipped" />}
                          color="success"
                          size="small"
                        />
                      ) : (
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          disabled={isLoading}
                          onClick={() => handleOpenShippingDialog(item)}
                        >
                          <FormattedMessage id="orders.ship" defaultMessage="Ship" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <div className="flex justify-end mt-4 gap-4">
        <Crawler ships={ships} />
        <Button 
          variant="outlined" 
          color="primary" 
          onClick={handleGoShippingClick}
        >
          <FormattedMessage id="orders.goShipping" defaultMessage="Go Shipping" />
        </Button>
      </div>

      {/* 发货确认对话框 */}
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
          {currentItem && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1">{currentItem.marketItem.name}</Typography>
              <Typography variant="body2" color="textSecondary">
                <FormattedMessage
                  id="orders.quantityPrice"
                  defaultMessage="Quantity: {quantity} - Price: ${price}"
                  values={{
                    quantity: currentItem.quantity - (currentItem.cancelledQuantity || 0),
                    price: currentItem.price.toFixed(2)
                  }}
                />
              </Typography>
            </Box>
          )}
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

      {/* Go Shipping确认对话框 */}
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
                  <ListItem key={index}>
                    <ListItemText 
                      primary={ccu.name} 
                      secondary={
                        ccu.type === 'buyback' 
                          ? intl.formatMessage({ id: 'orders.buybackCcu', defaultMessage: 'Buyback CCU' })
                          : intl.formatMessage({ id: 'orders.normalCcu', defaultMessage: 'Normal CCU' })
                      } 
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
                  <ListItem key={index}>
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

      {/* 消息通知 */}
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