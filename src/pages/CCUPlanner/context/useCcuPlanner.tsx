import { createContext, useContext } from 'react';
import { Ship, Ccu, WbHistoryData, HangarItem, ImportItem } from '../../../types';
import { CcuEdgeService } from '../services/CcuEdgeService';
import PathBuilderService from '../services/PathBuilderService';
import ImportExportService from '../services/ImportExportService';

// 定义上下文类型
export interface CcuPlannerContextType {
  // 基本数据
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  hangarItems: HangarItem[];
  importItems: ImportItem[];
  exchangeRates: {
    [currency: string]: number;
  };
  
  // 服务实例
  edgeService: CcuEdgeService;
  pathBuilderService: PathBuilderService;
  importExportService: ImportExportService;
  
  // 扩展方法
  handlePathCompletionChange: (showAlert?: boolean) => void;
  
  // 是否显示提示
  showAlert: (message: string, type?: "success" | "error" | "warning") => void;
}

// 创建上下文
export const CcuPlannerContext = createContext<CcuPlannerContextType | undefined>(undefined);

// 自定义Hook以便于使用上下文
export const useCcuPlanner = (): CcuPlannerContextType => {
  const context = useContext(CcuPlannerContext);
  
  if (!context) {
    throw new Error('useCcuPlanner必须在CcuPlannerProvider内部使用');
  }
  
  return context;
}; 