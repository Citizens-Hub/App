import {
  Box,
  Drawer,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Divider,
  Avatar,
  Button,
  Snackbar,
  Alert,
  ButtonGroup
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { CartItem, MarketItemType, Ship } from '@/types';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { X, Plus, Minus } from 'lucide-react';
import { useShipsData } from '@/hooks';
import { useMarketCartValidation } from '@/hooks';
import { buildMarketResource, getMarketItemVisual } from '@/components/marketItemDisplay';
import { getShipDisplayName } from '@/utils/shipDisplay';
// import PaymentMethodMessaging from '@/components/PaymentMethodMessaging';

import {
  formatMarketCcuResourceName,
  formatMarketCreditResourceName,
  formatUsdPrice,
} from '../marketI18n';

interface CartDrawerProps {
  open: boolean;
  cart: CartItem[];
  onClose: () => void;
  onRemoveFromCart: (resourceId: string) => void;
  onUpdateQuantity?: (resourceId: string, quantity: number) => void;
  onReplaceCartItem?: (fromResourceId: string, resource: CartItem['resource'], quantity?: number) => void;
  getAvailableStock?: (resourceId: string) => number;
  checkoutPath?: string;
  title?: ReactNode;
  ships?: Ship[];
}

const CartDrawer: React.FC<CartDrawerProps> = ({ 
  open, 
  cart, 
  onClose, 
  onRemoveFromCart, 
  onUpdateQuantity,
  onReplaceCartItem,
  getAvailableStock,
  checkoutPath = '/checkout',
  title,
  ships: shipsProp,
}) => {
  const intl = useIntl();
  const navigate = useNavigate();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const { ships: loadedShips } = useShipsData({ enabled: !shipsProp });
  const ships = shipsProp || loadedShips;
  const cartValidation = useMarketCartValidation(cart, { enabled: open && checkoutPath === '/checkout' });
  const replacementKey = useMemo(() => (
    cartValidation.data?.items
      .filter((item) => item.replacementSkuId && item.replacementSkuId !== item.skuId)
      .map((item) => `${item.skuId}->${item.replacementSkuId}`)
      .sort()
      .join('|') || ''
  ), [cartValidation.data?.items]);
  const lastReplacementKeyRef = useRef('');

  useEffect(() => {
    if (!open || !onReplaceCartItem || !replacementKey || replacementKey === lastReplacementKeyRef.current) {
      return;
    }

    lastReplacementKeyRef.current = replacementKey;
    let canceled = false;

    void (async () => {
      const replacements = (cartValidation.data?.items || [])
        .filter((item) => item.replacementSkuId && item.replacementSkuId !== item.skuId);

      for (const replacement of replacements) {
        const currentCartItem = cart.find((item) => item.resource.id === replacement.skuId);
        if (!currentCartItem || !replacement.replacementSkuId) {
          continue;
        }

        try {
          const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item/${encodeURIComponent(replacement.replacementSkuId)}`);
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload || 'redirectSkuId' in payload) {
            continue;
          }

          if (canceled) {
            return;
          }

          onReplaceCartItem(
            currentCartItem.resource.id,
            buildMarketResource(payload, ships),
            currentCartItem.quantity || 1,
          );
        } catch (error) {
          console.warn('Failed to replace cart item for active promotion.', error);
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [cart, cartValidation.data?.items, onReplaceCartItem, open, replacementKey, ships]);

  const getResourceItemType = (item: CartItem['resource']): MarketItemType => {
    const rawItemType = item.itemType || item.subtitle || item.type;

    if (rawItemType === 'ccu' || rawItemType === 'package' || rawItemType === 'misc' || rawItemType === 'credit') {
      return rawItemType;
    }

    return rawItemType === 'ship' ? 'package' : 'misc';
  };

  const getCartItemName = (item: CartItem) => {
    const itemType = getResourceItemType(item.resource);
    const visual = getMarketItemVisual({
      skuId: item.resource.id,
      name: item.resource.name || item.resource.id,
      itemType,
      fromShipId: item.resource.fromShipId,
      toShipId: item.resource.toShipId,
      shipId: item.resource.shipId,
      fromShipName: item.resource.fromShipName,
      toShipName: item.resource.toShipName,
      shipName: item.resource.shipName,
      packageKind: item.resource.packageKind,
      insuranceType: item.resource.insuranceType,
      imageUrl: item.resource.imageUrl,
      fromImageUrl: item.resource.fromImageUrl,
      toImageUrl: item.resource.toImageUrl,
    }, ships, { imageVariant: 'thumbLarge' });

    const fromShipName = getShipDisplayName(visual.fromShip) || visual.fromShipName || item.resource.fromShipName || '';
    const toShipName = getShipDisplayName(visual.toShip) || visual.toShipName || item.resource.toShipName || '';
    const shipName = getShipDisplayName(visual.ship) || visual.shipName || item.resource.shipName || '';

    if (itemType === 'ccu') {
      return formatMarketCcuResourceName(intl, fromShipName || '-', toShipName || '-');
    }

    if (itemType === 'credit') {
      const creditAmount = item.resource.creditAmount ?? item.resource.creditOptions?.[0]?.amount;
      if (typeof creditAmount === 'number') {
        return formatMarketCreditResourceName(intl, creditAmount);
      }
    }

    if (((itemType === 'package' && item.resource.packageKind === 'standalone_ship') || itemType === 'misc') && shipName) {
      return shipName;
    }

    return item.resource.name || item.resource.id;
  };

  const getCartItemThumbnail = (item: CartItem) => {
    const itemType = getResourceItemType(item.resource);
    const visual = getMarketItemVisual({
      skuId: item.resource.id,
      name: item.resource.name || item.resource.id,
      itemType,
      fromShipId: item.resource.fromShipId,
      toShipId: item.resource.toShipId,
      shipId: item.resource.shipId,
      fromShipName: item.resource.fromShipName,
      toShipName: item.resource.toShipName,
      shipName: item.resource.shipName,
      packageKind: item.resource.packageKind,
      insuranceType: item.resource.insuranceType,
      imageUrl: item.resource.imageUrl,
      fromImageUrl: item.resource.fromImageUrl,
      toImageUrl: item.resource.toImageUrl,
    }, ships, { imageVariant: 'thumbLarge' });

    return visual.thumbnail || item.resource.imageUrl || '';
  };

  // 计算总价，考虑数量
  const total = cart.reduce((sum, item) => sum + (item.resource.nativePrice.amount / 100) * (item.quantity || 1), 0);

  // 处理数量增减
  const handleQuantityChange = (resourceId: string, newQuantity: number) => {
    if (!onUpdateQuantity || newQuantity < 1) return;
    
    // 检查库存限制
    if (getAvailableStock) {
      const availableStock = getAvailableStock(resourceId);
      if (newQuantity > availableStock) {
        setSnackbarMessage(intl.formatMessage({ 
          id: 'cart.stockLimit', 
          defaultMessage: 'Cannot add more than available stock' 
        }));
        setSnackbarOpen(true);
        return;
      }
    }
    
    onUpdateQuantity(resourceId, newQuantity);
  };

  // 处理结账
  const handleCheckout = () => {
    if (cart.length === 0) {
      setSnackbarMessage(intl.formatMessage({ id: 'cart.emptyCart', defaultMessage: 'Your cart is empty' }));
      setSnackbarOpen(true);
      return;
    }

    if (cartValidation.hasInvalidItems) {
      setSnackbarMessage(intl.formatMessage({
        id: 'cart.invalidItemsNotice',
        defaultMessage: 'Some items are unavailable or over current stock. You can continue to checkout, and those items will be excluded from payment.',
      }));
      setSnackbarOpen(true);
    }

    navigate(checkoutPath);
    onClose();
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        ModalProps={{ keepMounted: false }}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 400 } }
        }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6">
            {title || <FormattedMessage id="cart.title" defaultMessage="Your Cart" />}
          </Typography>
          <IconButton onClick={onClose}>
            <Close />
          </IconButton>
        </Box>

        {cart.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              <FormattedMessage id="cart.empty" defaultMessage="Your cart is empty" />
            </Typography>
          </Box>
        ) : (
          <>
            <List sx={{ flexGrow: 1, overflow: 'auto' }}>
              {cart.map((item) => {
                const displayName = getCartItemName(item);
                const validation = cartValidation.itemMap.get(item.resource.id);
                const isInvalid = validation?.valid === false;
                const availableStockLabel = validation && validation.availableStock !== Number.MAX_SAFE_INTEGER
                  ? intl.formatMessage(
                    { id: 'cart.availableStock', defaultMessage: '{count} available now' },
                    { count: validation.availableStock },
                  )
                  : '';

                return (
                <Box key={item.resource.id}>
                  <ListItem
                    sx={{
                      py: 2,
                      opacity: isInvalid ? 0.65 : 1,
                      bgcolor: isInvalid ? 'action.hover' : undefined,
                    }}
                    secondaryAction={
                      <IconButton edge="end" onClick={() => onRemoveFromCart(item.resource.id)}>
                        <X className="w-5 h-5 text-red-500" />
                      </IconButton>
                    }
                  >
                    <Avatar
                      variant="square"
                      src={getCartItemThumbnail(item)}
                      alt={displayName}
                      sx={{ mr: 2, width: 60, height: 60 }}
                    />
                    <ListItemText
                      primary={displayName}
                      secondary={
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                          <div className='text-gray-500 dark:text-gray-200'>
                            {formatUsdPrice(intl.locale, item.resource.nativePrice.amount / 100)}
                          </div>

                          {isInvalid && (
                            <Alert severity="warning" sx={{ py: 0 }}>
                              <FormattedMessage
                                id="cart.invalidItem"
                                defaultMessage="This SKU is no longer available for the requested quantity. {availableStock}"
                                values={{ availableStock: availableStockLabel }}
                              />
                            </Alert>
                          )}

                          {onUpdateQuantity && (
                            <ButtonGroup
                              size="small"
                              aria-label={intl.formatMessage({ id: 'market.quantityControls', defaultMessage: 'Quantity controls' })}
                              sx={{ mt: 1 }}
                            >
                              <IconButton 
                                size="small"
                                onClick={() => handleQuantityChange(item.resource.id, (item.quantity || 1) - 1)}
                                disabled={(item.quantity || 1) <= 1}
                              >
                                <Minus className="w-4 h-4" />
                              </IconButton>
                              <Typography sx={{ px: 2, display: 'flex', alignItems: 'center', border: '1px solid', borderColor: 'divider' }}>
                                {item.quantity || 1}
                              </Typography>
                              <IconButton 
                                size="small"
                                onClick={() => handleQuantityChange(item.resource.id, (item.quantity || 1) + 1)}
                                disabled={(item.quantity ?? Infinity) >= (validation?.availableStock ?? getAvailableStock?.(item.resource.id) ?? Infinity)}
                              >
                                <Plus className="w-4 h-4" />
                              </IconButton>
                            </ButtonGroup>
                          )}
                        </Box>
                      }
                      disableTypography
                    />
                  </ListItem>
                  <Divider />
                </Box>
                );
              })}
            </List>

            <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              {/* <PaymentMethodMessaging amount={total} /> */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <div className='text-gray-500 dark:text-gray-200'>
                  <FormattedMessage id="cart.total" defaultMessage="Total" />
                </div>
                <div className='text-blue-500'>
                  {formatUsdPrice(intl.locale, total)}
                </div>
              </Box>
              <Button 
                variant="contained" 
                color="primary" 
                fullWidth
                onClick={handleCheckout}
              >
                <FormattedMessage id="cart.checkout" defaultMessage="Checkout" />
              </Button>
            </Box>
          </>
        )}
      </Drawer>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity="warning"
          variant="filled"
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default CartDrawer; 
