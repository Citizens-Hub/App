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
import { CartItem, MarketItemType } from '@/types';
import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { X, Plus, Minus } from 'lucide-react';
import { useShipsData } from '@/hooks';
import { getMarketItemVisual } from '@/components/marketItemDisplay';
import { getShipDisplayName } from '@/utils/shipDisplay';

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
  getAvailableStock?: (resourceId: string) => number;
}

const CartDrawer: React.FC<CartDrawerProps> = ({ 
  open, 
  cart, 
  onClose, 
  onRemoveFromCart, 
  onUpdateQuantity,
  getAvailableStock 
}) => {
  const intl = useIntl();
  const navigate = useNavigate();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const { ships } = useShipsData();

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
    }, ships);

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
    }, ships);

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

    navigate('/checkout');
    onClose();
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 400 } }
        }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6">
            <FormattedMessage id="cart.title" defaultMessage="Your Cart" />
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

                return (
                <Box key={item.resource.id}>
                  <ListItem
                    sx={{ py: 2 }}
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
                                disabled={(item.quantity ?? Infinity) >= (getAvailableStock?.(item.resource.id) ?? Infinity)}
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
