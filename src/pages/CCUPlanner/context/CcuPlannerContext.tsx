import React, { useCallback, useMemo, useEffect, ReactNode } from 'react';
import { Ship, Ccu, WbHistoryData, HangarItem } from '../../../types';
import { useSelector } from 'react-redux';
import { selectHangarItems } from '../../../store/upgradesStore';
import { selectImportItems } from '../../../store/importStore';
import { CcuEdgeService } from '../services/CcuEdgeService';
import PathBuilderService from '../services/PathBuilderService';
import ImportExportService from '../services/ImportExportService';
import pathFinderService from '../services/PathFinderService';
import { CcuPlannerContext, CcuPlannerContextType } from './useCcuPlanner';

// 提供上下文的Provider组件
interface CcuPlannerProviderProps {
  children: ReactNode;
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
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
  setAlert
}) => {
  // 从Redux获取升级和导入项
  const upgrades = useSelector(selectHangarItems);
  const importItems = useSelector(selectImportItems);
  
  // 初始化服务
  const edgeService = useMemo(() => new CcuEdgeService(), []);
  const pathBuilderService = useMemo(() => new PathBuilderService(), []);
  const importExportService = useMemo(() => new ImportExportService(), []);
  
  // 从upgrades转换为HangarItem格式
  const hangarItems: HangarItem[] = useMemo(() => upgrades.ccus.map(upgrade => ({
    id: Date.now() + Math.random(), // 生成唯一ID
    name: upgrade.name,
    type: 'ccu',
    fromShip: upgrade.parsed.from,
    toShip: upgrade.parsed.to,
    price: upgrade.value
  })), [upgrades.ccus]);
  
  // 处理路径完成状态变化
  const handlePathCompletionChange = useCallback((showAlert: boolean = true) => {
    // 如果需要显示提示
    if (showAlert) {
      setAlert({
        open: true,
        message: '路径完成状态已成功更新！',
        type: 'success'
      });
    }
  }, [setAlert]);
  
  // 显示提示的通用方法
  const showAlert = useCallback((message: string, type: "success" | "error" | "warning" = "success") => {
    setAlert({
      open: true,
      message,
      type
    });
  }, [setAlert]);
  
  // 初始化时加载已完成的路径
  useEffect(() => {
    pathFinderService.loadCompletedPathsFromStorage();
  }, []);
  
  // 组织上下文值
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
    handlePathCompletionChange,
    showAlert
  };
  
  return (
    <CcuPlannerContext.Provider value={contextValue}>
      {children}
    </CcuPlannerContext.Provider>
  );
}; 