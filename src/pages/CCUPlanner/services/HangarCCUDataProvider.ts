import { HangarItem } from "./CcuSourceTypeFactory";

/**
 * 机库CCU数据提供者类
 * 用于处理和提供机库CCU的数据，包括价格信息
 */
export class HangarCCUDataProvider {
  private static instance: HangarCCUDataProvider;
  private hangarItems: HangarItem[] = [];
  
  // 硬编码的机库CCU价格映射，用于处理特殊情况
  private specialPriceMapping: Record<string, number> = {
    "Zeus Mk II ES_Constellation Taurus": 10  // Zeus Mk II ES 到 Constellation Taurus的机库升级价格为$10
  };

  private constructor() {
    // 初始化时从localStorage或其他来源加载数据
    this.loadHangarItems();
  }

  public static getInstance(): HangarCCUDataProvider {
    if (!HangarCCUDataProvider.instance) {
      HangarCCUDataProvider.instance = new HangarCCUDataProvider();
    }
    return HangarCCUDataProvider.instance;
  }

  /**
   * 设置机库物品数据
   */
  public setHangarItems(items: HangarItem[]): void {
    this.hangarItems = items;
    // 保存到localStorage
    this.saveHangarItems();
  }

  /**
   * 获取机库物品数据
   */
  public getHangarItems(): HangarItem[] {
    return this.hangarItems;
  }

  /**
   * 根据源船和目标船获取机库CCU价格
   */
  public getHangarCCUPrice(sourceShipName: string, targetShipName: string): number | undefined {
    // 尝试从硬编码的特殊价格映射中获取
    const specialPriceKey = `${sourceShipName}_${targetShipName}`;
    if (this.specialPriceMapping[specialPriceKey] !== undefined) {
      return this.specialPriceMapping[specialPriceKey];
    }
    
    // 尝试从机库物品数据中获取
    const hangarCcu = this.hangarItems.find(item => {
      if (item.type !== 'ccu') return false;
      
      const from = item.fromShip?.toUpperCase() || '';
      const to = item.toShip?.toUpperCase() || '';
      
      return from === sourceShipName.trim().toUpperCase() && to === targetShipName.trim().toUpperCase();
    });
    
    return hangarCcu?.price;
  }

  /**
   * 添加特殊价格映射
   */
  public addSpecialPriceMapping(sourceShipName: string, targetShipName: string, price: number): void {
    this.specialPriceMapping[`${sourceShipName}_${targetShipName}`] = price;
  }

  /**
   * 从localStorage加载机库物品数据
   */
  private loadHangarItems(): void {
    try {
      const storedItems = localStorage.getItem('hangarItems');
      if (storedItems) {
        this.hangarItems = JSON.parse(storedItems);
      }
    } catch (error) {
      console.error('Failed to load hangar items from storage:', error);
      this.hangarItems = [];
    }
  }

  /**
   * 保存机库物品数据到localStorage
   */
  private saveHangarItems(): void {
    try {
      localStorage.setItem('hangarItems', JSON.stringify(this.hangarItems));
    } catch (error) {
      console.error('Failed to save hangar items to storage:', error);
    }
  }
} 