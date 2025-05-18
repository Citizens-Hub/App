import { Ccu, CcuSourceType, Ship, WbHistoryData } from "../types";
import { IntlShape } from "react-intl";

/**
 * Strategy calculate price options interface
 */
export interface CalculatePriceOptions {
  ccus?: Ccu[];
  wbHistory?: WbHistoryData[];
  hangarItems?: Array<{
    id: number;
    name: string;
    type: string;
    fromShip?: string;
    toShip?: string;
    price?: number;
  }>;
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
    hangarItems: Array<{
      id: number;
      name: string;
      type: string;
      fromShip?: string;
      toShip?: string;
      price?: number;
    }>
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
  
  calculatePrice(sourceShip: Ship, targetShip: Ship): { price: number; currency: string; } {
    return {
      price: targetShip.msrp - sourceShip.msrp,
      currency: 'USD'
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
  
  calculatePrice(sourceShip: Ship, targetShip: Ship, options?: CalculatePriceOptions): { price: number; currency: string; } {
    const ccus = options?.ccus || [];
    const targetCcu = ccus.find(c => c.id === targetShip.id);
    const wbSku = targetCcu?.skus.find(sku => sku.price !== targetShip.msrp && sku.available);
    
    if (wbSku) {
      const wbPriceUSD = wbSku.price / 100;
      const sourceShipPrice = sourceShip.msrp / 100;
      const actualPrice = Math.max(0, wbPriceUSD - sourceShipPrice);
      
      return {
        price: actualPrice,
        currency: 'USD'
      };
    }
    
    // If WB price is not found, return official price
    return {
      price: (targetShip.msrp - sourceShip.msrp) / 100,
      currency: 'USD'
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
  
  calculatePrice(sourceShip: Ship, targetShip: Ship, options?: CalculatePriceOptions): { price: number; currency: string; } {
    return {
      price: options?.customPrice || (targetShip.msrp - sourceShip.msrp) / 100,
      currency: 'USD'
    };
  }
  
  getEdgeStyle(): { edgeColor: string; bgColor: string; } {
    return {
      edgeColor: 'stroke-red-500',
      bgColor: 'bg-red-600'
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
  
  calculatePrice(_sourceShip: Ship, _targetShip: Ship, options?: CalculatePriceOptions): { price: number; currency: string; } {
    return {
      price: options?.customPrice || 0,
      currency: options?.currency || 'CNY'
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
  
  calculatePrice(sourceShip: Ship, targetShip: Ship, options?: CalculatePriceOptions): { price: number; currency: string; } {
    const hangarItems = options?.hangarItems || [];
    
    const hangarCcu = hangarItems.find(item => {
      if (item.type !== 'ccu') return false;
      
      const from = item.fromShip?.toUpperCase() || '';
      const to = item.toShip?.toUpperCase() || '';
      
      return from === sourceShip.name.trim().toUpperCase() && to === targetShip.name.trim().toUpperCase();
    });
    
    return {
      price: hangarCcu?.price || 0,
      currency: 'USD'
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
    return hangarItems.some(item => {
      if (item.type !== 'ccu') return false;
      
      const from = item.fromShip?.toUpperCase() || '';
      const to = item.toShip?.toUpperCase() || '';
      
      return from === sourceShip.name.trim().toUpperCase() && to === targetShip.name.trim().toUpperCase();
    });
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
  
  calculatePrice(sourceShip: Ship, targetShip: Ship, options?: CalculatePriceOptions): { price: number; currency: string; } {
    const wbHistory = options?.wbHistory || [];
    
    const historical = wbHistory.find(wb => 
      wb.name.trim().toUpperCase() === targetShip.name.trim().toUpperCase() && 
      wb.price !== ''
    );
    
    if (historical) {
      const historicalPrice = Number(historical.price);
      const sourceShipPrice = sourceShip.msrp / 100;
      
      return {
        price: Math.max(0, historicalPrice - sourceShipPrice),
        currency: 'USD'
      };
    }
    
    return {
      price: (targetShip.msrp - sourceShip.msrp) / 100,
      currency: 'USD'
    };
  }
  
  getEdgeStyle(): { edgeColor: string; bgColor: string; } {
    return {
      edgeColor: 'stroke-gray-500',
      bgColor: 'bg-gray-500'
    };
  }
  
  isApplicable(sourceShip: Ship, targetShip: Ship, _ccus: Ccu[], wbHistory: WbHistoryData[]): boolean {
    const historical = wbHistory.find(wb => 
      wb.name.trim().toUpperCase() === targetShip.name.trim().toUpperCase() && 
      wb.price !== ''
    );
    
    return !!historical && Number(historical.price) > sourceShip.msrp / 100;
  }
  
  getPriority(): number {
    return 40; // Higher priority
  }
} 