import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  addItem, 
  removeItem,
  replaceItem,
  updateQuantity,
  clearCart, 
  openCart, 
  closeCart, 
  selectCartItems, 
  selectCartOpen, 
  selectCartItemsCount 
} from '@/store/cartStore';
import type { RootState } from '@/store';
import { Resource } from '@/types';
import { sendGoogleAdsAddToCartConversion } from '@/utils/googleAdsConversions';
import { sendRedditPixelAddToCartConversion } from '@/utils/redditPixelConversions';

type CartNamespace = 'market' | 'accountMarket';

function deferAddToCartConversions(resource: Resource, userEmail?: string) {
  window.setTimeout(() => {
    void sendGoogleAdsAddToCartConversion({ userEmail });
    void sendRedditPixelAddToCartConversion(resource.id);
  }, 0);
}

export function useCartStore(namespace: CartNamespace = 'market') {
  const dispatch = useDispatch();
  const userEmail = useSelector((state: RootState) => state.user.user.email);
  const cartItems = useSelector(selectCartItems(namespace));
  const isCartOpen = useSelector(selectCartOpen(namespace));
  const itemsCount = useSelector(selectCartItemsCount(namespace));

  const addToCart = useCallback((resource: Resource) => {
    dispatch(addItem({ namespace, resource }));
    deferAddToCartConversions(resource, userEmail);
  }, [dispatch, namespace, userEmail]);

  const updateItemQuantity = useCallback((resourceId: string, quantity: number) => {
    dispatch(updateQuantity({ namespace, resourceId, quantity }));
  }, [dispatch, namespace]);

  const removeFromCart = useCallback((resourceId: string) => {
    dispatch(removeItem({ namespace, resourceId }));
  }, [dispatch, namespace]);

  const replaceCartItem = useCallback((fromResourceId: string, resource: Resource, quantity?: number) => {
    dispatch(replaceItem({ namespace, fromResourceId, resource, quantity }));
  }, [dispatch, namespace]);

  const emptyCart = useCallback(() => {
    dispatch(clearCart({ namespace }));
  }, [dispatch, namespace]);

  const openCartHandler = useCallback(() => {
    dispatch(openCart({ namespace }));
  }, [dispatch, namespace]);

  const closeCartHandler = useCallback(() => {
    dispatch(closeCart({ namespace }));
  }, [dispatch, namespace]);

  const toggleCart = useCallback((open?: boolean) => {
    if (open === undefined) {
      if (isCartOpen) {
        closeCartHandler();
      } else {
        openCartHandler();
      }
    } else if (open) {
      openCartHandler();
    } else {
      closeCartHandler();
    }
  }, [closeCartHandler, isCartOpen, openCartHandler]);

  return {
    cart: cartItems,
    cartOpen: isCartOpen,
    itemsCount,
    addToCart,
    updateItemQuantity,
    removeFromCart,
    replaceCartItem,
    emptyCart,
    openCart: openCartHandler,
    closeCart: closeCartHandler,
    toggleCart
  };
} 
