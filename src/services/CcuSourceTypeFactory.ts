import { Ccu, CcuSourceType, Ship, WbHistoryData } from "../types";
import { 
  CcuSourceTypeStrategy, 
  OfficialStrategy,
  AvailableWbStrategy,
  OfficialWbStrategy,
  ThirdPartyStrategy,
  HangarStrategy,
  HistoricalStrategy
} from "./CcuSourceTypeStrategy";
import { store } from "../store";

// Define the interface type for hangarItems
export interface HangarItem {
  id: number;
  name: string;
  type: string;
  fromShip?: string;
  toShip?: string;
  price?: number;
}

/**
 * CCU source type strategy factory
 * Responsible for managing and providing different CCU source type strategies
 */
export class CcuSourceTypeStrategyFactory {
  private static instance: CcuSourceTypeStrategyFactory;
  private strategies: Map<CcuSourceType, CcuSourceTypeStrategy> = new Map();
  private preferredType: CcuSourceType | null = null;
  
  private constructor() {
    // Register all strategies
    this.registerStrategy(new OfficialStrategy());
    this.registerStrategy(new AvailableWbStrategy());
    this.registerStrategy(new OfficialWbStrategy());
    this.registerStrategy(new ThirdPartyStrategy());
    this.registerStrategy(new HangarStrategy());
    this.registerStrategy(new HistoricalStrategy());
  }
  
  /**
   * Get factory instance
   */
  public static getInstance(): CcuSourceTypeStrategyFactory {
    if (!CcuSourceTypeStrategyFactory.instance) {
      CcuSourceTypeStrategyFactory.instance = new CcuSourceTypeStrategyFactory();
    }
    
    return CcuSourceTypeStrategyFactory.instance;
  }
  
  /**
   * Register a new strategy
   */
  public registerStrategy(strategy: CcuSourceTypeStrategy): void {
    this.strategies.set(strategy.getTypeId(), strategy);
  }
  
  /**
   * Get strategy by type
   */
  public getStrategy(type: CcuSourceType): CcuSourceTypeStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(`Unregistered CCU source type strategy: ${type}`);
    }
    return strategy;
  }
  
  /**
   * Get all strategies
   */
  public getAllStrategies(): CcuSourceTypeStrategy[] {
    return Array.from(this.strategies.values());
  }
  
  /**
   * Get a list of strategies applicable to the given ships
   */
  public getApplicableStrategies(
    sourceShip: Ship, 
    targetShip: Ship, 
    ccus: Ccu[], 
    wbHistory: WbHistoryData[], 
    hangarItems: HangarItem[]
  ): CcuSourceTypeStrategy[] {
    return Array.from(this.strategies.values())
      .filter(strategy => 
        strategy.isApplicable(sourceShip, targetShip, ccus, wbHistory, hangarItems)
      );
  }
  
  /**
   * Automatically select the most suitable strategy
   */
  public getAutomaticStrategy(
    sourceShip: Ship, 
    targetShip: Ship, 
    ccus: Ccu[], 
    wbHistory: WbHistoryData[], 
    hangarItems: HangarItem[]
  ): CcuSourceTypeStrategy {
    // Get all applicable strategies
    const applicableStrategies = this.getApplicableStrategies(
      sourceShip, 
      targetShip, 
      ccus, 
      wbHistory, 
      hangarItems
    );
    
    if (applicableStrategies.length === 0) {
      // If no applicable strategy, return the official strategy
      return this.getStrategy(CcuSourceType.OFFICIAL);
    }
    
    // If there is a preferred type and it is applicable, use the preferred type
    if (this.preferredType) {
      const preferredStrategy = applicableStrategies.find(
        strategy => strategy.getTypeId() === this.preferredType
      );
      
      if (preferredStrategy) {
        return preferredStrategy;
      }
    }
    
    // Get the priority order from Redux store
    const priorityOrder = store.getState().upgrades.ccuSourceTypePriority;
    
    // Sort strategies based on their position in the priority array 
    // (lower index = higher priority)
    if (priorityOrder && priorityOrder.length > 0) {
      applicableStrategies.sort((a, b) => {
        const indexA = priorityOrder.indexOf(a.getTypeId());
        const indexB = priorityOrder.indexOf(b.getTypeId());
        
        // If either type is not in the priority list, use the strategy's internal priority
        if (indexA === -1 && indexB === -1) {
          return b.getPriority() - a.getPriority();
        }
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        
        // Lower index = higher priority
        return indexA - indexB;
      });
    } else {
      // Fall back to the strategy's internal priority
      applicableStrategies.sort((a, b) => b.getPriority() - a.getPriority());
    }
    
    return applicableStrategies[0];
  }
  
  /**
   * Set preferred type
   */
  public setPreferredType(type: CcuSourceType | null): void {
    this.preferredType = type;
  }
  
  /**
   * Get current preferred type
   */
  public getPreferredType(): CcuSourceType | null {
    return this.preferredType;
  }
} 