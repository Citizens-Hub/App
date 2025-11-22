import React, { useCallback, useMemo, useEffect, ReactNode } from 'react';
import { Ship, Ccu, WbHistoryData, HangarItem, PriceHistoryEntity } from '../../../types';
import { useSelector } from 'react-redux';
import { selectHangarItems } from '../../../store/upgradesStore';
import { selectImportItems } from '../../../store/importStore';
import { CcuEdgeService } from '../services/CcuEdgeService';
import PathBuilderService from '../services/PathBuilderService';
import ImportExportService from '../services/ImportExportService';
import pathFinderService from '../services/PathFinderService';
import { CcuPlannerContext, CcuPlannerContextType, ServiceData } from './useCcuPlanner';

// Provider component for the context
interface CcuPlannerProviderProps {
  children: ReactNode;
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
  exchangeRates: {
    [currency: string]: number;
  };
  setAlert: (alert: { open: boolean, message: string, type: "success" | "error" | "warning" }) => void;
}

export const CcuPlannerProvider: React.FC<CcuPlannerProviderProps> = ({
  children,
  ships,
  ccus,
  wbHistory,
  exchangeRates,
  priceHistoryMap,
  setAlert
}) => {
  // Get upgrades and import items from Redux
  const upgrades = useSelector(selectHangarItems);
  const importItems = useSelector(selectImportItems);
  // Initialize services
  const edgeService = useMemo(() => new CcuEdgeService(), []);
  const pathBuilderService = useMemo(() => new PathBuilderService(), []);
  const importExportService = useMemo(() => new ImportExportService(), []);
  
  // Convert upgrades to HangarItem format
  const hangarItems: HangarItem[] = useMemo(() => upgrades.ccus.map(upgrade => ({
    id: Date.now() + Math.random(), // Generate unique ID
    name: upgrade.name,
    type: 'ccu',
    fromShip: upgrade.parsed.from,
    toShip: upgrade.parsed.to,
    price: upgrade.value
  })), [upgrades.ccus]);
  
  // Handle path completion status change
  const handlePathCompletionChange = useCallback((showAlert: boolean = true) => {
    // If alert needs to be shown
    if (showAlert) {
      setAlert({
        open: true,
        message: 'Path completion status updated successfully!',
        type: 'success'
      });
    }
  }, [setAlert]);
  
  // General method to show alerts
  const showAlert = useCallback((message: string, type: "success" | "error" | "warning" = "success") => {
    setAlert({
      open: true,
      message,
      type
    });
  }, [setAlert]);
  
  // Add convenient method to get service data
  const getServiceData = useCallback((): ServiceData => {
    return {
      ccus,
      wbHistory,
      hangarItems,
      importItems,
      priceHistoryMap
    };
  }, [ccus, wbHistory, hangarItems, importItems, priceHistoryMap]);
  
  // Load completed paths on initialization
  useEffect(() => {
    pathFinderService.loadCompletedPathsFromStorage();
  }, []);
  
  // Organize context values
  const contextValue: CcuPlannerContextType = {
    ships,
    ccus,
    wbHistory,
    hangarItems,
    importItems,
    exchangeRates,
    edgeService,
    pathBuilderService,
    importExportService,
    pathFinderService,
    getServiceData,
    handlePathCompletionChange,
    showAlert,
    priceHistoryMap
  };
  
  return (
    <CcuPlannerContext.Provider value={contextValue}>
      {children}
    </CcuPlannerContext.Provider>
  );
}; 