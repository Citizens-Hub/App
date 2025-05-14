import { configureStore } from "@reduxjs/toolkit";
import { upgradesSlice } from "./upgradesStore";
import { userSlice } from "./userStore";

export const store = configureStore({
  reducer: {
    upgrades: upgradesSlice.reducer,
    user: userSlice.reducer,
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
