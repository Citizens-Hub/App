import { createContext, useContext } from 'react';
import { Ship, Ccu, WbHistoryData, HangarItem, ImportItem, PriceHistoryEntity } from '../../../types';
import { CcuEdgeService } from '../services/CcuEdgeService';
import PathBuilderService from '../services/PathBuilderService';
import ImportExportService from '../services/ImportExportService';
import pathFinderService from '../services/PathFinderService';

// Define service context data type
export interface ServiceData {
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  hangarItems: HangarItem[];
  importItems: ImportItem[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
}

// Define context type
export interface CcuPlannerContextType {
  // Basic data
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  hangarItems: HangarItem[];
  importItems: ImportItem[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
  exchangeRates: {
    [currency: string]: number;
  };
  
  // Service instances
  edgeService: CcuEdgeService;
  pathBuilderService: PathBuilderService;
  importExportService: ImportExportService;
  pathFinderService: typeof pathFinderService;
  
  // Convenient method to get service data
  getServiceData: () => ServiceData;
  
  // Extended methods
  handlePathCompletionChange: (showAlert?: boolean) => void;
  
  // Show notifications
  showAlert: (message: string, type?: "success" | "error" | "warning") => void;
}

// Create context
export const CcuPlannerContext = createContext<CcuPlannerContextType | undefined>(undefined);

// Custom Hook for using the context
export const useCcuPlanner = (): CcuPlannerContextType => {
  const context = useContext(CcuPlannerContext);
  
  if (!context) {
    throw new Error('useCcuPlanner must be used within a CcuPlannerProvider');
  }
  
  return context;
}; 