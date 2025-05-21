import { configureStore } from "@reduxjs/toolkit";
import { upgradesSlice } from "./upgradesStore";
import { userSlice } from "./userStore";
import shareReducer from "./shareStore";
import importReducer from "./importStore";

export const store = configureStore({
  reducer: {
    user: userSlice.reducer,
    upgrades: upgradesSlice.reducer,
    share: shareReducer,
    import: importReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
