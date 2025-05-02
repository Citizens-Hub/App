import { useState } from 'react';
import { Resource, CartItem } from '../types';

export default function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  // 添加到购物清单
  const addToCart = (resource: Resource) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.resource.id === resource.id);
      if (existingItem) {
        // 如果购物清单中已经存在该商品，不增加数量
        return prevCart;
      } else {
        return [...prevCart, { resource }];
      }
    });
  };

  // 从购物清单中移除
  const removeFromCart = (resourceId: string) => {
    setCart(prevCart => prevCart.filter(item => item.resource.id !== resourceId));
  };

  // 打开购物车
  const openCart = () => setCartOpen(true);
  
  // 关闭购物车
  const closeCart = () => setCartOpen(false);

  return {
    cart,
    cartOpen,
    addToCart,
    removeFromCart,
    openCart,
    closeCart
  };
} 