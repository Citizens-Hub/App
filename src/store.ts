import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

const version = '1.0.0';

interface HangarItem {
  name: string,
  value: number,
  isBuyBack: boolean,
  canGift: boolean,
  belongsTo: number,
}

interface CCUItem extends HangarItem {
  from: { id: number, name: string },
  to: { id: number, name: string },
  parsed: {
    from: string,
    to: string
  },  
}

interface ShipItem extends HangarItem {
  id: number,
}

interface BundleItem extends HangarItem {
  ships: ShipItem[],
}

interface HangarItems {
  ccus: CCUItem[],
  ships: ShipItem[],
  bundles: BundleItem[],
}

export interface UserInfo {
  id: number,
  username: string,
  nickname: string,
  avatar: string,
}

const getInitialState = (): {
  items: HangarItems,
  users: UserInfo[],
  version: string,
  selectedUser: number
} => {
  const localState = localStorage.getItem('state');

  if (localState && JSON.parse(localState).version === version) {
    return JSON.parse(localState);
  }

  return {
    items: {
      ccus: [],
      ships: [],
      bundles: [],
    },
    users: [],
    selectedUser: -1,
    version,
  };
};

const stringsSlice = createSlice({
  name: 'strings',
  initialState: getInitialState(),
  reducers: {
    addCCU: (state, action: PayloadAction<CCUItem>) => {
      if (!state.items.ccus.find(item => item.belongsTo === action.payload.belongsTo && item.canGift === action.payload.canGift && item.from.id === action.payload.from.id && item.to.id === action.payload.to.id && item.name === action.payload.name && item.value === action.payload.value)) {
        state.items.ccus.push(action.payload);
      }
      localStorage.setItem('state', JSON.stringify(state));
    },
    addUser: (state, action: PayloadAction<UserInfo>) => {
      if (!state.users.find(user => user.id === action.payload.id)) {
        state.users.push(action.payload);
      }
      localStorage.setItem('state', JSON.stringify(state));
    },
    clearUpgrades: (state, action: PayloadAction<number>) => {
      const currentUser = action.payload;
      state.items = {
        ccus: state.items.ccus.filter(item => item.belongsTo !== currentUser),
        ships: state.items.ships.filter(item => item.belongsTo !== currentUser),
        bundles: state.items.bundles.filter(item => item.belongsTo !== currentUser),
      };
      localStorage.setItem('state', JSON.stringify(state));
    },
    setSelectedUser: (state, action: PayloadAction<number>) => {
      state.selectedUser = action.payload;
      localStorage.setItem('state', JSON.stringify(state));
    }
  }
});

export const selectHangarItems = (state: RootState) => state.upgrades.items.ccus.filter(item => item.belongsTo === state.upgrades.selectedUser || item.canGift || state.upgrades.selectedUser === -1);

export const { addCCU, addUser, clearUpgrades, setSelectedUser } = stringsSlice.actions;

export const store = configureStore({
  reducer: {
    upgrades: stringsSlice.reducer,
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
