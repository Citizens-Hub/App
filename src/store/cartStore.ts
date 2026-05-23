import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { CartItem, Resource } from '@/types';

type CartNamespace = 'market' | 'accountMarket';

interface CartBucketState {
  items: CartItem[];
  isOpen: boolean;
}

interface CartState {
  market: CartBucketState;
  accountMarket: CartBucketState;
}

const CART_STORAGE_KEYS: Record<CartNamespace, string> = {
  market: 'marketCart',
  accountMarket: 'accountMarketCart',
};

function loadCartItems(namespace: CartNamespace): CartItem[] {
  try {
    const serializedState = localStorage.getItem(CART_STORAGE_KEYS[namespace]);
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

function saveCartItems(namespace: CartNamespace, items: CartItem[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEYS[namespace], JSON.stringify(items));
  } catch (error) {
    console.error('无法保存购物车状态到localStorage', error);
  }
}

const initialState: CartState = {
  market: {
    items: loadCartItems('market'),
    isOpen: false,
  },
  accountMarket: {
    items: loadCartItems('accountMarket'),
    isOpen: false,
  },
};

export const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem: (state, action: PayloadAction<{ namespace?: CartNamespace; resource: Resource }>) => {
      const namespace = action.payload.namespace || 'market';
      const bucket = state[namespace];
      const existingItem = bucket.items.find(item => item.resource.id === action.payload.resource.id);
      if (!existingItem) {
        bucket.items.push({ resource: action.payload.resource, quantity: 1 });
      } else {
        existingItem.quantity = (existingItem.quantity || 1) + 1;
      }
      saveCartItems(namespace, bucket.items);
    },
    updateQuantity: (state, action: PayloadAction<{ namespace?: CartNamespace; resourceId: string; quantity: number }>) => {
      const namespace = action.payload.namespace || 'market';
      const { resourceId, quantity } = action.payload;
      const bucket = state[namespace];
      const item = bucket.items.find(item => item.resource.id === resourceId);
      if (item) {
        item.quantity = Math.max(1, quantity);
        saveCartItems(namespace, bucket.items);
      }
    },
    removeItem: (state, action: PayloadAction<{ namespace?: CartNamespace; resourceId: string }>) => {
      const namespace = action.payload.namespace || 'market';
      const bucket = state[namespace];
      bucket.items = bucket.items.filter(item => item.resource.id !== action.payload.resourceId);
      saveCartItems(namespace, bucket.items);
    },
    clearCart: (state, action: PayloadAction<{ namespace?: CartNamespace } | undefined>) => {
      const namespace = action.payload?.namespace || 'market';
      state[namespace].items = [];
      saveCartItems(namespace, state[namespace].items);
    },
    openCart: (state, action: PayloadAction<{ namespace?: CartNamespace } | undefined>) => {
      const namespace = action.payload?.namespace || 'market';
      state[namespace].isOpen = true;
    },
    closeCart: (state, action: PayloadAction<{ namespace?: CartNamespace } | undefined>) => {
      const namespace = action.payload?.namespace || 'market';
      state[namespace].isOpen = false;
    }
  }
});

export const { addItem, updateQuantity, removeItem, clearCart, openCart, closeCart } = cartSlice.actions;

// 选择器
export const selectCartItems = (namespace: CartNamespace = 'market') => (state: { cart: CartState }) => state.cart[namespace].items;
export const selectCartOpen = (namespace: CartNamespace = 'market') => (state: { cart: CartState }) => state.cart[namespace].isOpen;
export const selectCartItemsCount = (namespace: CartNamespace = 'market') => (state: { cart: CartState }) => 
  state.cart[namespace].items.reduce((total, item) => total + (item.quantity || 1), 0);

export default cartSlice.reducer; 
