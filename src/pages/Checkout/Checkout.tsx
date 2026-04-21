// 导入必要的依赖
import { useLocation, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { MarketCartItem, Order as MarketOrder, Ship } from "@/types";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
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
  FormControlLabel,
  Switch,
  Collapse
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { ChevronsRight, ChevronDown, AlertTriangle, LogIn, Mail } from 'lucide-react';
import { useUserSession } from "@/hooks";
import { useCartStore } from "@/hooks/useCartStore";
import {
  buildMarketCartItem,
  buildMarketCartItemFromResource,
  getMarketItemVisual,
  MARKET_ITEM_PLACEHOLDER,
} from '@/components/marketItemDisplay';
import OrderPaymentDeadline from '@/components/OrderPaymentDeadline';

const CHECKOUT_PENDING_REQUEST_STORAGE_PREFIX = 'checkout:pending-request';
const CHECKOUT_PENDING_REQUEST_TTL_MS = 5 * 60 * 1000;

type PendingCheckoutRequestCache = {
  createdAt: number;
  fingerprint: string;
  key: string;
};

function buildCheckoutFingerprint(
  items: MarketCartItem[],
  options: {
    proceedWhenOutOfStock: boolean;
  },
) {
  return JSON.stringify({
    items: items
      .map((item) => ({
        skuId: item.skuId,
        quantity: item.quantity,
      }))
      .sort((left, right) => {
        const skuComparison = left.skuId.localeCompare(right.skuId);
        if (skuComparison !== 0) {
          return skuComparison;
        }

        return left.quantity - right.quantity;
      }),
    options: {
      proceedWhenOutOfStock: Boolean(options.proceedWhenOutOfStock),
    },
  });
}

function getCheckoutPendingRequestStorageKey(userId?: string) {
  return `${CHECKOUT_PENDING_REQUEST_STORAGE_PREFIX}:${userId || 'anonymous'}`;
}

function clearPendingCheckoutRequest(userId?: string) {
  window.sessionStorage.removeItem(getCheckoutPendingRequestStorageKey(userId));
}

function readPendingCheckoutRequest(userId?: string): PendingCheckoutRequestCache | null {
  const storageKey = getCheckoutPendingRequestStorageKey(userId);
  const storedValue = window.sessionStorage.getItem(storageKey);

  if (!storedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedValue) as Partial<PendingCheckoutRequestCache>;
    if (
      typeof parsed.key !== 'string'
      || parsed.key.length === 0
      || typeof parsed.fingerprint !== 'string'
      || parsed.fingerprint.length === 0
      || typeof parsed.createdAt !== 'number'
      || !Number.isFinite(parsed.createdAt)
    ) {
      clearPendingCheckoutRequest(userId);
      return null;
    }

    if ((Date.now() - parsed.createdAt) > CHECKOUT_PENDING_REQUEST_TTL_MS) {
      clearPendingCheckoutRequest(userId);
      return null;
    }

    return {
      createdAt: parsed.createdAt,
      fingerprint: parsed.fingerprint,
      key: parsed.key,
    };
  } catch (error) {
    console.warn('Failed to parse checkout pending request cache:', error);
    clearPendingCheckoutRequest(userId);
    return null;
  }
}

function getOrCreateCheckoutPendingRequestKey(userId: string | undefined, fingerprint: string) {
  const existingRequest = readPendingCheckoutRequest(userId);
  if (existingRequest && existingRequest.fingerprint === fingerprint) {
    return existingRequest.key;
  }

  const nextRequest: PendingCheckoutRequestCache = {
    createdAt: Date.now(),
    fingerprint,
    key: crypto.randomUUID(),
  };

  window.sessionStorage.setItem(
    getCheckoutPendingRequestStorageKey(userId),
    JSON.stringify(nextRequest),
  );

  return nextRequest.key;
}

export default function Checkout() {
  const location = useLocation();
  const locationState = location.state as { pendingOrder?: MarketOrder, ships?: Ship[] };
  // cartFromState 来自商城的Redux购物车，实际类型是CartItem[]
  // 注意：系统中有两种不同的购物车实现：
  // 1. ResourcesTable使用的CartItem（本地状态，不使用Redux）
  // 2. 商城使用的商城购物车，使用Redux，但也是CartItem类型
  // 结账页面需要将CartItem转换为MarketCartItem
  const { cart: cartFromState } = useCartStore();
  const { pendingOrder, ships } = locationState || {};
  // 使用MarketCartItem类型来管理结账页面的购物车数据
  const [cart, setCart] = useState<MarketCartItem[]>([]);
  const { user } = useSelector((state: RootState) => state.user);
  const navigate = useNavigate();
  const intl = useIntl();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openConfirmDialog, setOpenConfirmDialog] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const { data: userSession } = useUserSession();
  
  // 登录和邮箱验证对话框状态
  const [openLoginDialog, setOpenLoginDialog] = useState(false);
  const [openVerifyEmailDialog, setOpenVerifyEmailDialog] = useState(false);

  useEffect(() => {
    if (pendingOrder?.items?.length) {
      clearPendingCheckoutRequest(user?.id);
      setCart(
        pendingOrder.items.map((item) =>
          buildMarketCartItem(
            {
              ...item.marketItem,
              price: item.price,
            },
            item.quantity,
            ships,
          )
        )
      );
      return;
    }

    if (cartFromState?.length) {
      setCart(cartFromState.map((item) => buildMarketCartItemFromResource(item.resource, item.quantity || 1)));
      return;
    }

    setCart([]);
  }, [cartFromState, pendingOrder, ships, user?.id]);

  const [options, setOptions] = useState<{
    proceedWhenOutOfStock: boolean;
  }>({
    proceedWhenOutOfStock: false
  });
  
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);

  // 处理选项更改
  const handleOptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setOptions({
      ...options,
      [event.target.name]: event.target.checked
    });
  };

  // 切换高级设置显示状态
  const toggleAdvancedSettings = () => {
    setAdvancedSettingsOpen(!advancedSettingsOpen);
  };

  const getItemPrice = (item: MarketCartItem) => {
    return item.price || 0;
  };

  // 计算总价 - 更新为使用MarketCartItem，考虑数量
  const subtotal = cart.reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0) || 0;
  // 判断是否免除服务费
  const isServiceFeeFree = subtotal >= 20;
  const serviceFee = isServiceFeeFree ? 0 : 0.99;
  const totalPrice = subtotal + serviceFee;

  // 打开协议确认弹窗
  const handleOpenConfirmDialog = () => {
    // 检查用户是否已登录
    if (!userSession?.user) {
      setOpenLoginDialog(true);
      return;
    }
    
    // 检查用户是否已验证邮箱
    if (!userSession.user?.emailVerified) {
      setOpenVerifyEmailDialog(true);
      return;
    }
    
    setOpenConfirmDialog(true);
  };

  // 关闭协议确认弹窗
  const handleCloseConfirmDialog = () => {
    setOpenConfirmDialog(false);
  };
  
  // 关闭登录弹窗
  const handleCloseLoginDialog = () => {
    setOpenLoginDialog(false);
  };
  
  // 关闭邮箱验证弹窗
  const handleCloseVerifyEmailDialog = () => {
    setOpenVerifyEmailDialog(false);
  };
  
  // 导航到登录页面
  const handleGoToLogin = () => {
    navigate('/login', { state: { from: location.pathname } });
  };
  
  // 导航到个人资料页面进行邮箱验证
  const handleGoToVerifyEmail = () => {
    navigate('/app-settings');
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
        .then(async (response) => {
          const json = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(json?.error || `HTTP error! Status: ${response.status}`);
          }
          return json;
        })
        .then((json) => window.location.href = json.url)
        .catch((err) => {
          console.error("订单处理错误:", err);
          setError(err instanceof Error ? err.message : intl.formatMessage({
            id: 'checkout.error',
            defaultMessage: 'An error occurred while processing your order. Please try again.'
          }));
          setLoading(false);
        });
      return;
    }

    const idempotencyKey = getOrCreateCheckoutPendingRequestKey(
      user?.id,
      buildCheckoutFingerprint(cart, options),
    );

    // 创建新订单
    fetch(
      `${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders`,
      {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map(item => ({
            skuId: item.skuId,
            quantity: item.quantity
          })),
          options,
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
          'Idempotency-Key': idempotencyKey,
        }
      })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        clearPendingCheckoutRequest(user?.id);
        if (!response.ok) {
          throw new Error(json?.error || `HTTP error! Status: ${response.status}`);
        }
        return json;
      })
      .then((json) => {
        window.location.href = json.url;
      })
      .catch((err) => {
        console.error("订单处理错误:", err);
        setError(err instanceof Error ? err.message : intl.formatMessage({
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

  const getItemMedia = (item: MarketCartItem) => {
    const visual = getMarketItemVisual({
      skuId: item.skuId,
      name: item.name || item.skuId,
      itemType: item.itemType,
      fromShipId: item.fromShipId,
      toShipId: item.toShipId,
      shipId: item.shipId,
      fromShipName: item.fromShipName,
      toShipName: item.toShipName,
      shipName: item.shipName,
      packageKind: item.packageKind,
      insuranceType: item.insuranceType,
      imageUrl: item.imageUrl,
      fromImageUrl: item.fromImageUrl,
      toImageUrl: item.toImageUrl,
    }, ships);

    return {
      thumbnail: item.media?.thumbnail?.storeSmall || visual.thumbnail || MARKET_ITEM_PLACEHOLDER,
      fromImage: visual.fromImage,
      toImage: visual.toImage,
      shipName: visual.shipName,
      fromShipName: visual.fromShipName,
      toShipName: visual.toShipName,
    };
  };

  const getItemName = (item: MarketCartItem) => {
    return item.name || item.skuId;
  };

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
        <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
          {error}
        </Alert>
      )}

      {pendingOrder && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600 }}>
            <FormattedMessage
              id="checkout.pendingOrderNotice"
              defaultMessage="This order is awaiting payment and will be canceled automatically after the payment window closes."
            />
          </Typography>
          <OrderPaymentDeadline
            status={pendingOrder.status}
            expiresAt={pendingOrder.expiresAt}
          />
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
                    const isCCU = item.itemType === 'ccu';
                    const isPackage = item.itemType === 'package';
                    const media = getItemMedia(item);
                    const name = getItemName(item);
                    const price = getItemPrice(item);
                    const fromShipName = media.fromShipName || item.fromShipName || '';
                    const toShipName = media.toShipName || item.toShipName || '';
                    const shipName = media.shipName || item.shipName || '';
                    
                    return (
                      <TableRow key={item.skuId} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell>
                          {isCCU ? (
                            <Box sx={{ position: 'relative', width: 220, height: 120, overflow: 'hidden' }}>
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
                                src={media.fromImage || MARKET_ITEM_PLACEHOLDER}
                                alt={`From: ${fromShipName || name}`}
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
                                src={media.toImage || MARKET_ITEM_PLACEHOLDER}
                                alt={`To: ${toShipName || name}`}
                              />
                              <div className='absolute top-[50%] left-[35%] -translate-y-[50%] -translate-x-[50%] text-white'>
                                <ChevronsRight className='w-6 h-6' />
                              </div>
                              {/* <div className='absolute bottom-0 left-0 right-0 p-1 bg-black/50 flex items-center justify-center'>
                                <span className='text-white text-xs'>{name}</span>
                              </div> */}
                            </Box>
                          ) : (
                            <Box
                              component="img"
                              sx={{ width: "100%", height: "100%", objectFit: 'cover' }}
                              src={media.thumbnail || MARKET_ITEM_PLACEHOLDER}
                              alt={name}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body1" sx={{ fontWeight: 500 }}>{name}</Typography>
                          {isCCU && fromShipName && toShipName && (
                            <Typography variant="body2" color="text.secondary">
                              {fromShipName} → {toShipName}
                            </Typography>
                          )}
                          {!isCCU && isPackage && (
                            <>
                              {shipName && (
                                <Typography variant="body2" color="text.secondary">
                                  {shipName}
                                </Typography>
                              )}
                              {(item.packageKind || item.insuranceType) && (
                                <Typography variant="body2" color="text.secondary">
                                  {[item.packageKind, item.insuranceType].filter(Boolean).join(' · ')}
                                </Typography>
                              )}
                            </>
                          )}
                          {/* {!isCCU && !isPackage && (
                            <>
                              {item.description && (
                                <Typography variant="body2" color="text.secondary">
                                  {item.description}
                                </Typography>
                              )}
                              {item.externalRef && (
                                <Typography variant="body2" color="text.secondary">
                                  {item.externalRef}
                                </Typography>
                              )}
                            </>
                          )} */}
                          <Typography variant="body2" color="text.secondary">
                            <span>
                              <span><FormattedMessage id="checkout.quantity" defaultMessage="Quantity" /></span>
                              <span>:</span>
                            </span>
                            <span> {item.quantity}</span>
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col gap-2">
                            US${price.toFixed(2)}
                            {/* 使用更安全的方式检查折扣价格 */}
                            {(item.discounted !== undefined && item.discounted > 0) && (
                              <span className="text-gray-500 line-through">
                                US${(item.discounted + price).toFixed(2)}
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
          <Alert severity="info" sx={{ mb: 2, textAlign: 'left', fontSize: '14px' }}>
            <FormattedMessage id="checkout.limitedTimeOffer" defaultMessage="Limited time offer:" />
            <br />
            <FormattedMessage id="checkout.feeWaivedMessage" defaultMessage="Waive software service fee for orders over $20" />
          </Alert>
          <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
              <FormattedMessage id="checkout.summary" defaultMessage="Summary" />
            </Typography>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="body1">
                <FormattedMessage id="checkout.subtotal" defaultMessage="Subtotal" />
              </Typography>
              <Typography variant="body1" fontWeight="500">
                US${subtotal.toFixed(2)}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                <FormattedMessage id="checkout.serviceFee" defaultMessage="Software Service Fee" />
              </Typography>
              <Typography variant="body2" fontWeight="500">
                {isServiceFeeFree && <span className="text-green-600">(waived)</span>}
                {isServiceFeeFree ? (
                  <span style={{ textDecoration: 'line-through', marginLeft: '8px' }}>US$0.99</span>
                ) : (
                  <span>US$0.99</span>
                )}
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  <span>*</span>
                  <span><FormattedMessage id="checkout.taxes" defaultMessage="Taxes not included" /></span>
                </Typography>
              </Box>
            </Box>
            
            {/* 高级设置区域 */}
            <Box sx={{ mt: 2, mb: 2 }}>
              <Button 
                fullWidth
                variant="outlined" 
                onClick={toggleAdvancedSettings}
                endIcon={<ChevronDown size={16} style={{ transform: advancedSettingsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />}
                sx={{ 
                  justifyContent: 'space-between', 
                  color: 'primary.main', 
                  borderColor: '#e0e0e0',
                  textTransform: 'none',
                  py: 1.5
                }}
              >
                <Typography variant="body2" color="primary">
                  <FormattedMessage id="checkout.advancedSettings" defaultMessage="Advanced Settings" />
                </Typography>
              </Button>
              
              <Collapse in={advancedSettingsOpen}>
                <Box sx={{ pt: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Switch
                      checked={options.proceedWhenOutOfStock}
                      onChange={handleOptionChange}
                      name="proceedWhenOutOfStock"
                      color="primary"
                      size="small"
                    />
                    <Typography variant="body2" sx={{ flex: 1, textAlign: 'left' }}>
                      <FormattedMessage 
                        id="checkout.proceedWhenOutOfStock" 
                        defaultMessage="Continue with available items if some are out of stock" 
                      />
                    </Typography>
                  </Box>
                  
                  {options.proceedWhenOutOfStock && (
                    <Alert 
                      severity="warning" 
                      sx={{ mt: 2, mb: 2, textAlign: 'left' }}
                      icon={<AlertTriangle size={18} />}
                    >
                      <FormattedMessage 
                        id="checkout.serviceFeeWarning" 
                        defaultMessage="Note: If your final payment is less than $20, a software service fee will still be applied." 
                      />
                    </Alert>
                  )}
                </Box>
              </Collapse>
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
      
      {/* 登录提示对话框 */}
      <Dialog
        open={openLoginDialog}
        onClose={handleCloseLoginDialog}
        aria-labelledby="login-dialog-title"
      >
        <DialogTitle id="login-dialog-title">
          <FormattedMessage id="checkout.loginRequired" defaultMessage="Login Required" />
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <LogIn size={24} />
            <Typography>
              <FormattedMessage 
                id="checkout.loginMessage" 
                defaultMessage="You need to be logged in to proceed with your purchase." 
              />
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseLoginDialog} color="inherit">
            <FormattedMessage id="checkout.cancel" defaultMessage="Cancel" />
          </Button>
          <Button
            onClick={handleGoToLogin}
            color="primary"
            variant="contained"
            startIcon={<LogIn size={16} />}
          >
            <FormattedMessage id="checkout.goToLogin" defaultMessage="Go to Login" />
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* 邮箱验证提示对话框 */}
      <Dialog
        open={openVerifyEmailDialog}
        onClose={handleCloseVerifyEmailDialog}
        aria-labelledby="verify-email-dialog-title"
      >
        <DialogTitle id="verify-email-dialog-title">
          <FormattedMessage id="checkout.verifyEmailRequired" defaultMessage="Email Verification Required" />
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Mail size={24} />
            <Typography>
              <FormattedMessage 
                id="checkout.verifyEmailMessage" 
                defaultMessage="You need to verify your email address before making a purchase. Please check your email for a verification link or go to your profile to request a new verification email." 
              />
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseVerifyEmailDialog} color="inherit">
            <FormattedMessage id="checkout.cancel" defaultMessage="Cancel" />
          </Button>
          <Button
            onClick={handleGoToVerifyEmail}
            color="primary"
            variant="contained"
            startIcon={<Mail size={16} />}
          >
            <FormattedMessage id="checkout.goToProfile" defaultMessage="Go to Settings" />
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
