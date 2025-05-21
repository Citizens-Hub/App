import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SharedHangarItem } from '../pages/Share/hooks/useSharedData';
import { RootState } from '.';

export interface ImportItem extends SharedHangarItem {
  selected: boolean;
  id: string; // 唯一标识符
}

interface ImportState {
  items: ImportItem[];
  currency: string;
  selectedCount: number;
  userId: string | null; // 添加用户ID
  sharedHangarPath: string | null; // 添加共享机库路径
}

// 生成唯一的ID
const generateImportItemId = (item: SharedHangarItem) => {
  return `${item.name}_${item.from}_${item.to}_${item.owners.join('_')}`;
};

// 从localStorage加载初始状态
const loadState = (): ImportState => {
  try {
    // 首先检查是否存在importState
    const serializedImportState = localStorage.getItem('importState');
    // 检查是否存在旧的sharedHangar
    const serializedSharedHangar = localStorage.getItem('sharedHangar');
    
    let initialState: ImportState = { 
      items: [],
      currency: 'CNY',
      selectedCount: 0,
      userId: null,
      sharedHangarPath: null
    };
    
    // 如果存在importState，加载它
    if (serializedImportState) {
      const parsedState = JSON.parse(serializedImportState);
      initialState = { ...initialState, ...parsedState };
    }
    
    // 如果存在旧的sharedHangar，合并其数据
    if (serializedSharedHangar) {
      const sharedData = JSON.parse(serializedSharedHangar);
      // 只有当importState中没有userId或sharedHangarPath时才从sharedHangar中加载
      if (!initialState.userId && sharedData.userId) {
        initialState.userId = sharedData.userId;
      }
      if (!initialState.sharedHangarPath && sharedData.sharedHangarPath) {
        initialState.sharedHangarPath = sharedData.sharedHangarPath;
      }
      
      // 如果旧数据中有hangarData，但importState中没有items，加载它们
      if (sharedData.hangarData && sharedData.hangarData.items && initialState.items.length === 0) {
        initialState.items = sharedData.hangarData.items.map((item: SharedHangarItem) => ({
          ...item,
          id: generateImportItemId(item),
          selected: true
        }));
        initialState.currency = sharedData.hangarData.currency || initialState.currency;
        initialState.selectedCount = initialState.items.length;
      }
      
      // 加载完成后，可以删除旧的sharedHangar数据
      localStorage.removeItem('sharedHangar');
    }
    
    return initialState;
  } catch (err) {
    console.error('加载导入状态失败', err);
    return { 
      items: [],
      currency: 'CNY',
      selectedCount: 0,
      userId: null,
      sharedHangarPath: null
    };
  }
};

// 保存状态到localStorage
const saveState = (state: ImportState) => {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem('importState', serializedState);
  } catch (err) {
    console.error('保存导入状态失败', err);
  }
};

const initialState: ImportState = loadState();

const importSlice = createSlice({
  name: 'import',
  initialState,
  reducers: {
    // 设置需要导入的物品
    setImportItems: (state, action: PayloadAction<{ 
      items: SharedHangarItem[],
      currency: string,
      userId?: string,
      sharedHangarPath?: string
    }>) => {
      const { items, currency, userId, sharedHangarPath } = action.payload;
      
      // 转换为ImportItem并保持之前选中的状态
      state.items = items.map(item => {
        const id = generateImportItemId(item);
        const existingItem = state.items.find(i => i.id === id);
        
        return {
          ...item,
          id,
          selected: existingItem ? existingItem.selected : true // 默认选中
        };
      });
      
      state.currency = currency;
      state.selectedCount = state.items.filter(item => item.selected).length;
      
      // 更新userId和sharedHangarPath，如果提供了的话
      if (userId !== undefined) {
        state.userId = userId;
      }
      
      if (sharedHangarPath !== undefined) {
        state.sharedHangarPath = sharedHangarPath;
      }
      
      saveState(state);
    },
    
    // 更新用户ID和共享机库路径
    updateSharedInfo: (state, action: PayloadAction<{
      userId?: string | null,
      sharedHangarPath?: string | null
    }>) => {
      const { userId, sharedHangarPath } = action.payload;
      
      if (userId !== undefined) {
        state.userId = userId;
      }
      
      if (sharedHangarPath !== undefined) {
        state.sharedHangarPath = sharedHangarPath;
      }
      
      saveState(state);
    },
    
    // 更新物品选中状态
    setItemSelected: (state, action: PayloadAction<{ 
      id: string,
      selected: boolean 
    }>) => {
      const { id, selected } = action.payload;
      const itemIndex = state.items.findIndex(item => item.id === id);
      
      if (itemIndex !== -1) {
        state.items[itemIndex].selected = selected;
        state.selectedCount = state.items.filter(item => item.selected).length;
      }
      
      saveState(state);
    },
    
    // 全选/取消全选
    selectAll: (state, action: PayloadAction<boolean>) => {
      const selectAll = action.payload;
      state.items = state.items.map(item => ({
        ...item,
        selected: selectAll
      }));
      
      state.selectedCount = selectAll ? state.items.length : 0;
      saveState(state);
    },
    
    // 清空导入的数据
    clearImportItems: (state) => {
      state.items = [];
      state.selectedCount = 0;
      saveState(state);
    },
    
    // 完全清除导入的数据和共享信息
    clearAllImportData: (state) => {
      state.items = [];
      state.selectedCount = 0;
      state.userId = null;
      state.sharedHangarPath = null;
      saveState(state);
    }
  }
});

export const { 
  setImportItems, 
  setItemSelected, 
  selectAll, 
  clearImportItems,
  updateSharedInfo,
  clearAllImportData
} = importSlice.actions;

export const selectImportItems = (state: RootState) => {
  return state.import.items.map(item => ({
    ...item,
    currency: state.import.currency
  }));
};

export default importSlice.reducer; 