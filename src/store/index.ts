import { configureStore, createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";
import upgradesReducer from "./upgradesStore";
import userReducer from "./userStore";
import shareReducer from "./shareStore";
import importReducer from "./importStore";
import cartReducer, {
  addItem,
  clearCart,
  CartState,
  persistCartState,
  primeCartPersistence,
  removeItem,
  updateQuantity,
} from "./cartStore";
// import biReducer from "./biStore";

const cartPersistenceMiddleware = createListenerMiddleware();

export const store = configureStore({
  reducer: {
    user: userReducer,
    upgrades: upgradesReducer,
    // bi: biReducer,
    share: shareReducer,
    import: importReducer,
    cart: cartReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(cartPersistenceMiddleware.middleware),
});

primeCartPersistence(store.getState().cart);

cartPersistenceMiddleware.startListening({
  matcher: isAnyOf(addItem, updateQuantity, removeItem, clearCart),
  effect: (_action, listenerApi) => {
    const state = listenerApi.getState() as { cart: CartState };
    persistCartState(state.cart);
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
