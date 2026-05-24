// 导入必要的依赖
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from "react-router";
import { useState, useEffect, useMemo } from "react";
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
  InputAdornment,
  Link as MuiLink,
  MenuItem,
  TextField,
  Chip,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { ChevronsRight, LogIn, Mail } from 'lucide-react';
import { useAccountMarketItemData, useAuthApi, useMarketCartValidation, useShipsData, useUserSession } from "@/hooks";
import { useCartStore } from "@/hooks/useCartStore";
import { NewUserCouponPreview } from "@/types";
import {
  buildMarketCartItem,
  buildMarketCartItemFromResource,
  getMarketItemVisual,
  MARKET_ITEM_PLACEHOLDER,
} from '@/components/marketItemDisplay';
import {
  formatMarketCcuResourceName,
  formatMarketCreditResourceName,
  formatUsdPrice,
  getMarketPackageKindLabel,
} from '@/pages/Market/marketI18n';
import { getShipDisplayName } from '@/utils/shipDisplay';
import OrderPaymentDeadline from '@/components/OrderPaymentDeadline';
import { getAccountMarketListPath } from '@/utils/marketLinks';
import {
  ACCOUNT_MARKET_COUPON_PERCENT_OFF,
  getMonthlyAccountCouponCode,
} from '@/utils/accountMarketCoupon';

const CHECKOUT_PENDING_REQUEST_STORAGE_PREFIX = 'checkout:pending-request';
const CHECKOUT_PENDING_REQUEST_TTL_MS = 15 * 60 * 1000;
const SOFTWARE_SERVICE_FEE_AMOUNT = 0.99;
const SOFTWARE_SERVICE_FEE_WAIVER_THRESHOLD = 5;
const ACCOUNT_MARKET_SOURCE_KIND = 'account-market';

type PendingCheckoutRequestCache = {
  createdAt: number;
  fingerprint: string;
  key: string;
};

type AccountCouponValidation = {
  valid: boolean;
  code: string;
  percentOff: number;
  subtotal: number;
  discountAmount: number;
};

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function buildCheckoutFingerprint(
  items: MarketCartItem[],
  selectedCouponId?: string | null,
  accountCouponCode?: string | null,
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
    selectedCouponId: typeof selectedCouponId === 'string' ? selectedCouponId.trim() : '',
    accountCouponCode: typeof accountCouponCode === 'string' ? accountCouponCode.trim().toUpperCase() : '',
  });
}

function buildLegacyCheckoutFingerprint(
  items: MarketCartItem[],
  proceedWhenOutOfStock: boolean,
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
      proceedWhenOutOfStock,
    },
  });
}

function isMatchingCheckoutFingerprint(
  existingFingerprint: string,
  items: MarketCartItem[],
  selectedCouponId?: string | null,
  accountCouponCode?: string | null,
) {
  return [
    buildCheckoutFingerprint(items, selectedCouponId, accountCouponCode),
    buildLegacyCheckoutFingerprint(items, false),
    buildLegacyCheckoutFingerprint(items, true),
  ].includes(existingFingerprint);
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

function getOrCreateCheckoutPendingRequestKey(
  userId: string | undefined,
  items: MarketCartItem[],
  selectedCouponId?: string | null,
  accountCouponCode?: string | null,
) {
  const existingRequest = readPendingCheckoutRequest(userId);
  if (existingRequest && isMatchingCheckoutFingerprint(existingRequest.fingerprint, items, selectedCouponId, accountCouponCode)) {
    return existingRequest.key;
  }

  const fingerprint = buildCheckoutFingerprint(items, selectedCouponId, accountCouponCode);

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
  const [searchParams] = useSearchParams();
  const isAccountMarketCheckout = location.pathname.startsWith('/account-market/checkout');
  const accountSkuId = isAccountMarketCheckout ? searchParams.get('skuId')?.trim() || '' : '';
  const locationState = location.state as { pendingOrder?: MarketOrder, ships?: Ship[] };
  // cartFromState 来自商城的Redux购物车，实际类型是CartItem[]
  // 注意：系统中有两种不同的购物车实现：
  // 1. ResourcesTable使用的CartItem（本地状态，不使用Redux）
  // 2. 商城使用的商城购物车，使用Redux，但也是CartItem类型
  // 结账页面需要将CartItem转换为MarketCartItem
  const { cart: cartFromState, removeFromCart } = useCartStore(isAccountMarketCheckout ? 'accountMarket' : 'market');
  const {
    item: accountMarketItem,
    loading: accountMarketItemLoading,
    error: accountMarketItemError,
    notFound: accountMarketItemNotFound,
  } = useAccountMarketItemData(accountSkuId || undefined);
  const { pendingOrder, ships: stateShips } = locationState || {};
  // 使用MarketCartItem类型来管理结账页面的购物车数据
  const [cart, setCart] = useState<MarketCartItem[]>([]);
  const { user } = useSelector((state: RootState) => state.user);
  const navigate = useNavigate();
  const intl = useIntl();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openConfirmDialog, setOpenConfirmDialog] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [selectedCouponId, setSelectedCouponId] = useState('');
  const [accountCouponCode, setAccountCouponCode] = useState('');
  const [accountCouponError, setAccountCouponError] = useState<string | null>(null);
  const [accountCouponValidation, setAccountCouponValidation] = useState<AccountCouponValidation | null>(null);
  const [accountCouponApplying, setAccountCouponApplying] = useState(false);
  const { data: userSession } = useUserSession();
  const { ships: localizedShips } = useShipsData();
  const effectiveShips = stateShips?.length ? stateShips : localizedShips;
  const accountEmail = userSession?.user?.email?.trim() || user?.email?.trim() || '';
  const isAccountMarketCart = cart.some((item) => item.sourceKind === ACCOUNT_MARKET_SOURCE_KIND)
    || pendingOrder?.items?.some((item) => item.marketItem.sourceKind === ACCOUNT_MARKET_SOURCE_KIND);
  const expectedAccountCouponCode = useMemo(() => getMonthlyAccountCouponCode(), []);
  const cartValidation = useMarketCartValidation(cart, { enabled: !pendingOrder && !isAccountMarketCart });
  
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
            effectiveShips,
          )
        )
      );
      return;
    }

    if (isAccountMarketCheckout) {
      if (accountMarketItem) {
        setCart([
          buildMarketCartItem({
            skuId: accountMarketItem.skuId,
            name: accountMarketItem.name,
            itemType: 'package',
            sourceKind: accountMarketItem.sourceKind || ACCOUNT_MARKET_SOURCE_KIND,
            imageUrl: accountMarketItem.imageUrl || accountMarketItem.entries.find((entry) => entry.imageUrl)?.imageUrl || '/imgs/credit.webp',
            description: accountMarketItem.description,
            packageKind: 'bundle',
            price: accountMarketItem.price,
          }, 1, effectiveShips),
        ]);
        return;
      }

      setCart([]);
      return;
    }

    if (cartFromState?.length) {
      setCart(cartFromState.map((item) => buildMarketCartItemFromResource(item.resource, item.quantity || 1)));
      return;
    }

    setCart([]);
  }, [accountMarketItem, cartFromState, effectiveShips, isAccountMarketCheckout, pendingOrder, user?.id]);

  const getItemPrice = (item: MarketCartItem) => {
    return item.price || 0;
  };

  const formatCheckoutPrice = (value: number) => formatUsdPrice(intl.locale, value) || '';

  const checkoutSubmitCart = useMemo(() => {
    if (pendingOrder || isAccountMarketCart || !cartValidation.hasInvalidItems) {
      return cart;
    }

    return cart.filter((item) => cartValidation.itemMap.get(item.skuId)?.valid !== false);
  }, [cart, cartValidation.hasInvalidItems, cartValidation.itemMap, isAccountMarketCart, pendingOrder]);
  // const excludedCartItems = useMemo(() => {
  //   if (pendingOrder || isAccountMarketCart || !cartValidation.hasInvalidItems) {
  //     return [] as MarketCartItem[];
  //   }

  //   return cart.filter((item) => cartValidation.itemMap.get(item.skuId)?.valid === false);
  // }, [cart, cartValidation.hasInvalidItems, cartValidation.itemMap, isAccountMarketCart, pendingOrder]);

  // 计算总价 - 更新为使用MarketCartItem，考虑数量
  const subtotal = checkoutSubmitCart.reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0) || 0;
  const { data: couponPreview } = useAuthApi<NewUserCouponPreview>(
    user?.token && !isAccountMarketCart ? `/api/user/new-user-coupon?subtotal=${encodeURIComponent(String(subtotal))}` : null,
  );
  // 判断是否免除服务费
  const isServiceFeeFree = subtotal >= SOFTWARE_SERVICE_FEE_WAIVER_THRESHOLD;
  const serviceFee = isServiceFeeFree ? 0 : SOFTWARE_SERVICE_FEE_AMOUNT;
  const availableCoupons = useMemo(() => couponPreview?.availableCoupons || [], [couponPreview?.availableCoupons]);
  const selectedCoupon = availableCoupons.find((coupon) => coupon.id === selectedCouponId) || null;
  const normalizedAccountCouponCode = accountCouponCode.trim().toUpperCase();
  const accountCouponApplied = Boolean(
    isAccountMarketCart
    && accountCouponValidation?.valid
    && accountCouponValidation.code === normalizedAccountCouponCode
    && roundCurrency(accountCouponValidation.subtotal) === roundCurrency(subtotal),
  );
  const accountCouponDiscountAmount = accountCouponApplied
    ? accountCouponValidation?.discountAmount || 0
    : 0;
  const effectiveCoupon = isAccountMarketCart ? null : selectedCoupon || null;
  const effectiveDiscountAmount = isAccountMarketCart
    ? accountCouponDiscountAmount
    : effectiveCoupon?.applicableToCurrentCart
    ? (effectiveCoupon.projectedDiscountAmount || 0)
    : 0;
  const discountedSubtotal = Math.max(subtotal - effectiveDiscountAmount, 0);
  const totalPrice = discountedSubtotal + serviceFee;
  const canSubmitCheckout = pendingOrder || isAccountMarketCart || checkoutSubmitCart.length > 0;

  useEffect(() => {
    if (isAccountMarketCart) {
      if (selectedCouponId) {
        setSelectedCouponId('');
      }
      return;
    }

    if (!availableCoupons.length) {
      if (selectedCouponId) {
        setSelectedCouponId('');
      }
      return;
    }

    if (selectedCouponId && availableCoupons.some((coupon) => coupon.id === selectedCouponId)) {
      return;
    }

    const firstApplicableCoupon = availableCoupons.find((coupon) => coupon.applicableToCurrentCart);
    setSelectedCouponId(firstApplicableCoupon?.id || '');
  }, [availableCoupons, isAccountMarketCart, selectedCouponId]);

  useEffect(() => {
    if (!isAccountMarketCart) {
      if (accountCouponCode) {
        setAccountCouponCode('');
      }
      setAccountCouponError(null);
      setAccountCouponValidation(null);
    }
  }, [accountCouponCode, isAccountMarketCart]);

  const handleAccountCouponCodeChange = (value: string) => {
    setAccountCouponCode(value.toUpperCase());
    setAccountCouponError(null);
    setAccountCouponValidation(null);
  };

  const handleApplyAccountCoupon = async () => {
    if (!isAccountMarketCart || pendingOrder) {
      return;
    }

    if (!normalizedAccountCouponCode) {
      setAccountCouponError(intl.formatMessage({
        id: 'checkout.accountCouponRequired',
        defaultMessage: 'Enter a coupon code before applying it.',
      }));
      return;
    }

    if (!user?.token) {
      setAccountCouponError(intl.formatMessage({
        id: 'checkout.accountCouponLoginRequired',
        defaultMessage: 'Sign in before applying this account coupon.',
      }));
      return;
    }

    setAccountCouponApplying(true);
    setAccountCouponError(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/account-coupon/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          code: normalizedAccountCouponCode,
          items: cart.map((item) => ({
            skuId: item.skuId,
            quantity: item.quantity,
          })),
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.valid) {
        throw new Error(typeof payload?.error === 'string'
          ? payload.error
          : intl.formatMessage({
            id: 'checkout.accountCouponInvalid',
            defaultMessage: 'This account coupon could not be applied.',
          }));
      }

      setAccountCouponValidation({
        valid: true,
        code: payload.code || normalizedAccountCouponCode,
        percentOff: payload.percentOff || ACCOUNT_MARKET_COUPON_PERCENT_OFF,
        subtotal: Number(payload.subtotal) || subtotal,
        discountAmount: Number(payload.discountAmount) || 0,
      });
    } catch (error) {
      setAccountCouponValidation(null);
      setAccountCouponError(error instanceof Error
        ? error.message
        : intl.formatMessage({
          id: 'checkout.accountCouponInvalid',
          defaultMessage: 'This account coupon could not be applied.',
        }));
    } finally {
      setAccountCouponApplying(false);
    }
  };

  // 打开协议确认弹窗
  const handleOpenConfirmDialog = () => {
    if (isAccountMarketCart && accountCouponCode.trim() && !accountCouponApplied) {
      setAccountCouponError(intl.formatMessage(
        { id: 'checkout.accountCouponApplyRequired', defaultMessage: 'Press Apply or Enter to validate this coupon before checkout.' },
      ));
      return;
    }

    if (isAccountMarketCheckout && accountMarketItem) {
      const availableStock = Math.max(accountMarketItem.stock - accountMarketItem.lockedStock, 0);
      if (availableStock <= 0) {
        setError(intl.formatMessage({
          id: 'checkout.accountListingUnavailable',
          defaultMessage: 'This account listing is no longer available.',
        }));
        return;
      }
    }

    if (!isAccountMarketCart && cartValidation.hasInvalidItems && checkoutSubmitCart.length === 0) {
      setError(intl.formatMessage({
        id: 'checkout.noValidCartItems',
        defaultMessage: 'No valid cart items remain in this checkout.',
      }));
      return;
    }

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
  
  // 导航到邮箱验证页面
  const handleGoToVerifyEmail = () => {
    navigate('/app-settings?verifyEmail=1');
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
    if ((!checkoutSubmitCart || checkoutSubmitCart.length === 0) && !pendingOrder) return;

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
      checkoutSubmitCart,
      isAccountMarketCart ? null : selectedCouponId || null,
      accountCouponApplied ? normalizedAccountCouponCode : null,
    );

    // 创建新订单
    fetch(
      `${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders`,
      {
        method: 'POST',
          body: JSON.stringify({
            items: checkoutSubmitCart.map(item => ({
              skuId: item.skuId,
              quantity: item.quantity
            })),
          selectedCouponId: isAccountMarketCart ? null : selectedCouponId || null,
          accountCouponCode: accountCouponApplied ? normalizedAccountCouponCode : null,
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
    navigate(isAccountMarketCheckout ? '/account-market' : '/market');
  };

  // 返回订单页面
  const handleBackToOrders = () => {
    navigate('/orders');
  };

  if (isAccountMarketCheckout && accountMarketItemLoading && !pendingOrder) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
      </Box>
    );
  }

  if (isAccountMarketCheckout && (accountMarketItemNotFound || accountMarketItemError || !accountSkuId) && !pendingOrder) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="80vh" gap={2}>
        <Alert severity="warning">
          {accountMarketItemNotFound || !accountSkuId
            ? intl.formatMessage({ id: 'checkout.accountListingUnavailable', defaultMessage: 'This account listing is no longer available.' })
            : accountMarketItemError}
        </Alert>
        <Button component={RouterLink} to={getAccountMarketListPath()} variant="contained" color="primary">
          <FormattedMessage id="checkout.backToAccountMarket" defaultMessage="Back to Account Market" />
        </Button>
      </Box>
    );
  }

  if ((!cart || cart.length === 0) && !pendingOrder) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="80vh" gap={2}>
        <Typography variant="h5">
          <FormattedMessage id="checkout.emptyCart" defaultMessage="Your cart is empty" />
        </Typography>
        <Button variant="contained" color="primary" onClick={handleBackToMarket}>
          <FormattedMessage
            id={isAccountMarketCheckout ? 'checkout.backToAccountMarket' : 'checkout.backToMarket'}
            defaultMessage={isAccountMarketCheckout ? 'Back to Account Market' : 'Back to Market'}
          />
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
    }, effectiveShips);

    return {
      thumbnail: item.media?.thumbnail?.storeSmall || visual.thumbnail || MARKET_ITEM_PLACEHOLDER,
      fromImage: visual.fromImage,
      toImage: visual.toImage,
      shipName: visual.shipName,
      fromShipName: visual.fromShipName,
      toShipName: visual.toShipName,
    };
  };

  const getLocalizedItemShipNames = (item: MarketCartItem) => {
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
    }, effectiveShips);

    return {
      fromShipName: getShipDisplayName(visual.fromShip) || visual.fromShipName || item.fromShipName || '',
      toShipName: getShipDisplayName(visual.toShip) || visual.toShipName || item.toShipName || '',
      shipName: getShipDisplayName(visual.ship) || visual.shipName || item.shipName || '',
    };
  };

  const getItemName = (
    item: MarketCartItem,
    localizedShipNames = getLocalizedItemShipNames(item),
  ) => {
    const { fromShipName, toShipName, shipName } = localizedShipNames;

    if (item.itemType === 'ccu') {
      return formatMarketCcuResourceName(intl, fromShipName || '-', toShipName || '-');
    }

    if (item.itemType === 'credit') {
      const creditAmount = item.creditAmount ?? item.creditOptions?.[0]?.amount;
      if (typeof creditAmount === 'number') {
        return formatMarketCreditResourceName(intl, creditAmount);
      }
    }

    if (((item.itemType === 'package' && item.packageKind === 'standalone_ship') || item.itemType === 'misc') && shipName) {
      return shipName;
    }

    return item.name || item.skuId;
  };

  return (
    <Box className='absolute top-[65px] left-0 right-0 h-[calc(100vh-65px)] overflow-auto'>
      <Box className='mx-auto w-full max-w-[1280px] px-8 py-4'>
        <Typography
          variant="h5"
          component="h1"
          align="left"
          gutterBottom
          sx={{ mb: 4, fontWeight: 500, mt: 2 }}
        >
          {pendingOrder ? (
            <FormattedMessage id="checkout.resumePayment" defaultMessage="Resume Payment" />
          ) : (
            <FormattedMessage
              id={isAccountMarketCheckout ? 'checkout.accountTitle' : 'checkout.title'}
              defaultMessage={isAccountMarketCheckout ? 'Account Market Checkout' : 'Checkout'}
            />
          )}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
            {error}
          </Alert>
        )}

        {pendingOrder && (
          <Alert severity="warning" sx={{ mb: 2, textAlign: "left" }}>
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

        {!pendingOrder && !isAccountMarketCart && cartValidation.hasInvalidItems && (
          <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
            <FormattedMessage
              id="checkout.invalidCartItems"
              defaultMessage="Some cart items are unavailable and were excluded from checkout."
            />
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
          <Box sx={{ flex: '1 1 65%' }}>
          <Paper variant="outlined" sx={{ mb: 4, overflow: 'hidden', borderRadius: 0 }}>
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
                    const validation = !pendingOrder && !isAccountMarketCart
                      ? cartValidation.itemMap.get(item.skuId)
                      : undefined;
                    const isInvalid = validation?.valid === false;
                    const media = getItemMedia(item);
                    const localizedShipNames = getLocalizedItemShipNames(item);
                    const name = getItemName(item, localizedShipNames);
                    const price = getItemPrice(item);
                    const fromShipName = localizedShipNames.fromShipName || media.fromShipName || item.fromShipName || '';
                    const toShipName = localizedShipNames.toShipName || media.toShipName || item.toShipName || '';
                    const shipName = localizedShipNames.shipName || media.shipName || item.shipName || '';
                    
                    return (
                      <TableRow
                        key={item.skuId}
                        sx={{
                          '&:last-child td, &:last-child th': { border: 0 },
                          opacity: isInvalid ? 0.62 : 1,
                          bgcolor: isInvalid ? 'action.hover' : undefined,
                        }}
                      >
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
                                alt={intl.formatMessage(
                                  { id: 'checkout.imageFrom', defaultMessage: 'From: {name}' },
                                  { name: fromShipName || name },
                                )}
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
                                alt={intl.formatMessage(
                                  { id: 'checkout.imageTo', defaultMessage: 'To: {name}' },
                                  { name: toShipName || name },
                                )}
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
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body1" sx={{ fontWeight: 500 }}>{name}</Typography>
                            {isInvalid && (
                              <Chip
                                size="small"
                                color="warning"
                                label={intl.formatMessage({
                                  id: 'checkout.excludedItemBadge',
                                  defaultMessage: 'Excluded',
                                })}
                              />
                            )}
                          </Box>
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
                                  {[
                                    getMarketPackageKindLabel(intl, item.packageKind),
                                    item.insuranceType,
                                  ].filter(Boolean).join(' · ')}
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
                          {isInvalid && (
                            <Alert severity="warning" sx={{ mt: 1, py: 0.5 }}>
                              <FormattedMessage
                                id="checkout.invalidItemDetail"
                                defaultMessage="This item is unavailable or over current stock, so it will not be included in payment. {availableStock}"
                                values={{
                                  availableStock: validation && validation.availableStock !== Number.MAX_SAFE_INTEGER
                                    ? intl.formatMessage(
                                      { id: 'checkout.availableStock', defaultMessage: '{count} available now' },
                                      { count: validation.availableStock },
                                    )
                                    : '',
                                }}
                              />
                            </Alert>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col gap-2">
                            {isInvalid
                              ? intl.formatMessage({ id: 'checkout.excludedItemPrice', defaultMessage: 'Excluded' })
                              : formatCheckoutPrice(price)}
                            {/* 使用更安全的方式检查折扣价格 */}
                            {(!isInvalid && item.discounted !== undefined && item.discounted > 0) && (
                              <span className="text-gray-500 line-through">
                                {formatCheckoutPrice(item.discounted + price)}
                              </span>
                            )}
                            {isInvalid && !pendingOrder && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="warning"
                                onClick={() => removeFromCart(item.skuId)}
                              >
                                <FormattedMessage id="checkout.removeUnavailableItem" defaultMessage="Remove" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {cart.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Alert severity="warning" sx={{ textAlign: 'left' }}>
                          <FormattedMessage
                            id="checkout.noValidCartItems"
                            defaultMessage="No valid items remain in the checkout list. Please return to the cart and remove unavailable items."
                          />
                        </Alert>
                      </TableCell>
                    </TableRow>
                  )}
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
            <FormattedMessage id="checkout.feeWaivedMessage" defaultMessage="Waive software service fee for orders of $5 or more" />
          </Alert>
          {/* {couponPreview?.activeCoupon && (
            <Alert severity={couponPreview.applicableToCurrentCart ? 'success' : 'warning'} sx={{ mb: 2, textAlign: 'left', fontSize: '14px' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                <FormattedMessage id="checkout.couponTitle" defaultMessage="Available coupon" />
              </Typography>
              <Typography variant="body2">
                <FormattedMessage
                  id="checkout.couponSummary"
                  defaultMessage="${amountOff} off, minimum spend ${minimumAmount}, expires at {expiresAt}."
                  values={{
                    amountOff: couponPreview.activeCoupon.amountOff.toFixed(2),
                    minimumAmount: couponPreview.activeCoupon.minimumAmount.toFixed(2),
                    expiresAt: new Date(couponPreview.activeCoupon.expiresAt).toLocaleString(intl.locale),
                  }}
                />
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {couponPreview.applicableToCurrentCart ? (
                  <FormattedMessage
                    id="checkout.couponAppliedAuto"
                    defaultMessage="This coupon will be applied automatically to the items in this order."
                  />
                ) : (
                  <FormattedMessage
                    id="checkout.couponNotApplicable"
                    defaultMessage="This cart does not meet the minimum spend requirement yet."
                  />
                )}
              </Typography>
            </Alert>
          )} */}
          <Paper variant="outlined" sx={{ p: 3, mb: 3, borderRadius: 0 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
              <FormattedMessage id="checkout.summary" defaultMessage="Summary" />
            </Typography>

            {/* {excludedCartItems.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
                <FormattedMessage
                  id="checkout.excludedItemsSummary"
                  defaultMessage="{count} unavailable cart item(s) are shown in the list but excluded from this payment."
                  values={{ count: excludedCartItems.length }}
                />
              </Alert>
            )} */}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="body1">
                <FormattedMessage id="checkout.subtotal" defaultMessage="Subtotal" />
              </Typography>
              <Typography variant="body1" fontWeight="500">
                {formatCheckoutPrice(subtotal)}
              </Typography>
            </Box>

            {isAccountMarketCart && !pendingOrder && (
              <Box sx={{ mb: 2 }}>
                <TextField
                  fullWidth
                  label={intl.formatMessage({ id: 'checkout.accountCouponCode', defaultMessage: 'Account coupon code' })}
                  value={accountCouponCode}
                  onChange={(event) => handleAccountCouponCodeChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleApplyAccountCoupon();
                    }
                  }}
                  placeholder={expectedAccountCouponCode}
                  error={Boolean(accountCouponError)}
                  helperText={accountCouponError || (accountCouponApplied
                    ? intl.formatMessage(
                      { id: 'checkout.accountCouponApplied', defaultMessage: '{percent}% account discount applied.' },
                      { percent: accountCouponValidation?.percentOff || ACCOUNT_MARKET_COUPON_PERCENT_OFF },
                    )
                    : intl.formatMessage(
                      { id: 'checkout.accountCouponHelp', defaultMessage: 'Use {code} for {percent}% off account listings this month. Press Enter or Apply to validate it.' },
                      { code: expectedAccountCouponCode, percent: ACCOUNT_MARKET_COUPON_PERCENT_OFF },
                    ))}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => void handleApplyAccountCoupon()}
                          disabled={accountCouponApplying || !accountCouponCode.trim()}
                        >
                          {accountCouponApplying
                            ? intl.formatMessage({ id: 'checkout.accountCouponApplying', defaultMessage: 'Applying...' })
                            : intl.formatMessage({ id: 'checkout.applyCoupon', defaultMessage: 'Apply' })}
                        </Button>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
            )}

            {!isAccountMarketCart && availableCoupons.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <TextField
                  select
                  fullWidth
                  label={intl.formatMessage({ id: 'checkout.couponSelect', defaultMessage: 'Coupon' })}
                  value={selectedCouponId}
                  onChange={(event) => setSelectedCouponId(event.target.value)}
                  sx={{
                    '& .MuiSelect-select': {
                      textAlign: 'left',
                    },
                  }}
                  helperText={selectedCoupon
                    ? intl.formatMessage(
                        {
                          id: 'checkout.couponSummary',
                          defaultMessage: '{amountOff} off, minimum spend {minimumAmount}, expires at {expiresAt}.',
                        },
                        {
                          amountOff: formatCheckoutPrice(selectedCoupon.amountOff),
                          minimumAmount: formatCheckoutPrice(selectedCoupon.minimumAmount),
                          expiresAt: new Date(selectedCoupon.expiresAt).toLocaleString(intl.locale),
                        },
                      )
                    : intl.formatMessage({
                        id: 'checkout.couponSelectPlaceholder',
                        defaultMessage: 'Do not apply a coupon',
                      })}
                >
                  <MenuItem value="">
                    {intl.formatMessage({
                      id: 'checkout.noCoupon',
                      defaultMessage: 'Do not use a coupon',
                    })}
                  </MenuItem>
                  {availableCoupons.map((coupon) => (
                    <MenuItem key={coupon.id} value={coupon.id}>
                      {intl.formatMessage(
                        {
                          id: 'checkout.couponOption',
                          defaultMessage: '{amountOff} off · min {minimumAmount}',
                        },
                        {
                          amountOff: formatCheckoutPrice(coupon.amountOff),
                          minimumAmount: formatCheckoutPrice(coupon.minimumAmount),
                        },
                      )}
                    </MenuItem>
                  ))}
                </TextField>
                {selectedCoupon && !selectedCoupon.applicableToCurrentCart && (
                  <Alert severity="warning" sx={{ mt: 1, textAlign: 'left' }}>
                    <FormattedMessage
                      id="checkout.couponNotApplicable"
                      defaultMessage="This cart does not meet the minimum spend requirement yet."
                    />
                  </Alert>
                )}
              </Box>
            )}

            {effectiveDiscountAmount > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="body1">
                  <FormattedMessage id="checkout.discountAmount" defaultMessage="Discount" />
                </Typography>
                <Typography variant="body1" fontWeight="500" color="success.main">
                  -{formatCheckoutPrice(effectiveDiscountAmount)}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                <FormattedMessage id="checkout.serviceFee" defaultMessage="Software Service Fee" />
              </Typography>
              <Typography variant="body2" fontWeight="500">
                {isServiceFeeFree && (
                  <span className="text-green-600">
                    {intl.formatMessage({ id: 'checkout.waived', defaultMessage: '(waived)' })}
                  </span>
                )}
                {isServiceFeeFree ? (
                  <span style={{ textDecoration: 'line-through', marginLeft: '8px' }}>
                    {formatCheckoutPrice(SOFTWARE_SERVICE_FEE_AMOUNT)}
                  </span>
                ) : (
                  <span>{formatCheckoutPrice(SOFTWARE_SERVICE_FEE_AMOUNT)}</span>
                )}
              </Typography>
            </Box>

            <Box sx={{ borderTop: '1px solid #e0e0e0', pt: 2, mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="body1" fontWeight="700">
                  <FormattedMessage id="checkout.total" defaultMessage="Total" />
                </Typography>
                <Typography variant="body1" fontWeight="700" color="primary">
                  {formatCheckoutPrice(totalPrice)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  <span>*</span>
                  <span><FormattedMessage id="checkout.taxes" defaultMessage="Taxes not included" /></span>
                </Typography>
              </Box>
            </Box>

            <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {isAccountMarketCart ? (
                  <FormattedMessage
                    id="checkout.accountDeliveryNotice"
                    defaultMessage="After you place the order, we will contact you by email to help complete account delivery, binding changes, and credential handoff."
                  />
                ) : (
                  <FormattedMessage
                    id="checkout.rsiGiftEmailNotice"
                    defaultMessage="Items will be delivered via RSI gift to the email address associated with your account at registration. Please make sure you can access that inbox."
                  />
                )}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <FormattedMessage
                  id="checkout.currentAccountEmailLabel"
                  defaultMessage="Current account email:"
                />
                {' '}
                <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {accountEmail || intl.formatMessage({ id: 'common.notAvailable', defaultMessage: 'Not available' })}
                </Box>
              </Typography>
            </Alert>
            
            <Button
              variant="contained"
              color="primary"
              fullWidth
              sx={{ mt: 2, textTransform: 'uppercase' }}
              onClick={handleConfirmOrder}
              disabled={loading || !canSubmitCheckout}
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
                id={pendingOrder ? "checkout.backToOrders" : (isAccountMarketCheckout ? "checkout.backToAccountMarket" : "checkout.backToMarket")}
                defaultMessage={pendingOrder ? "Back to Orders" : (isAccountMarketCheckout ? "Back to Account Market" : "Back to Market")}
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
          <div className="flex flex-col gap-2 text-[#555] dark:text-white">
            {
              intl.formatMessage(isAccountMarketCart
                ? {
                    id: 'checkout.accountAgreementText',
                    defaultMessage: 'By proceeding with the purchase, you agree to our Terms of Service and Privacy Policy.;After you place the order, we will contact you by email to help complete account delivery, binding changes, and credential handoff.;If needed, you can also reach us anytime through Discord or a support ticket.;All sales are final unless otherwise stated in our refund policy.',
                  }
                : {
                    id: 'checkout.agreementText',
                    defaultMessage: 'By proceeding with the purchase, you agree to our Terms of Service and Privacy Policy.;All sales are final and non-refundable unless otherwise stated in our refund policy.;In special cases such as stock shortages, we may contact you and you may choose a partial or full refund.;Items will be delivered via RSI gift to the email address associated with your account at registration. Please make sure you can access that inbox.',
                  })
                .split(';')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, index) => (<div key={index}>{line}</div>))
            }
          </div>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 2 }}>
            <MuiLink
              component={RouterLink}
              to="/terms-of-service"
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
            >
              <FormattedMessage id="terms.heading" defaultMessage="Terms of Service" />
            </MuiLink>
            <MuiLink
              component={RouterLink}
              to="/refund-policy"
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
            >
              <FormattedMessage id="refund.heading" defaultMessage="Refund Policy" />
            </MuiLink>
            <MuiLink
              component={RouterLink}
              to="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
            >
              <FormattedMessage id="privacy.heading" defaultMessage="Privacy Policy" />
            </MuiLink>
          </Box>
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
            <FormattedMessage id="checkout.goToProfile" defaultMessage="Verify now" />
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </Box>
  );
}
