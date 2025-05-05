import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
// 不再需要 enableMapSet
// import { enableMapSet } from 'immer';

// 不再需要启用 MapSet
// enableMapSet();

// 创建一个字符串数组的切片
const stringsSlice = createSlice({
  name: 'strings',
  initialState: {
    items: [] as { from: {id: number, name: string}, to: {id: number, name: string}, name: string, value: number }[]
  },
  reducers: {
    // 添加字符串到数组
    addUpgrade: (state, action: PayloadAction<{ from: {id: number, name: string}, to: {id: number, name: string}, name: string, value: number }>) => {
      // 只有当数组中不存在该元素时才添加
      if (!state.items.find(item => item.from.id === action.payload.from.id && item.to.id === action.payload.to.id && item.name === action.payload.name && item.value === action.payload.value)) {
        state.items.push(action.payload);
      }
    },
    // 清空字符串数组
    clearUpgrades: (state) => {
      state.items = [];
    }
  }
});

export const { addUpgrade, clearUpgrades } = stringsSlice.actions;

// 配置 store
export const store = configureStore({
  reducer: {
    upgrades: stringsSlice.reducer
  }
});

// 导出 RootState 和 AppDispatch 类型
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
