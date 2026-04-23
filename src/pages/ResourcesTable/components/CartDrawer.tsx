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
  Snackbar
} from '@mui/material';
import { Close, Delete, ContentCopy } from '@mui/icons-material';
import { CartItem } from '@/types';
import { useState } from 'react';
import { useIntl } from 'react-intl';

interface CartDrawerProps {
  open: boolean;
  cart: CartItem[];
  exchangeRate: number;
  onClose: () => void;
  onRemoveFromCart: (resourceId: string) => void;
}

export default function CartDrawer({ 
  open, 
  cart, 
  exchangeRate, 
  onClose, 
  onRemoveFromCart 
}: CartDrawerProps) {
  const intl = useIntl();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  
  const cartTotal = cart.reduce((total, item) => {
    const price = item.resource.nativePrice.discounted || item.resource.nativePrice.amount;
    return total + price;
  }, 0);

  const copyCartToClipboard = () => {
    let cartText = `${intl.formatMessage({ id: 'cart.title', defaultMessage: 'Your Cart' })}:\n\n`;
    
    cart.forEach((item, index) => {
      const price = (item.resource.nativePrice.discounted || item.resource.nativePrice.amount) / 100;
      cartText += `${index + 1}. ${item.resource.name} - $${price.toFixed(2)}\n`;
    });
    
    cartText += `\n${intl.formatMessage({ id: 'cart.total', defaultMessage: 'Total' })}: $${(cartTotal / 100).toFixed(2)} (~ ¥${(cartTotal * exchangeRate / 100).toFixed(2)})`;
    
    navigator.clipboard.writeText(cartText)
      .then(() => setSnackbarOpen(true))
      .catch(err => console.error('Failed to copy:', err));
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
    >
      <Box sx={{ width: { xs: '100%', sm: 450 }, p: 2 }}>
        <Typography variant="h6" gutterBottom className='flex justify-between items-center'>
          <span>{intl.formatMessage({ id: 'cart.title', defaultMessage: 'Your Cart' })}</span>
          <IconButton onClick={onClose}>
            <Close />
          </IconButton>
        </Typography>
        {cart.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {intl.formatMessage({ id: 'cart.empty', defaultMessage: 'Your cart is empty' })}
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
                          {((item.resource.nativePrice.discounted || item.resource.nativePrice.amount) / 100).toLocaleString("en-US", {style:"currency", currency:"USD"})}
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
                {intl.formatMessage({ id: 'cart.total', defaultMessage: 'Total' })}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1">
                  {intl.formatMessage({ id: 'cart.currency.usd', defaultMessage: 'USD:' })}
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {(cartTotal / 100).toLocaleString("en-US", {style:"currency", currency:"USD"})}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {intl.formatMessage({ id: 'cart.currency.cny', defaultMessage: 'CNY:' })}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ~{(cartTotal * exchangeRate / 100).toLocaleString("zh-CN", {style:"currency", currency:"CNY"})}
                </Typography>
              </Box>
              <Button 
                startIcon={<ContentCopy />}
                variant="outlined" 
                fullWidth 
                sx={{ mt: 2 }}
                onClick={copyCartToClipboard}
                disabled={cart.length === 0}
              >
                <span>{intl.formatMessage({ id: 'cart.copy', defaultMessage: 'Copy list' })}</span>
              </Button>
            </Box>
          </>
        )}
      </Box>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={intl.formatMessage({ id: 'common.copied', defaultMessage: 'Copied to clipboard' })}
      />
    </Drawer>
  );
} 
