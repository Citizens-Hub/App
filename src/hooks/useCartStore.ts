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

type CartNamespace = 'market' | 'accountMarket';

export function useCartStore(namespace: CartNamespace = 'market') {
  const dispatch = useDispatch();
  const cartItems = useSelector(selectCartItems(namespace));
  const isCartOpen = useSelector(selectCartOpen(namespace));
  const itemsCount = useSelector(selectCartItemsCount(namespace));

  const addToCart = (resource: Resource) => {
    dispatch(addItem({ namespace, resource }));
  };

  const updateItemQuantity = (resourceId: string, quantity: number) => {
    dispatch(updateQuantity({ namespace, resourceId, quantity }));
  };

  const removeFromCart = (resourceId: string) => {
    dispatch(removeItem({ namespace, resourceId }));
  };

  const emptyCart = () => {
    dispatch(clearCart({ namespace }));
  };

  const toggleCart = (open?: boolean) => {
    if (open === undefined) {
      if (isCartOpen) {
        dispatch(closeCart({ namespace }));
      } else {
        dispatch(openCart({ namespace }));
      }
    } else if (open) {
      dispatch(openCart({ namespace }));
    } else {
      dispatch(closeCart({ namespace }));
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
    openCart: () => dispatch(openCart({ namespace })),
    closeCart: () => dispatch(closeCart({ namespace })),
    toggleCart
  };
} 
