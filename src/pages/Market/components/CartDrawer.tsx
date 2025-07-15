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
import { CartItem } from '@/types';
import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { X, Plus, Minus } from 'lucide-react';

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
              {cart.map((item) => (
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
                      src={item.resource.media.thumbnail.storeSmall}
                      alt={item.resource.name}
                      sx={{ mr: 2, width: 60, height: 60 }}
                    />
                    <ListItemText
                      primary={item.resource.name}
                      secondary={
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                          <div className='text-gray-500'>
                            US${(item.resource.nativePrice.amount / 100).toFixed(2)}
                          </div>
                          
                          {onUpdateQuantity && (
                            <ButtonGroup size="small" aria-label="quantity" sx={{ mt: 1 }}>
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
                                disabled={(item.quantity || Infinity) >= (getAvailableStock?.(item.resource.id) || Infinity)}
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
              ))}
            </List>

            <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <div className='text-gray-500'>
                  <FormattedMessage id="cart.total" defaultMessage="Total" />
                </div>
                <div className='text-blue-500'>
                  US${total.toFixed(2)}
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