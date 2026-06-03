import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { CartItem, Resource } from '@/types';

export type CartNamespace = 'market' | 'accountMarket';

interface CartBucketState {
  items: CartItem[];
  isOpen: boolean;
}

export interface CartState {
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

const CART_NAMESPACES: CartNamespace[] = ['market', 'accountMarket'];
const pendingCartPersistence = new Map<CartNamespace, CartItem[]>();
const lastPersistedItemsByNamespace = new Map<CartNamespace, CartItem[]>();
let cartPersistenceTimer: number | null = null;
let cartPersistenceListenersRegistered = false;

function flushPendingCartPersistence() {
  if (cartPersistenceTimer !== null) {
    window.clearTimeout(cartPersistenceTimer);
    cartPersistenceTimer = null;
  }

  pendingCartPersistence.forEach((items, namespace) => {
    saveCartItems(namespace, items);
  });
  pendingCartPersistence.clear();
}

function scheduleCartPersistence() {
  if (typeof window === 'undefined' || cartPersistenceTimer !== null) {
    return;
  }

  cartPersistenceTimer = window.setTimeout(flushPendingCartPersistence, 120);
}

function registerCartPersistenceListeners() {
  if (typeof window === 'undefined' || cartPersistenceListenersRegistered) {
    return;
  }

  cartPersistenceListenersRegistered = true;
  window.addEventListener('pagehide', flushPendingCartPersistence);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingCartPersistence();
    }
  });
}

export function primeCartPersistence(state: CartState) {
  CART_NAMESPACES.forEach((namespace) => {
    lastPersistedItemsByNamespace.set(namespace, state[namespace].items);
  });
  registerCartPersistenceListeners();
}

export function persistCartState(state: CartState) {
  let hasPendingChanges = false;

  CART_NAMESPACES.forEach((namespace) => {
    const items = state[namespace].items;
    if (lastPersistedItemsByNamespace.get(namespace) === items) {
      return;
    }

    lastPersistedItemsByNamespace.set(namespace, items);
    pendingCartPersistence.set(namespace, items);
    hasPendingChanges = true;
  });

  if (hasPendingChanges) {
    registerCartPersistenceListeners();
    scheduleCartPersistence();
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
    },
    updateQuantity: (state, action: PayloadAction<{ namespace?: CartNamespace; resourceId: string; quantity: number }>) => {
      const namespace = action.payload.namespace || 'market';
      const { resourceId, quantity } = action.payload;
      const bucket = state[namespace];
      const item = bucket.items.find(item => item.resource.id === resourceId);
      if (item) {
        item.quantity = Math.max(1, quantity);
      }
    },
    removeItem: (state, action: PayloadAction<{ namespace?: CartNamespace; resourceId: string }>) => {
      const namespace = action.payload.namespace || 'market';
      const bucket = state[namespace];
      bucket.items = bucket.items.filter(item => item.resource.id !== action.payload.resourceId);
    },
    clearCart: (state, action: PayloadAction<{ namespace?: CartNamespace } | undefined>) => {
      const namespace = action.payload?.namespace || 'market';
      state[namespace].items = [];
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
