import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { CartItem, Resource } from '@/types';

interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

const CART_STORAGE_KEY = 'marketCart';

function loadCartItems(): CartItem[] {
  try {
    const serializedState = localStorage.getItem(CART_STORAGE_KEY);
    if (!serializedState) {
      return [];
    }

    const parsedState = JSON.parse(serializedState) as unknown;
    if (!Array.isArray(parsedState)) {
      return [];
    }

    return parsedState as CartItem[];
  } catch (error) {
    console.error('无法从localStorage加载购物车状态', error);
    return [];
  }
}

function saveCartItems(items: CartItem[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('无法保存购物车状态到localStorage', error);
  }
}

const initialState: CartState = {
  items: loadCartItems(),
  isOpen: false,
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
      saveCartItems(state.items);
    },
    updateQuantity: (state, action: PayloadAction<{resourceId: string, quantity: number}>) => {
      const { resourceId, quantity } = action.payload;
      const item = state.items.find(item => item.resource.id === resourceId);
      if (item) {
        item.quantity = Math.max(1, quantity);
        saveCartItems(state.items);
      }
    },
    removeItem: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(item => item.resource.id !== action.payload);
      saveCartItems(state.items);
    },
    clearCart: (state) => {
      state.items = [];
      saveCartItems(state.items);
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
