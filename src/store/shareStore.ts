import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SharedItem {
  id: string;
  name: string;
  fromId: number;
  toId: number;
  customPrice: number;
  owners?: number[]; // 添加持有者数组
}

interface ShareState {
  selectedItems: SharedItem[];
  // 存储所有物品价格，无论是否选中
  allItemPrices: Record<string, number>;
}

// 生成稳定的物品唯一标识符
export const generateItemKey = (name: string, fromId: number, toId: number): string => {
  return `${name}_${fromId}_${toId}`;
};

// 包含持有者的物品ID，用于UI显示
export const generateItemDisplayKey = (name: string, fromId: number, toId: number, ownerId?: number): string => {
  return ownerId 
    ? `${name}_${fromId}_${toId}_${ownerId}` 
    : `${name}_${fromId}_${toId}`;
};

// 从localStorage加载初始状态
const loadState = (): ShareState => {
  try {
    const serializedState = localStorage.getItem('shareState');
    if (serializedState === null) {
      return { 
        selectedItems: [],
        allItemPrices: {}
      };
    }
    const parsedState = JSON.parse(serializedState);
    
    // 确保allItemPrices字段存在
    return {
      selectedItems: parsedState.selectedItems || [],
      allItemPrices: parsedState.allItemPrices || {}
    };
  } catch (err) {
    console.error('无法从localStorage加载状态', err);
    return { 
      selectedItems: [],
      allItemPrices: {}
    };
  }
};

// 保存状态到localStorage
const saveState = (state: ShareState) => {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem('shareState', serializedState);
  } catch (err) {
    console.error('无法保存状态到localStorage', err);
  }
};

const initialState: ShareState = loadState();

const shareSlice = createSlice({
  name: 'share',
  initialState,
  reducers: {
    setItemSelected: (state, action: PayloadAction<{ item: SharedItem, selected: boolean }>) => {
      const { item, selected } = action.payload;
      const itemKey = generateItemKey(item.name, item.fromId, item.toId);
      
      if (selected) {
        // 检查是否已存在
        const existingItemIndex = state.selectedItems.findIndex(
          i => generateItemKey(i.name, i.fromId, i.toId) === itemKey
        );
        
        if (existingItemIndex === -1) {
          state.selectedItems.push(item);
        } else {
          // 如果已存在则更新
          state.selectedItems[existingItemIndex] = item;
        }
      } else {
        // 移除项目
        state.selectedItems = state.selectedItems.filter(
          i => generateItemKey(i.name, i.fromId, i.toId) !== itemKey
        );
      }
      
      // 始终保存价格
      state.allItemPrices[itemKey] = item.customPrice;
      
      // 保存到localStorage
      saveState(state);
    },
    
    updateItemPrice: (state, action: PayloadAction<{ 
      id: string, 
      name: string,
      fromId: number,
      toId: number,
      price: number 
    }>) => {
      const { name, fromId, toId, price } = action.payload;
      const itemKey = generateItemKey(name, fromId, toId);
      
      // 更新所有物品价格记录
      state.allItemPrices[itemKey] = price;
      
      // 同时更新已选中物品的价格
      const itemIndex = state.selectedItems.findIndex(
        item => generateItemKey(item.name, item.fromId, item.toId) === itemKey
      );
      
      if (itemIndex !== -1) {
        state.selectedItems[itemIndex].customPrice = price;
      }
      
      // 保存到localStorage
      saveState(state);
    },
    
    clearSelectedItems: (state) => {
      state.selectedItems = [];
      
      // 不清除价格记录
      // state.allItemPrices 保持不变
      
      // 保存到localStorage
      saveState(state);
    }
  }
});

export const { setItemSelected, updateItemPrice, clearSelectedItems } = shareSlice.actions;
export default shareSlice.reducer; 