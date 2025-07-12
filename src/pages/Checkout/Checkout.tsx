import { useLocation, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { CartItem, ListingItem, OrderStatus, Ship } from "../../types";
import { useSelector } from "react-redux";
import { RootState } from "../../store";
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { ChevronsRight } from 'lucide-react';

// 订单接口定义
interface Order {
  id: number;
  userId: number;
  price: number;
  status: OrderStatus;
  items: string;
  createdAt: string;
  updatedAt: string;
  sessionId: string;
}

interface OrderItem {
  skuId: string;
  quantity: number;
}

export default function Checkout() {
  const location = useLocation();
  const locationState = location.state as { cart?: CartItem[], pendingOrder?: Order, ships?: Ship[] };
  const { cart: cartFromState, pendingOrder, ships } = locationState || {};
  const [cart, setCart] = useState<CartItem[]>(cartFromState || []);
  // const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [listingItems, setListingItems] = useState<ListingItem[]>([]);
  const { user } = useSelector((state: RootState) => state.user);
  const navigate = useNavigate();
  const intl = useIntl();
  const [loading, setLoading] = useState(false);
  // const [loadingOrder, setLoadingOrder] = useState(!!pendingOrderId);
  const [error, setError] = useState<string | null>(null);
  const [openConfirmDialog, setOpenConfirmDialog] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);

  useEffect(() => {
    if (pendingOrder) {
      fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/list`)
        .then(response => response.json())
        .then(data => setListingItems(data));
    }
  }, [pendingOrder]);

  useEffect(() => {
    if (pendingOrder && ships && listingItems) {
      const orderItems = JSON.parse(pendingOrder.items) as OrderItem[];
      console.log(orderItems);
      const orderItemsWithShips = orderItems.map((item: OrderItem) => {
        const listingItem = listingItems.find((listingItem: ListingItem) => listingItem.skuId === item.skuId)
        if (!listingItem) return null;

        const itemData = JSON.parse(listingItem.item) as { type: string, from?: number, to?: number };
        if (!itemData.from || !itemData.to) return null;

        const fromShip = ships.find((ship: Ship) => ship.id === itemData.from);
        const toShip = ships.find((ship: Ship) => ship.id === itemData.to);

        return { ...item, listingItem, fromShip, toShip };
      });

      setCart(orderItemsWithShips.map(item => {
        if (!item) return null;

        return {
          resource: {
            id: item.listingItem.skuId,
            name: item.listingItem.name,
            title: item.listingItem.name,
            subtitle: JSON.stringify({
              type: "CCU",
              from: item.fromShip?.name,
              to: item.toShip?.name
            }),
            excerpt: item.listingItem.name,
            type: "CCU",
            media: {
              thumbnail: {
                storeSmall: item.fromShip?.medias.productThumbMediumAndSmall || ''
              },
              list: [
                { slideshow: item.fromShip?.medias.productThumbMediumAndSmall || '' },
                { slideshow: item.toShip?.medias.productThumbMediumAndSmall || '' }
              ]
            },
            nativePrice: {
              amount: item.listingItem.price * 100,
              discounted: 0,
              taxDescription: []
            },
            stock: {
              available: true,
              level: 'In Stock'
            },
            isPackage: false
          }
        }
      }).filter(item => item !== null));
    }
  }, [pendingOrder, ships, listingItems]);

  // 计算总价
  const totalPrice = cart?.reduce((sum, item) => sum + (item.resource.nativePrice.amount / 100), 0) || 0;

  // 打开协议确认弹窗
  const handleOpenConfirmDialog = () => {
    setOpenConfirmDialog(true);
  };

  // 关闭协议确认弹窗
  const handleCloseConfirmDialog = () => {
    setOpenConfirmDialog(false);
  };

  // 处理协议确认状态变更
  const handleAgreementChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAgreementChecked(event.target.checked);
  };

  // 处理订单确认
  const handleConfirmOrder = () => {
    handleOpenConfirmDialog();
  };

  // 处理订单提交
  const handleSubmitOrder = () => {
    if ((!cart || cart.length === 0) && !pendingOrder) return;

    setLoading(true);
    setError(null);
    handleCloseConfirmDialog();

    // 如果是处理待支付订单
    if (pendingOrder) {
      fetch(
        `${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/resume`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user?.token}`
          },
          body: JSON.stringify({
            sessionId: pendingOrder.sessionId
          })
        })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.json();
        })
        .then((json) => window.location.href = json.url)
        .catch((err) => {
          console.error("订单处理错误:", err);
          setError(intl.formatMessage({
            id: 'checkout.error',
            defaultMessage: 'An error occurred while processing your order. Please try again.'
          }));
          setLoading(false);
        });
      return;
    }

    // 创建新订单
    fetch(
      `${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders`,
      {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((item: CartItem) => ({
            skuId: item.resource.id,
            quantity: 1
          })),
          userId: user?.id
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`
        }
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((json) => window.location.href = json.url)
      .catch((err) => {
        console.error("订单处理错误:", err);
        setError(intl.formatMessage({
          id: 'checkout.error',
          defaultMessage: 'An error occurred while processing your order. Please try again.'
        }));
        setLoading(false);
      });
  };

  // 返回购物页面
  const handleBackToMarket = () => {
    navigate('/market');
  };

  // 返回订单页面
  const handleBackToOrders = () => {
    navigate('/orders');
  };

  if ((!cart || cart.length === 0) && !pendingOrder) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="80vh" gap={2}>
        <Typography variant="h5">
          <FormattedMessage id="checkout.emptyCart" defaultMessage="Your cart is empty" />
        </Typography>
        <Button variant="contained" color="primary" onClick={handleBackToMarket}>
          <FormattedMessage id="checkout.backToMarket" defaultMessage="Back to Market" />
        </Button>
      </Box>
    );
  }

  return (
    <Box className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 px-8 py-4 overflow-auto max-w-[1280px] mx-auto'>
      <Typography
        variant="h5"
        component="h1"
        align="left"
        gutterBottom
        sx={{ mb: 4, fontWeight: 500 }}
      >
        {pendingOrder ? (
          <FormattedMessage id="checkout.resumePayment" defaultMessage="Resume Payment" />
        ) : (
          <FormattedMessage id="checkout.title" defaultMessage="Checkout" />
        )}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
        {/* 左侧 - 商品列表 */}
        <Box sx={{ flex: '1 1 65%' }}>
          <Paper variant="outlined" sx={{ mb: 4, overflow: 'hidden' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell width="140px" sx={{ fontWeight: 'bold' }}>
                      <FormattedMessage id="checkout.image" defaultMessage="Image" />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>
                      <FormattedMessage id="checkout.product" defaultMessage="Product" />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      <FormattedMessage id="checkout.price" defaultMessage="Price" />
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cart.map((item) => {
                    const jsonData = JSON.parse(item.resource.subtitle) as { type: string, from?: string, to?: string };

                    // 检查是否为CCU类型
                    const isCCU = jsonData.type === 'CCU';

                    // 获取from和to的图片URL
                    const fromImageUrl = isCCU && item.resource.media?.list && item.resource.media.list[0]?.slideshow
                      ? item.resource.media.list[0].slideshow
                      : '';

                    const toImageUrl = isCCU && item.resource.media?.list && item.resource.media.list[1]?.slideshow
                      ? item.resource.media.list[1].slideshow
                      : '';

                    return (
                      <TableRow key={item.resource.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell>
                          {isCCU ? (
                            <Box sx={{ position: 'relative', width: 140, height: 80, overflow: 'hidden' }}>
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
                                src={fromImageUrl || 'https://via.placeholder.com/120x65?text=No+Image'}
                                alt={`From: ${jsonData.from}`}
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
                                  boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.2)'
                                }}
                                src={toImageUrl || 'https://via.placeholder.com/120x65?text=No+Image'}
                                alt={`To: ${jsonData.to}`}
                              />
                              <div className='absolute top-[50%] left-[35%] -translate-y-[50%] -translate-x-[50%] text-white'>
                                <ChevronsRight className='w-6 h-6' />
                              </div>
                            </Box>
                          ) : (
                            <Box
                              component="img"
                              sx={{ width: 120, height: 65, objectFit: 'cover' }}
                              src={item.resource.media?.thumbnail?.storeSmall || 'https://via.placeholder.com/120x65?text=No+Image'}
                              alt={item.resource.name}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body1" sx={{ fontWeight: 500 }}>{item.resource.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            <FormattedMessage id="checkout.quantity" defaultMessage="Quantity" />: 1
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col gap-2">
                            US${(item.resource.nativePrice.amount / 100).toFixed(2)}
                            {item.resource.nativePrice.discounted > 0 && (
                              <span className="text-gray-500 line-through">
                                US${((item.resource.nativePrice.discounted + item.resource.nativePrice.amount) / 100).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>

        {/* 右侧 - 订单摘要 */}
        <Box sx={{ flex: '1 1 35%', maxWidth: { md: '350px' } }}>
          <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
              <FormattedMessage id="checkout.summary" defaultMessage="Summary" />
            </Typography>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="body1">
                <FormattedMessage id="checkout.subtotal" defaultMessage="Subtotal" />
              </Typography>
              <Typography variant="body1" fontWeight="500">
                US${totalPrice.toFixed(2)}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="body1">
                <FormattedMessage id="checkout.taxes" defaultMessage="Taxes" />
              </Typography>
              <Typography variant="body1" fontWeight="500">
                US$0.00
              </Typography>
            </Box>

            <Box sx={{ borderTop: '1px solid #e0e0e0', pt: 2, mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="body1" fontWeight="700">
                  <FormattedMessage id="checkout.total" defaultMessage="Total" />
                </Typography>
                <Typography variant="body1" fontWeight="700" color="primary">
                  US${totalPrice.toFixed(2)}
                </Typography>
              </Box>
            </Box>

            <Button
              variant="contained"
              color="primary"
              fullWidth
              sx={{ mt: 2, textTransform: 'uppercase' }}
              onClick={handleConfirmOrder}
              disabled={loading}
              startIcon={loading && <CircularProgress size={20} color="inherit" />}
            >
              {loading ? (
                <FormattedMessage id="checkout.processing" defaultMessage="Processing..." />
              ) : (
                <FormattedMessage
                  id={pendingOrder ? "checkout.resumePayment" : "checkout.confirmOrder"}
                  defaultMessage={pendingOrder ? "Resume Payment" : "Confirm and Pay"}
                />
              )}
            </Button>

            <Button
              variant="outlined"
              fullWidth
              onClick={pendingOrder ? handleBackToOrders : handleBackToMarket}
              disabled={loading}
              sx={{ mt: 2, textTransform: 'uppercase' }}
            >
              <FormattedMessage
                id={pendingOrder ? "checkout.backToOrders" : "checkout.backToMarket"}
                defaultMessage={pendingOrder ? "Back to Orders" : "Back to Market"}
              />
            </Button>
          </Paper>
        </Box>
      </Box>

      {/* 协议确认对话框 */}
      <Dialog
        open={openConfirmDialog}
        onClose={handleCloseConfirmDialog}
        aria-labelledby="agreement-dialog-title"
      >
        <DialogTitle id="agreement-dialog-title">
          <FormattedMessage id="checkout.agreementTitle" defaultMessage="Terms and Conditions" />
        </DialogTitle>
        <DialogContent>
          <div className="flex flex-col gap-2 text-[#555]">
            {
              intl.formatMessage({ id: 'checkout.agreementText', defaultMessage: 'By proceeding with this purchase, you agree to our Terms of Service and Privacy Policy. All sales are final and non-refundable unless otherwise stated in our Refund Policy;In case of special reasons such as insufficient stock, we may contact you and you can choose to partially or fully refund the order;The gift will be sent to the account email you reserved' }).split(';').map((line, index) => (<div key={index}>{line}.</div>))
            }
          </div>
          <FormControlLabel
            control={
              <Checkbox
                checked={agreementChecked}
                onChange={handleAgreementChange}
                color="primary"
              />
            }
            sx={{
              mt: 2
            }}
            label={
              <FormattedMessage
                id="checkout.agreementCheckbox"
                defaultMessage="I have read and agree to all the Terms and Conditions listed above, and understand that all gifts cannot be refunded once sent"
              />
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseConfirmDialog} color="inherit">
            <FormattedMessage id="checkout.cancel" defaultMessage="Cancel" />
          </Button>
          <Button
            onClick={handleSubmitOrder}
            color="primary"
            disabled={!agreementChecked}
            variant="contained"
          >
            <FormattedMessage id="checkout.proceed" defaultMessage="Proceed to Payment" />
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}