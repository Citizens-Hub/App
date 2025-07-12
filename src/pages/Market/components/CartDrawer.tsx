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
} from '@mui/material';
import { Close, Delete, ShoppingCart } from '@mui/icons-material';
import { CartItem } from '../../../types';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router';

interface CartDrawerProps {
  open: boolean;
  cart: CartItem[];
  onClose: () => void;
  onRemoveFromCart: (resourceId: string) => void;
}

export default function CartDrawer({
  open,
  cart,
  onClose,
  onRemoveFromCart
}: CartDrawerProps) {
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const intl = useIntl();
  const navigate = useNavigate();
  const cartTotal = cart.reduce((total, item) => {
    const price = item.resource.nativePrice.discounted || item.resource.nativePrice.amount;
    return total + price;
  }, 0);

  const handleCheckout = () => {
    // Navigate to checkout page
    navigate('/checkout', { 
      state: { 
        cart: cart,
        cartTotal: cartTotal
      } 
    });
    onClose();
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
    >
      <Box sx={{ width: { xs: '100%', sm: 450 }, p: 2 }}>
        <Typography variant="h6" gutterBottom className='flex justify-between items-center'>
          {intl.formatMessage({ id: 'cart.title', defaultMessage: '我的购物车' })}
          <IconButton onClick={onClose}>
            <Close />
          </IconButton>
        </Typography>
        {cart.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {intl.formatMessage({ id: 'cart.empty', defaultMessage: '购物车中还没有商品' })}
          </Typography>
        ) : (
          <>
            <List>
              {cart.map((item) => (
                <Box key={item.resource.id}>
                  <ListItem
                    secondaryAction={
                      <IconButton edge="end" onClick={() => onRemoveFromCart(item.resource.id)}>
                        <Delete />
                      </IconButton>
                    }
                  >
                    <Box sx={{
                      mr: 2,
                      minWidth: 60,
                      minHeight: 60,
                      position: 'relative'
                    }}>
                      <Avatar
                        alt={item.resource.name}
                        src={item.resource.media.thumbnail.storeSmall.startsWith('http') ?
                          item.resource.media.thumbnail.storeSmall :
                          `https://robertsspaceindustries.com/${item.resource.media.thumbnail.storeSmall}`}
                        variant="square"
                        sx={{ width: 60, height: 60 }}
                      />
                    </Box>
                    <ListItemText
                      primary={item.resource.name}
                      secondary={
                        <Typography variant="body2">
                          {((item.resource.nativePrice.discounted || item.resource.nativePrice.amount) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                        </Typography>
                      }
                    />
                  </ListItem>
                  <Divider />
                </Box>
              ))}
            </List>
            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
              <Typography variant="subtitle1" gutterBottom>
                {intl.formatMessage({ id: 'cart.total', defaultMessage: '总价' })}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1">USD:</Typography>
                <Typography variant="body1" fontWeight="bold">
                  {(cartTotal / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                </Typography>
              </Box>
              {/* <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="body2" color="text.secondary">CNY:</Typography>
                <Typography variant="body2" color="text.secondary">
                  ~{(cartTotal * exchangeRate / 100).toLocaleString("zh-CN", {style:"currency", currency:"CNY"})}
                </Typography>
              </Box> */}
              <Button
                startIcon={<ShoppingCart />}
                variant="outlined"
                fullWidth
                sx={{ mt: 2 }}
                onClick={handleCheckout}
                disabled={cart.length === 0}
              >
                {intl.formatMessage({ id: 'cart.checkout', defaultMessage: '结账' })}
              </Button>
            </Box>
          </>
        )}
      </Box>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={intl.formatMessage({ id: 'cart.copied', defaultMessage: '已复制清单到剪贴板' })}
      />
    </Drawer>
  );
} 