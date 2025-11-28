import { configureStore } from "@reduxjs/toolkit";
import upgradesReducer from "./upgradesStore";
import userReducer from "./userStore";
import shareReducer from "./shareStore";
import importReducer from "./importStore";
import cartReducer from "./cartStore";
// import biReducer from "./biStore";

export const store = configureStore({
  reducer: {
    user: userReducer,
    upgrades: upgradesReducer,
    // bi: biReducer,
    share: shareReducer,
    import: importReducer,
    cart: cartReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
