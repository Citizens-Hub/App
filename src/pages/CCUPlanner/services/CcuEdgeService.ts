import { Ccu, CcuEdgeData, CcuSourceType, PriceHistoryEntity, Ship, WbHistoryData } from "../../../types";
import { CcuSourceTypeStrategyFactory, HangarItem, ImportItem } from "./CcuSourceTypeFactory";

export interface CcuEdgeCreationOptions {
  sourceShip: Ship;
  targetShip: Ship;
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  hangarItems: HangarItem[];
  importItems: ImportItem[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
}

/**
 * CCU Edge Service - handles the creation and update of CCU edges
 */
export class CcuEdgeService {
  private factory: CcuSourceTypeStrategyFactory;
  
  constructor() {
    this.factory = CcuSourceTypeStrategyFactory.getInstance();
  }
  
  /**
   * Create new CCU Edge
   */
  public createEdgeData(options: CcuEdgeCreationOptions): CcuEdgeData {
    const { sourceShip, targetShip, ccus, wbHistory, hangarItems, importItems, priceHistoryMap } = options;
    
    const priceDifference = targetShip.msrp - sourceShip.msrp;
    
    const strategy = this.factory.getAutomaticStrategy(
      sourceShip, 
      targetShip, 
      ccus, 
      wbHistory, 
      hangarItems,
      importItems,
      priceHistoryMap
    );
    
    const priceInfo = strategy.calculatePrice(sourceShip, targetShip, { 
      ccus, 
      wbHistory, 
      hangarItems,
      importItems,
      priceHistoryMap
    });
    
    const edgeData: CcuEdgeData = {
      price: priceDifference,
      sourceShip,
      targetShip,
      sourceType: strategy.getTypeId(),
      // ccus,
      // wbHistory,
      // hangarItems,
      // importItems,
      // priceHistoryMap
    };

    edgeData.customPrice = priceInfo.price;
    
    return edgeData;
  }
  
  /**
   * Verify if two ships can create a CCU edge
   */
  public canCreateEdge(sourceShip: Ship, targetShip: Ship): boolean {
    // Cannot upgrade from a ship with a price of 0
    if (sourceShip.msrp === 0) {
      return false;
    }
    
    // Can only upgrade from a ship with a lower price to a ship with a higher price
    if (sourceShip.msrp >= targetShip.msrp && targetShip.msrp !== 0) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Update existing edge data
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
    
    // Get the strategy corresponding to the source type
    const strategy = this.factory.getStrategy(sourceType);
    
    const updatedData: CcuEdgeData = {
      ...originalData,
      sourceType
    };
    
    // If a custom price is provided, use it
    if (customPrice !== undefined) {
      updatedData.customPrice = customPrice;
    } 
    // Otherwise, try to use the strategy to calculate the price
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