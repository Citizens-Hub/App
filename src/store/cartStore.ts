import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { CartItem, Resource } from '@/types';

interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

const initialState: CartState = {
  items: [],
  isOpen: false
};

export const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem: (state, action: PayloadAction<Resource>) => {
      const existingItem = state.items.find(item => item.resource.id === action.payload.id);
      if (!existingItem) {
        state.items.push({ resource: action.payload, quantity: 1 });
      } else {
        existingItem.quantity = (existingItem.quantity || 1) + 1;
      }
    },
    updateQuantity: (state, action: PayloadAction<{resourceId: string, quantity: number}>) => {
      const { resourceId, quantity } = action.payload;
      const item = state.items.find(item => item.resource.id === resourceId);
      if (item) {
        item.quantity = Math.max(1, quantity);
      }
    },
    removeItem: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(item => item.resource.id !== action.payload);
    },
    clearCart: (state) => {
      state.items = [];
    },
    openCart: (state) => {
      state.isOpen = true;
    },
    closeCart: (state) => {
      state.isOpen = false;
    }
  }
});

export const { addItem, updateQuantity, removeItem, clearCart, openCart, closeCart } = cartSlice.actions;

// 选择器
export const selectCartItems = (state: { cart: CartState }) => state.cart.items;
export const selectCartOpen = (state: { cart: CartState }) => state.cart.isOpen;
export const selectCartItemsCount = (state: { cart: CartState }) => 
  state.cart.items.reduce((total, item) => total + (item.quantity || 1), 0);

export default cartSlice.reducer; 