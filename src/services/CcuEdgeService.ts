import { Ccu, CcuEdgeData, CcuSourceType, Ship, WbHistoryData } from "../types";
import { CcuSourceTypeStrategyFactory, HangarItem } from "./CcuSourceTypeFactory";

export interface CcuEdgeCreationOptions {
  sourceShip: Ship;
  targetShip: Ship;
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  hangarItems: HangarItem[];
}

/**
 * CCU边服务 - 处理CCU边缘的创建和更新
 */
export class CcuEdgeService {
  private factory: CcuSourceTypeStrategyFactory;
  
  constructor() {
    this.factory = CcuSourceTypeStrategyFactory.getInstance();
  }
  
  /**
   * 创建新的CCU边数据
   */
  public createEdgeData(options: CcuEdgeCreationOptions): CcuEdgeData {
    const { sourceShip, targetShip, ccus, wbHistory, hangarItems } = options;
    
    // 计算基本价格差异
    const priceDifference = targetShip.msrp - sourceShip.msrp;
    
    // 自动选择最合适的策略
    const strategy = this.factory.getAutomaticStrategy(
      sourceShip, 
      targetShip, 
      ccus, 
      wbHistory, 
      hangarItems
    );
    
    // 使用策略计算价格
    const priceInfo = strategy.calculatePrice(sourceShip, targetShip, { 
      ccus, 
      wbHistory, 
      hangarItems 
    });
    
    // 创建边数据
    const edgeData: CcuEdgeData = {
      price: priceDifference,
      sourceShip,
      targetShip,
      sourceType: strategy.getTypeId(),
    };

    if (strategy.getTypeId() !== CcuSourceType.OFFICIAL) {
      edgeData.customPrice = priceInfo.price;
    } else {
      edgeData.customPrice = priceDifference / 100;
    }
    
    return edgeData;
  }
  
  /**
   * 验证两个船舶之间是否可以创建CCU边
   */
  public canCreateEdge(sourceShip: Ship, targetShip: Ship): boolean {
    // 不能从价格为0的船升级
    if (sourceShip.msrp === 0) {
      return false;
    }
    
    // 只能从低价船升级到高价船
    if (sourceShip.msrp >= targetShip.msrp && targetShip.msrp !== 0) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 更新现有边的数据
   */
  public updateEdgeData(
    originalData: CcuEdgeData, 
    sourceType: CcuSourceType, 
    customPrice?: number
  ): CcuEdgeData {
    const sourceShip = originalData.sourceShip;
    const targetShip = originalData.targetShip;
    
    if (!sourceShip || !targetShip) {
      return originalData;
    }
    
    // 获取与源类型对应的策略
    const strategy = this.factory.getStrategy(sourceType);
    
    const updatedData: CcuEdgeData = {
      ...originalData,
      sourceType
    };
    
    // 如果提供了自定义价格，使用它
    if (customPrice !== undefined) {
      updatedData.customPrice = customPrice;
    } 
    // 否则尝试使用策略计算价格
    else {
      const priceInfo = strategy.calculatePrice(sourceShip, targetShip);
      if (priceInfo.price !== originalData.price / 100) {
        updatedData.customPrice = priceInfo.price;
      } else {
        delete updatedData.customPrice;
      }
    }
    
    return updatedData;
  }
} 