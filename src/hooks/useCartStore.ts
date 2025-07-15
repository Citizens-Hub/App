import { useDispatch, useSelector } from 'react-redux';
import { 
  addItem, 
  removeItem,
  updateQuantity,
  clearCart, 
  openCart, 
  closeCart, 
  selectCartItems, 
  selectCartOpen, 
  selectCartItemsCount 
} from '@/store/cartStore';
import { Resource } from '@/types';

export function useCartStore() {
  const dispatch = useDispatch();
  const cartItems = useSelector(selectCartItems);
  const isCartOpen = useSelector(selectCartOpen);
  const itemsCount = useSelector(selectCartItemsCount);

  const addToCart = (resource: Resource) => {
    dispatch(addItem(resource));
  };

  const updateItemQuantity = (resourceId: string, quantity: number) => {
    dispatch(updateQuantity({ resourceId, quantity }));
  };

  const removeFromCart = (resourceId: string) => {
    dispatch(removeItem(resourceId));
  };

  const emptyCart = () => {
    dispatch(clearCart());
  };

  const toggleCart = (open?: boolean) => {
    if (open === undefined) {
      if (isCartOpen) {
        dispatch(closeCart());
      } else {
        dispatch(openCart());
      }
    } else if (open) {
      dispatch(openCart());
    } else {
      dispatch(closeCart());
    }
  };

  return {
    cart: cartItems,
    cartOpen: isCartOpen,
    itemsCount,
    addToCart,
    updateItemQuantity,
    removeFromCart,
    emptyCart,
    openCart: () => dispatch(openCart()),
    closeCart: () => dispatch(closeCart()),
    toggleCart
  };
} 