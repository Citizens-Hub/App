import { Ccu, CcuSourceType, HangarItem, ImportItem, PriceHistoryEntity, Ship, WbHistoryData } from "../../../types";
import { IntlShape } from "react-intl";

/**
 * Strategy calculate price options interface
 */
export interface CalculatePriceOptions {
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
  hangarItems: HangarItem[];
  importItems: ImportItem[];
  customPrice?: number;
  currency?: string;
}

/**
 * CCU source type strategy interface - defines the behavior of different upgrade path types
 */
export interface CcuSourceTypeStrategy {
  // Get type ID
  getTypeId(): CcuSourceType;
  
  // Get display name
  getDisplayName(intl: IntlShape): string;
  
  // Calculate price
  calculatePrice(sourceShip: Ship, targetShip: Ship, options?: CalculatePriceOptions): {
    price: number;
    currency: string;
    isUsedUp?: boolean;
  };
  
  // Get edge style
  getEdgeStyle(): {
    edgeColor: string;
    bgColor: string;
  };
  
  // Check if applicable to specific ship combination
  isApplicable(
    sourceShip: Ship, 
    targetShip: Ship, 
    ccus: Ccu[], 
    wbHistory: WbHistoryData[], 
    hangarItems: HangarItem[],
    importItems: ImportItem[],
    priceHistoryMap: Record<number, PriceHistoryEntity>
  ): boolean;
  
  // Get auto-selection priority
  getPriority(): number;
}

/**
 * Official CCU strategy
 */
export class OfficialStrategy implements CcuSourceTypeStrategy {
  getTypeId(): CcuSourceType {
    return CcuSourceType.OFFICIAL;
  }
  
  getDisplayName(intl: IntlShape): string {
    return intl.formatMessage({ id: "shipNode.official", defaultMessage: "Official" });
  }
  
  calculatePrice(sourceShip: Ship, targetShip: Ship): { price: number; currency: string; isUsedUp?: boolean } {
    return {
      price: (targetShip.msrp - sourceShip.msrp) / 100,
      currency: 'USD',
      isUsedUp: false
    };
  }
  
  getEdgeStyle(): { edgeColor: string; bgColor: string; } {
    return {
      edgeColor: 'stroke-blue-500',
      bgColor: 'bg-blue-700'
    };
  }
  
  isApplicable(sourceShip: Ship, targetShip: Ship): boolean {
    // Official CCUs are always available as long as the source ship price is lower than the target ship price
    return sourceShip.msrp < targetShip.msrp && sourceShip.msrp !== 0 && targetShip.msrp !== 0;
  }
  
  getPriority(): number {
    return 0; // Lowest priority
  }
}

/**
 * Available WB CCU strategy
 */
export class AvailableWbStrategy implements CcuSourceTypeStrategy {
  getTypeId(): CcuSourceType {
    return CcuSourceType.AVAILABLE_WB;
  }
  
  getDisplayName(intl: IntlShape): string {
    return intl.formatMessage({ id: "shipNode.availableWB", defaultMessage: "WB" });
  }
  
  calculatePrice(sourceShip: Ship, targetShip: Ship, options?: CalculatePriceOptions): { price: number; currency: string; isUsedUp?: boolean } {
    const ccus = options?.ccus || [];
    const targetCcu = ccus.find(c => c.id === targetShip.id);
    const wbSku = targetCcu?.skus.find(sku => sku.price !== targetShip.msrp && sku.available);
    
    if (wbSku) {
      const wbPriceUSD = wbSku.price / 100;
      const sourceShipPrice = sourceShip.msrp / 100;
      const actualPrice = Math.max(0, wbPriceUSD - sourceShipPrice);
      
      return {
        price: actualPrice,
        currency: 'USD',
        isUsedUp: false
      };
    }
    
    // If WB price is not found, return official price
    return {
      price: (targetShip.msrp - sourceShip.msrp) / 100,
      currency: 'USD',
      isUsedUp: false
    };
  }
  
  getEdgeStyle(): { edgeColor: string; bgColor: string; } {
    return {
      edgeColor: 'stroke-orange-400',
      bgColor: 'bg-orange-400'
    };
  }
  
  isApplicable(sourceShip: Ship, targetShip: Ship, ccus: Ccu[]): boolean {
    const targetCcu = ccus.find(c => c.id === targetShip.id);
    const wbSku = targetCcu?.skus.find(sku => sku.price !== targetShip.msrp && sku.available);
    
    return !!wbSku && sourceShip.msrp < wbSku.price;
  }
  
  getPriority(): number {
    return 30; // Higher priority
  }
}

/**
 * Official WB CCU strategy (manual setting)
 */
export class OfficialWbStrategy implements CcuSourceTypeStrategy {
  getTypeId(): CcuSourceType {
    return CcuSourceType.OFFICIAL_WB;
  }
  
  getDisplayName(intl: IntlShape): string {
    return intl.formatMessage({ id: "shipNode.manualOfficialWB", defaultMessage: "Manual: Official WB CCU" });
  }
  
  calculatePrice(sourceShip: Ship, targetShip: Ship, options?: CalculatePriceOptions): { price: number; currency: string; isUsedUp?: boolean } {
    return {
      price: options?.customPrice || (targetShip.msrp - sourceShip.msrp) / 100,
      currency: 'USD',
      isUsedUp: false
    };
  }
  
  getEdgeStyle(): { edgeColor: string; bgColor: string; } {
    return {
      edgeColor: 'stroke-lime-500',
      bgColor: 'bg-lime-500'
    };
  }
  
  isApplicable(): boolean {
    // Official WB manual setting is always available
    return true;
  }
  
  getPriority(): number {
    return 10; // Medium priority
  }
}

/**
 * Third-party CCU strategy
 */
export class ThirdPartyStrategy implements CcuSourceTypeStrategy {
  getTypeId(): CcuSourceType {
    return CcuSourceType.THIRD_PARTY;
  }
  
  getDisplayName(intl: IntlShape): string {
    return intl.formatMessage({ id: "shipNode.manualThirdParty", defaultMessage: "Manual: Third Party CCU" });
  }
  
  calculatePrice(_sourceShip: Ship, _targetShip: Ship, options?: CalculatePriceOptions): { price: number; currency: string; isUsedUp?: boolean } {
    return {
      price: options?.customPrice || 0,
      currency: options?.currency || 'CNY',
      isUsedUp: false
    };
  }
  
  getEdgeStyle(): { edgeColor: string; bgColor: string; } {
    return {
      edgeColor: 'stroke-purple-500',
      bgColor: 'bg-purple-700'
    };
  }
  
  isApplicable(): boolean {
    // Third-party manual setting is always available
    return true;
  }
  
  getPriority(): number {
    return 20; // Medium priority
  }
}

/**
 * Hangar CCU strategy
 */
export class HangarStrategy implements CcuSourceTypeStrategy {
  getTypeId(): CcuSourceType {
    return CcuSourceType.HANGER;
  }
  
  getDisplayName(intl: IntlShape): string {
    return intl.formatMessage({ id: "shipNode.hangar", defaultMessage: "Hangar" });
  }
  
  calculatePrice(sourceShip: Ship, targetShip: Ship, options?: CalculatePriceOptions): { price: number; currency: string; isUsedUp?: boolean } {
    const hangarItems = options?.hangarItems || [];
    
    const hangarCcu = hangarItems.find(item => {
      if (item.type.toLowerCase() !== 'ccu') return false;
      
      const from = item.fromShip?.toUpperCase() || '';
      const to = item.toShip?.toUpperCase() || '';
      
      return from === sourceShip.name.trim().toUpperCase() && to === targetShip.name.trim().toUpperCase();
    });
    
    // 如果找到了机库中的CCU，检查它是否已经用完
    if (hangarCcu) {
      try {
        // 计算此CCU已经使用的数量
        const completedPaths: Array<{
          path: {
            edges: Array<{
              sourceShipId: number;
              targetShipId: number;
              sourceType: CcuSourceType;
            }>;
          };
        }> = JSON.parse(localStorage.getItem('completedPaths') || '[]');
        
        let usedCount = 0;
        completedPaths.forEach(path => {
          path.path.edges?.forEach(edge => {
            if (edge.sourceType === CcuSourceType.HANGER &&
                edge.sourceShipId === sourceShip.id &&
                edge.targetShipId === targetShip.id) {
              usedCount++;
            }
          });
        });
        
        // 从localStorage中获取CCU总数量
        const state = JSON.parse(localStorage.getItem('state') || '{}');
        const ccus = state.items?.ccus || [];
        const matchingCcu = ccus.find((ccu: { parsed?: { from?: string; to?: string } }) => {
          const parsed = ccu.parsed || {};
          return parsed.from?.toUpperCase().trim() === sourceShip.name.toUpperCase().trim() &&
                 parsed.to?.toUpperCase().trim() === targetShip.name.toUpperCase().trim();
        });
        
        // 如果已使用数量大于等于总数量，则标记CCU已用完，但仍返回正常价格
        const totalQuantity = matchingCcu?.quantity || 1;
        if (usedCount >= totalQuantity) {
          return {
            price: hangarCcu?.price || 0,
            currency: 'USD',
            isUsedUp: true
          };
        }
      } catch (error) {
        console.error('Error checking CCU usage in HangarStrategy:', error);
      }
    }
    
    return {
      price: hangarCcu?.price || 0,
      currency: 'USD',
      isUsedUp: false
    };
  }
  
  getEdgeStyle(): { edgeColor: string; bgColor: string; } {
    return {
      edgeColor: 'stroke-cyan-300',
      bgColor: 'bg-cyan-500'
    };
  }
  
  isApplicable(
    sourceShip: Ship, 
    targetShip: Ship, 
    _ccus: Ccu[], 
    _wbHistory: WbHistoryData[], 
    hangarItems: Array<{
      id: number;
      name: string;
      type: string;
      fromShip?: string;
      toShip?: string;
      price?: number;
    }>
  ): boolean {
    // 先检查是否有匹配的CCU
    const hasMatchingCcu = hangarItems.some(item => {
      if (item.type.toLowerCase() !== 'ccu') return false;
      
      const from = item.fromShip?.toUpperCase() || '';
      const to = item.toShip?.toUpperCase() || '';
      
      return from === sourceShip.name.trim().toUpperCase() && to === targetShip.name.trim().toUpperCase();
    });

    // 如果没有匹配的CCU，直接返回false
    if (!hasMatchingCcu) return false;

    // 如果有匹配的CCU，检查是否已经用完
    try {
      // 计算此CCU已经使用的数量
      const completedPaths: Array<{
        path: {
          edges: Array<{
            sourceShipId: number;
            targetShipId: number;
            sourceType: CcuSourceType;
          }>;
        };
      }> = JSON.parse(localStorage.getItem('completedPaths') || '[]');
      
      let usedCount = 0;
      completedPaths.forEach(path => {
        path.path.edges?.forEach(edge => {
          if (edge.sourceType === CcuSourceType.HANGER &&
              edge.sourceShipId === sourceShip.id &&
              edge.targetShipId === targetShip.id) {
            usedCount++;
          }
        });
      });
      
      // 从localStorage中获取CCU总数量
      const state = JSON.parse(localStorage.getItem('state') || '{}');
      const ccus = state.items?.ccus || [];
      const matchingCcu = ccus.find((ccu: { parsed?: { from?: string; to?: string }; quantity?: number }) => {
        const parsed = ccu.parsed || {};
        return parsed.from?.toUpperCase().trim() === sourceShip.name.toUpperCase().trim() &&
                parsed.to?.toUpperCase().trim() === targetShip.name.toUpperCase().trim();
      });
      
      // 如果已使用数量大于等于总数量，则表示此CCU已用完，返回false
      const totalQuantity = matchingCcu?.quantity || 1;
      return usedCount < totalQuantity;
    } catch (error) {
      console.error('Error checking CCU usage in HangarStrategy.isApplicable:', error);
      // 如果出错，保守地假设CCU可用
      return true;
    }
  }
  
  getPriority(): number {
    return 50; // Highest priority, user's own CCUs are used first
  }
}

/**
 * Historical CCU strategy
 */
export class HistoricalStrategy implements CcuSourceTypeStrategy {
  getTypeId(): CcuSourceType {
    return CcuSourceType.HISTORICAL;
  }
  
  getDisplayName(intl: IntlShape): string {
    return intl.formatMessage({ id: "shipNode.historical", defaultMessage: "Historical" });
  }
  
  calculatePrice(sourceShip: Ship, targetShip: Ship, options?: CalculatePriceOptions): { price: number; currency: string; isUsedUp?: boolean } {
    // const wbHistory = options?.wbHistory || [];
    const priceHistoryMap = options?.priceHistoryMap || {};
    const historical = priceHistoryMap[targetShip.id]?.history.find(h => h.msrp !== h.baseMsrp);
    
    if (historical) {
      const historicalPrice = Number(historical.msrp) / 100;
      const sourceShipPrice = sourceShip.msrp / 100;
      
      return {
        price: Math.max(0, historicalPrice - sourceShipPrice),
        currency: 'USD',
        isUsedUp: false
      };
    }
    
    return {
      price: (targetShip.msrp - sourceShip.msrp) / 100,
      currency: 'USD',
      isUsedUp: false
    };
  }
  
  getEdgeStyle(): { edgeColor: string; bgColor: string; } {
    return {
      edgeColor: 'stroke-gray-500',
      bgColor: 'bg-gray-500'
    };
  }
  
  isApplicable(sourceShip: Ship, targetShip: Ship, _ccus: Ccu[], _wbHistory: WbHistoryData[], _hangarItems: HangarItem[], _importItems: ImportItem[], priceHistoryMap: Record<number, PriceHistoryEntity>): boolean {
    // const historical = wbHistory.find(wb => 
    //   wb.name.trim().toUpperCase() === targetShip.name.trim().toUpperCase() && 
    //   wb.price !== ''
    // );

    const historical = priceHistoryMap[targetShip.id]?.history.find(h => h.msrp !== h.baseMsrp);
    
    return !!historical && Number(historical.msrp) / 100 > sourceShip.msrp / 100;
  }
  
  getPriority(): number {
    return 40; // Higher priority
  }
}

/**
 * Subscription CCU strategy
 */
export class SubscriptionStrategy implements CcuSourceTypeStrategy {
  getTypeId(): CcuSourceType {
    return CcuSourceType.SUBSCRIPTION;
  }
  
  getDisplayName(intl: IntlShape): string {
    return intl.formatMessage({ id: "shipNode.subscription", defaultMessage: "Subscription" });
  }
  
  calculatePrice(sourceShip: Ship, targetShip: Ship, options?: CalculatePriceOptions): { price: number; currency: string; isUsedUp?: boolean } {
    const importItems = options?.importItems || [];
    // console.log('importItems', importItems)
    const subscriptionCcu = importItems.find(item => {
      return item.from === sourceShip.id && item.to === targetShip.id;
    });
    console.log('subscriptionCcu', subscriptionCcu)
    return {
      price: subscriptionCcu?.price || 0,
      currency: subscriptionCcu?.currency || 'USD',
      isUsedUp: false
    };
  }
  
  getEdgeStyle(): { edgeColor: string; bgColor: string; } {
    return {
      edgeColor: 'stroke-green-400',
      bgColor: 'bg-green-600'
    };
  }
  
  isApplicable(
    sourceShip: Ship, 
    targetShip: Ship, 
    _ccus: Ccu[], 
    _wbHistory: WbHistoryData[],
    _hangarItems: HangarItem[],
    importItems: ImportItem[]
  ): boolean {
    // console.log('importItems', importItems)
    const match = importItems.some(item => {
      return item.from === sourceShip.id && item.to === targetShip.id;
    });

    return match;
  }
  
  getPriority(): number {
    return 60; // 比Hangar策略更高的优先级
  }
}