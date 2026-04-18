import { Ccu, CcuEdgeData, CcuSourceType, PriceHistoryEntity, Ship, WbHistoryData } from "../../../types";
import { CcuSourceTypeStrategyFactory, HangarItem, ImportItem } from "./CcuSourceTypeFactory";
import { CcuConcretePricingOption, getPreferredConcretePricingOption } from "./CcuPriceOptions";

export interface CcuEdgeCreationOptions {
  sourceShip: Ship;
  targetShip: Ship;
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  hangarItems: HangarItem[];
  importItems: ImportItem[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
}

export type CcuEdgePriceContext = Pick<
  CcuEdgeCreationOptions,
  'ccus' | 'wbHistory' | 'hangarItems' | 'importItems' | 'priceHistoryMap'
> & {
  currency?: string;
};

export interface CcuEdgeUpdateOptions {
  sourceType: CcuSourceType;
  customPrice?: number;
  selectedOption?: CcuConcretePricingOption;
}

/**
 * CCU Edge Service - handles the creation and update of CCU edges
 */
export class CcuEdgeService {
  private factory: CcuSourceTypeStrategyFactory;
  
  constructor() {
    this.factory = CcuSourceTypeStrategyFactory.getInstance();
  }

  private applyConcretePricingOption(
    edgeData: CcuEdgeData,
    sourceType: CcuSourceType,
    selectedOption?: CcuConcretePricingOption
  ): void {
    edgeData.sourceType = sourceType;

    if (!selectedOption) {
      delete edgeData.selectedTargetPriceCents;
      delete edgeData.selectedSourcePriceCents;
      delete edgeData.validityWindows;
      return;
    }

    edgeData.customPrice = selectedOption.customPrice;

    if (selectedOption.targetPriceCents !== undefined) {
      edgeData.selectedTargetPriceCents = selectedOption.targetPriceCents;
    } else {
      delete edgeData.selectedTargetPriceCents;
    }

    if (selectedOption.sourcePriceCents !== undefined) {
      edgeData.selectedSourcePriceCents = selectedOption.sourcePriceCents;
    } else {
      delete edgeData.selectedSourcePriceCents;
    }

    if (selectedOption.validityWindows?.length) {
      edgeData.validityWindows = selectedOption.validityWindows;
    } else {
      delete edgeData.validityWindows;
    }
  }

  private getPreferredConcreteOption(
    sourceType: CcuSourceType,
    sourceShip: Ship,
    targetShip: Ship,
    priceContext: CcuEdgePriceContext
  ): CcuConcretePricingOption | undefined {
    return getPreferredConcretePricingOption({
      sourceType,
      sourceShip,
      targetShip,
      ccus: priceContext.ccus,
      priceHistoryMap: priceContext.priceHistoryMap
    });
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
    const sourceType = strategy.getTypeId();
    const edgeData: CcuEdgeData = {
      price: priceDifference,
      sourceShip,
      targetShip,
      sourceType,
      // ccus,
      // wbHistory,
      // hangarItems,
      // importItems,
      // priceHistoryMap
    };
    const priceContext = {
      ccus,
      wbHistory,
      hangarItems,
      importItems,
      priceHistoryMap
    };
    const selectedOption = this.getPreferredConcreteOption(sourceType, sourceShip, targetShip, priceContext);
    this.applyConcretePricingOption(edgeData, sourceType, selectedOption);

    if (!selectedOption) {
      const priceInfo = strategy.calculatePrice(sourceShip, targetShip, priceContext);
      edgeData.customPrice = priceInfo.price;
    }
    
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
    update: CcuEdgeUpdateOptions,
    priceContext?: CcuEdgePriceContext
  ): CcuEdgeData {
    const { sourceType, customPrice, selectedOption } = update;
    const sourceShip = originalData.sourceShip;
    const targetShip = originalData.targetShip;
    
    if (!sourceShip || !targetShip) {
      return originalData;
    }

    const officialPrice = (targetShip.msrp - sourceShip.msrp) / 100;
    
    // Get the strategy corresponding to the source type
    const strategy = this.factory.getStrategy(sourceType);
    
    const updatedData: CcuEdgeData = { ...originalData };
    
    // If a custom price is provided, use it
    if (customPrice !== undefined) {
      this.applyConcretePricingOption(updatedData, sourceType);
      updatedData.customPrice = customPrice;
    } 
    else if (selectedOption) {
      this.applyConcretePricingOption(updatedData, sourceType, selectedOption);
    }
    // Otherwise, try to use the strategy to calculate the price
    else {
      this.applyConcretePricingOption(updatedData, sourceType);
      const preferredOption = priceContext
        ? this.getPreferredConcreteOption(sourceType, sourceShip, targetShip, priceContext)
        : undefined;

      if (preferredOption) {
        this.applyConcretePricingOption(updatedData, sourceType, preferredOption);
        return updatedData;
      }

      const priceInfo = strategy.calculatePrice(sourceShip, targetShip, {
        ccus: priceContext?.ccus || [],
        wbHistory: priceContext?.wbHistory || [],
        hangarItems: priceContext?.hangarItems || [],
        importItems: priceContext?.importItems || [],
        priceHistoryMap: priceContext?.priceHistoryMap || {},
        currency: priceContext?.currency
      });

      if (priceInfo.price !== officialPrice) {
        updatedData.customPrice = priceInfo.price;
      } else {
        delete updatedData.customPrice;
      }
    }
    
    return updatedData;
  }
} 
