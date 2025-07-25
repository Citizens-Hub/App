import { Edge, Node } from 'reactflow';
import { Ccu, CcuEdgeData, CcuSourceType, ImportItem, Ship, WbHistoryData } from '../../../types';
import { CcuSourceTypeStrategyFactory, HangarItem } from './CcuSourceTypeFactory';

interface PathNode {
  nodeId: string;
  ship: Partial<Ship>;
}

interface PathEdge {
  edge: Edge<CcuEdgeData>;
  sourceNode: Node;
  targetNode: Node;
}

// 在String.prototype上扩展getNodeShipId方法
declare global {
  interface String {
    getNodeShipId(): string;
  }
}

export interface CompletePath {
  path: PathNode[];
  edges: PathEdge[];
  totalUsdPrice: number;
  totalThirdPartyPrice: number;
  hasUsdPricing: boolean;
  hasCnyPricing: boolean;
  startNodeId: string;
}

// 新增已完成路径接口
export interface CompletedPath {
  pathId: string;  // 唯一标识符
  ship: Partial<Ship>;      // 完成到的船只
  path: CompletePath; // 完整路径信息
}

// 新增：添加边的识别信息接口
export interface EdgeIdentifier {
  sourceShipId: string;
  targetShipId: string;
}

// 修改： 创建更具体的边标识类型，包含边的类型和价格信息
export interface DetailedEdgeIdentifier {
  sourceShipId: string;
  targetShipId: string;
  sourceType: CcuSourceType;
  price: number;  // 使用边的价格作为区分相同起点终点的标识
}

// 新增：用于存储的简化路径接口
export interface StoredCompletedPath {
  pathId: string;
  shipId: number;
  shipName: string;
  shipMsrp: number;
  path: {
    startNodeId: string;
    nodes: {
      nodeId: string;
      shipId: number;
      shipName: string;
      shipMsrp: number;
    }[];
    edges: {
      sourceShipId: number;
      targetShipId: number;
      sourceType: CcuSourceType;
      price: number;
    }[];
    totalUsdPrice: number;
    totalThirdPartyPrice: number;
    hasUsdPricing: boolean;
    hasCnyPricing: boolean;
  };
}

export class PathFinderService {
  private nodeBestCost: Record<string, number> = {};
  // 已完成的路径存储
  private completedPaths: CompletedPath[] = [];
  
  /**
   * Find all possible starting nodes (nodes with no incoming edges)
   */
  findStartNodes(edges: Edge[], nodes: Node[]): Node[] {
    const nodesWithIncomingEdges = new Set(edges.map(edge => edge.target));
    return nodes.filter(node => !nodesWithIncomingEdges.has(node.id));
  }

  /**
   * Get price and currency based on different source types
   */
  getPriceInfo(edge: Edge<CcuEdgeData>, data: { ccus: Ccu[], wbHistory: WbHistoryData[], hangarItems: HangarItem[], importItems: ImportItem[] }): { usdPrice: number; tpPrice: number; isUsedUp?: boolean } {
    if (!edge.data) return { usdPrice: 0, tpPrice: 0 };

    const sourceType = edge.data.sourceType || CcuSourceType.OFFICIAL;
    const strategyFactory = CcuSourceTypeStrategyFactory.getInstance();
    const strategy = strategyFactory.getStrategy(sourceType);
    
    // 使用edge中保存的源船和目标船信息
    const sourceShip = edge.data.sourceShip;
    const targetShip = edge.data.targetShip;
    
    if (!sourceShip || !targetShip) {
      return { usdPrice: 0, tpPrice: 0 };
    }
    
    const priceResult = strategy.calculatePrice(sourceShip, targetShip, {
      customPrice: edge.data.customPrice,
      ccus: data.ccus,
      wbHistory: data.wbHistory,
      hangarItems: data.hangarItems,
      importItems: data.importItems
    }) as { price: number; currency: string; isUsedUp?: boolean };
    
    // 根据货币类型分配价格
    let usdPrice = 0;
    let tpPrice = 0;
    
    if (priceResult.currency === 'USD') {
      usdPrice = priceResult.price;
    } else {
      tpPrice = priceResult.price;
    }
    
    // 传递isUsedUp标志
    return { 
      usdPrice, 
      tpPrice, 
      isUsedUp: priceResult.isUsedUp
    };
  }

  /**
   * Calculate the converted value of the cost
   */
  calculateTotalCost(usdPrice: number, thirdPartyPrice: number, exchangeRate: number, conciergeValue: string): number {
    const conciergeMultiplier = 1 + parseFloat(conciergeValue || "0");
    return usdPrice * exchangeRate + thirdPartyPrice * conciergeMultiplier;
  }

  /**
   * Find all possible paths from the starting node to the selected node
   */
  findAllPaths(
    startNode: Node,
    endNodeId: string,
    edges: Edge[],
    nodes: Node[],
    exchangeRate: number,
    conciergeValue: string,
    pruneOpt: boolean,
    visited = new Set<string>(),
    currentPath: string[] = [],
    allPaths: string[][] = [],
    currentUsdCost = 0,
    currentThirdPartyCost = 0,
    data: { ccus: Ccu[], wbHistory: WbHistoryData[], hangarItems: HangarItem[], importItems: ImportItem[] }
  ): string[][] {
    currentPath.push(startNode.id);
    visited.add(startNode.id);

    const totalCost = this.calculateTotalCost(currentUsdCost, currentThirdPartyCost, exchangeRate, conciergeValue);

    // If this node already has a lower cost record, prune
    if (pruneOpt && this.nodeBestCost[startNode.id] !== undefined && totalCost >= this.nodeBestCost[startNode.id]) {
      return allPaths;
    }

    this.nodeBestCost[startNode.id] = totalCost;

    // If the ship ID of the reached node is the same as the ship ID of the target node, add the current path to all paths
    if (startNode.id.getNodeShipId() === endNodeId.getNodeShipId()) {
      allPaths.push([...currentPath]);
    } else {
      const outgoingEdges = edges.filter(edge => edge.source.getNodeShipId() === startNode.id.getNodeShipId());

      for (const edge of outgoingEdges) {
        const targetNode = nodes.find(node => node.id === edge.target);
        if (targetNode && !visited.has(targetNode.id)) {
          const priceInfo = this.getPriceInfo(edge as Edge<CcuEdgeData>, {
            ccus: data.ccus,
            wbHistory: data.wbHistory,
            hangarItems: data.hangarItems,
            importItems: data.importItems
          });

          // 跳过使用已用完CCU的边，除非该边属于已完成的路径
          if (priceInfo.isUsedUp) {
            // 检查该边是否属于某个已完成的路径
            const sourceShipId = edge.data?.sourceShip?.id;
            const targetShipId = edge.data?.targetShip?.id;
            
            if (sourceShipId && targetShipId) {
              // 对于已用完的CCU，我们需要检查它是否在已完成的路径中
              const isInCompletedPath = this.isSingleEdgeInAnyCompletedPath(edge as Edge<CcuEdgeData>);
              
              // 如果该边不属于任何已完成的路径，则跳过它
              if (!isInCompletedPath) {
                continue;
              }
              // 否则继续处理这条边
            } else {
              // 如果边没有完整信息，跳过它
              continue;
            }
          }

          this.findAllPaths(
            targetNode,
            endNodeId,
            edges,
            nodes,
            exchangeRate,
            conciergeValue,
            pruneOpt,
            new Set(visited),
            [...currentPath],
            allPaths,
            currentUsdCost + priceInfo.usdPrice,
            currentThirdPartyCost + priceInfo.tpPrice,
            data
          );
        }
      }
    }

    return allPaths;
  }

  /**
   * 将节点ID路径转换为完整的路径对象
   */
  buildCompletePaths(
    pathIds: string[][],
    edges: Edge<CcuEdgeData>[],
    nodes: Node[],
    startShipPrices: Record<string, number | string>,
    data: { ccus: Ccu[], wbHistory: WbHistoryData[], hangarItems: HangarItem[], importItems: ImportItem[] }
  ): CompletePath[] {
    return pathIds.map(pathId => {
      const pathNodes: PathNode[] = pathId.map(id => {
        const node = nodes.find(n => n.id === id);
        return {
          nodeId: id,
          ship: node?.data?.ship as Ship
        };
      });

      const pathEdges: PathEdge[] = [];
      let totalUsdPrice = 0;
      let totalThirdPartyPrice = 0;
      let hasUsdPricing = false;
      let hasCnyPricing = false;

      // Add the starting ship's price (if there is a custom price)
      const startNodeId = pathId[0];
      const customStartPrice = Number(startShipPrices[startNodeId] || "0");
      if (customStartPrice > 0) {
        totalUsdPrice += customStartPrice;
        hasUsdPricing = true;
      }

      for (let i = 0; i < pathId.length - 1; i++) {
        const edge = edges.find(e => e.source.getNodeShipId() === pathId[i].getNodeShipId() && e.target === pathId[i + 1]);

        if (edge) {
          const sourceNode = nodes.find(n => n.id === pathId[i])!;
          const targetNode = nodes.find(n => n.id === pathId[i + 1])!;

          pathEdges.push({
            edge,
            sourceNode,
            targetNode
          });

          const { usdPrice, tpPrice } = this.getPriceInfo(edge, {
            ccus: data.ccus,
            wbHistory: data.wbHistory,
            hangarItems: data.hangarItems,
            importItems: data.importItems
          });
          totalUsdPrice += usdPrice;
          totalThirdPartyPrice += tpPrice;

          if (edge.data?.sourceType === CcuSourceType.THIRD_PARTY) {
            hasCnyPricing = true;
          } else {
            hasUsdPricing = true;
          }
        }
      }

      return {
        path: pathNodes,
        edges: pathEdges,
        totalUsdPrice,
        totalThirdPartyPrice,
        hasUsdPricing,
        hasCnyPricing,
        startNodeId: pathId[0]
      };
    });
  }

  /**
   * 重置节点最小成本记录
   */
  resetNodeBestCost(): void {
    this.nodeBestCost = {};
  }

  /**
   * 新增：标记路径为已完成
   */
  markPathAsCompleted(path: CompletePath, completedShip: Ship): void {
    const pathId = `path-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.completedPaths.push({
      pathId,
      ship: completedShip,
      path
    });
    
    // 存储到本地存储以便在会话之间保留
    this.saveCompletedPathsToStorage();
  }

  /**
   * 新增：取消标记路径为已完成
   */
  unmarkCompletedPath(pathId: string): void {
    this.completedPaths = this.completedPaths.filter(p => p.pathId !== pathId);
    this.saveCompletedPathsToStorage();
  }

  /**
   * 判断指定的边是否属于已完成路径
   * @param sourceShipId 源船只ID
   * @param targetShipId 目标船只ID
   * @param edge 边信息（可选）
   * @param currentCompletePath 当前正在检查的完整路径（可选）
   * @returns 是否已完成
   */
  isEdgeCompleted(sourceShipId: string, targetShipId: string, edge?: Edge<CcuEdgeData>, currentCompletePath?: CompletePath): boolean {
    // 如果未传入当前路径信息，则该边未完成
    if (!currentCompletePath) {
      return false;
    }
    
    // 如果未传入边信息，则该边未完成
    if (!edge || !edge.data) {
      return false;
    }
    
    // 检查当前边是否属于某个已完成的路径
    // 并且当前检查的路径也匹配这个已完成路径
    for (const completedPath of this.completedPaths) {
      // 检查当前路径是否与已完成路径匹配（起点和终点）
      const isPathMatch = completedPath.path.startNodeId === currentCompletePath.startNodeId && 
                         edge.data?.targetShip && completedPath.ship.id === edge.data.targetShip.id;
      
      if (isPathMatch) {
        // 检查当前边是否是已完成路径中的边
        const isEdgeInCompletedPath = completedPath.path.edges.some(pathEdge => {
          if (!pathEdge.edge.data || !pathEdge.edge.data.sourceShip || !pathEdge.edge.data.targetShip) {
            return false;
          }
          
          const pathEdgeSourceId = String(pathEdge.edge.data.sourceShip.id);
          const pathEdgeTargetId = String(pathEdge.edge.data.targetShip.id);
          const pathEdgeSourceType = pathEdge.edge.data.sourceType || CcuSourceType.OFFICIAL;
          const pathEdgePrice = pathEdge.edge.data.price || 0;
          
          const edgeSourceType = edge.data?.sourceType || CcuSourceType.OFFICIAL;
          const edgePrice = edge.data?.price || 0;
          
          // 边的所有属性都匹配
          return pathEdgeSourceId === sourceShipId && 
                 pathEdgeTargetId === targetShipId &&
                 pathEdgeSourceType === edgeSourceType &&
                 pathEdgePrice === edgePrice;
        });
        
        if (isEdgeInCompletedPath) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * 检查路径是否已完成
   * @param path 要检查的路径
   * @returns 完成信息：{completed: boolean, pathId?: string}
   */
  isPathCompleted(path: CompletePath): { completed: boolean, pathId?: string } {
    for (const completedPath of this.completedPaths) {
      // 检查起点和终点是否匹配
      if (completedPath.path.startNodeId === path.startNodeId && 
          completedPath.ship.id === path.path[path.path.length - 1].ship.id) {
        
        // 检查路径中的所有边是否匹配
        const allEdgesMatch = path.edges.every(edge => {
          const matchingEdge = completedPath.path.edges.find(completedEdge => {
            if (!edge.edge.data || !completedEdge.edge.data) return false;
            if (!edge.edge.data.sourceShip || !edge.edge.data.targetShip) return false;
            if (!completedEdge.edge.data.sourceShip || !completedEdge.edge.data.targetShip) return false;
            
            const edgeSourceId = String(edge.edge.data.sourceShip.id);
            const edgeTargetId = String(edge.edge.data.targetShip.id);
            const edgeSourceType = edge.edge.data.sourceType || CcuSourceType.OFFICIAL;
            const edgePrice = edge.edge.data.price || 0;
            
            const completedEdgeSourceId = String(completedEdge.edge.data.sourceShip.id);
            const completedEdgeTargetId = String(completedEdge.edge.data.targetShip.id);
            const completedEdgeSourceType = completedEdge.edge.data.sourceType || CcuSourceType.OFFICIAL;
            const completedEdgePrice = completedEdge.edge.data.price || 0;
            
            return edgeSourceId === completedEdgeSourceId &&
                   edgeTargetId === completedEdgeTargetId &&
                   edgeSourceType === completedEdgeSourceType &&
                   edgePrice === completedEdgePrice;
          });
          
          return !!matchingEdge;
        });
        
        if (allEdgesMatch && path.edges.length === completedPath.path.edges.length) {
          return { completed: true, pathId: completedPath.pathId };
        }
      }
    }
    
    return { completed: false };
  }

  /**
   * 新增：获取所有已完成的路径
   */
  getCompletedPaths(): CompletedPath[] {
    return [...this.completedPaths];
  }

  /**
   * 新增：清理所有已完成的路径
   */
  clearCompletedPaths(): void {
    this.completedPaths = [];
    
    // 清理本地存储中的数据
    try {
      localStorage.removeItem('completedPaths');
    } catch (error) {
      console.error('Failed to clear completed paths from storage:', error);
    }
  }

  /**
   * 新增：检查路径是否是某个已完成路径的延伸
   */
  isPathExtensionOfCompletedPath(path: CompletePath): boolean {
    if (this.completedPaths.length === 0) return false;
    
    for (const completedPath of this.completedPaths) {
      // 如果有任何一个已完成路径是当前路径的前缀，则认为是扩展
      const completedPathEndShipId = completedPath.ship.id;
      
      // 检查已完成路径的终点是否在当前路径的中间节点
      for (let i = 0; i < path.path.length - 1; i++) {
        if (path.path[i].ship.id === completedPathEndShipId) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * 新增：检查路径是否是高于已完成路径的船只的延伸
   * @param path 要检查的路径
   * @returns 是否是高于已完成路径的船只的延伸
   */
  isPathExtensionToHigherValue(path: CompletePath): boolean {
    if (this.completedPaths.length === 0) return false;
    
    // 获取路径的目标船只
    const targetShip = path.path[path.path.length - 1].ship;
    
    // 检查目标船只是否价值高于任何已完成路径的船只
    for (const completedPath of this.completedPaths) {
      if (targetShip?.msrp && targetShip.msrp > (completedPath?.ship.msrp || 0)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 新增：保存已完成的路径到本地存储
   */
  private saveCompletedPathsToStorage(): void {
    try {
      // 转换为存储格式
      const storedPaths: StoredCompletedPath[] = this.completedPaths.map(completedPath => ({
        pathId: completedPath.pathId,
        shipId: Number(completedPath.ship.id),
        shipName: completedPath.ship.name || "",
        shipMsrp: completedPath.ship.msrp || 0,
        path: {
          startNodeId: completedPath.path.startNodeId,
          nodes: completedPath.path.path.map(node => ({
            nodeId: node.nodeId,
            shipId: Number(node.ship.id),
            shipName: node.ship.name || "",
            shipMsrp: node.ship.msrp || 0
          })),
          edges: completedPath.path.edges.map(edge => ({
            sourceShipId: Number(edge.edge.data?.sourceShip?.id || 0),
            targetShipId: Number(edge.edge.data?.targetShip?.id || 0),
            sourceType: edge.edge.data?.sourceType || CcuSourceType.OFFICIAL,
            price: edge.edge.data?.price || 0
          })),
          totalUsdPrice: completedPath.path.totalUsdPrice,
          totalThirdPartyPrice: completedPath.path.totalThirdPartyPrice,
          hasUsdPricing: completedPath.path.hasUsdPricing,
          hasCnyPricing: completedPath.path.hasCnyPricing
        }
      }));

      localStorage.setItem('completedPaths', JSON.stringify(storedPaths));
    } catch (error) {
      console.error('Failed to save completed paths to storage:', error);
    }
  }

  /**
   * 新增：从本地存储加载已完成的路径
   */
  loadCompletedPathsFromStorage(): void {
    try {
      const storedPaths = localStorage.getItem('completedPaths');
      if (storedPaths) {
        const parsedPaths: StoredCompletedPath[] = JSON.parse(storedPaths);
        
        // 转换为运行时格式
        this.completedPaths = parsedPaths.filter(storedPath => storedPath.path?.startNodeId).map(storedPath => {
          // 创建简化的Ship对象
          const createShip = (id: number, name: string, msrp: number): Partial<Ship> => ({
            id: id,
            name,
            msrp,
          });

          // 重建路径节点
          const pathNodes: PathNode[] = storedPath.path.nodes.map(node => ({
            nodeId: node.nodeId,
            ship: createShip(node.shipId, node.shipName, node.shipMsrp)
          }));

          // 重建路径边
          const pathEdges: PathEdge[] = storedPath.path.edges.map(edge => {
            const sourceNode = pathNodes.find(n => Number(n.ship.id) === edge.sourceShipId);
            const targetNode = pathNodes.find(n => Number(n.ship.id) === edge.targetShipId);
            
            if (!sourceNode || !targetNode) {
              throw new Error('Invalid edge data in stored path');
            }

            return {
              edge: {
                id: `${edge.sourceShipId}-${edge.targetShipId}`,
                source: sourceNode.nodeId,
                target: targetNode.nodeId,
                data: {
                  sourceShip: sourceNode.ship,
                  targetShip: targetNode.ship,
                  sourceType: edge.sourceType,
                  price: edge.price
                }
              } as Edge<CcuEdgeData>,
              sourceNode: { id: sourceNode.nodeId, data: { ship: sourceNode.ship } } as Node,
              targetNode: { id: targetNode.nodeId, data: { ship: targetNode.ship } } as Node
            };
          });

          return {
            pathId: storedPath.pathId,
            ship: createShip(storedPath.shipId, storedPath.shipName, storedPath.shipMsrp),
            path: {
              path: pathNodes,
              edges: pathEdges,
              totalUsdPrice: storedPath.path.totalUsdPrice,
              totalThirdPartyPrice: storedPath.path.totalThirdPartyPrice,
              hasUsdPricing: storedPath.path.hasUsdPricing,
              hasCnyPricing: storedPath.path.hasCnyPricing,
              startNodeId: storedPath.path.startNodeId
            }
          };
        });
      }
    } catch (error) {
      console.error('Failed to load completed paths from storage:', error);
      this.completedPaths = [];
    }
  }

  /**
   * 检查单条边是否存在于任何已完成路径中
   * 专门用于CcuEdge组件，无需知道边所属的完整路径
   * @param edge 边信息
   * @returns 是否存在于已完成路径中
   */
  isSingleEdgeInAnyCompletedPath(edge: Edge<CcuEdgeData>): boolean {
    if (!edge.data || !edge.data.sourceShip || !edge.data.targetShip) return false;
    
    // 获取源船和目标船ID
    const sourceShipId = String(edge.data.sourceShip.id);
    const targetShipId = String(edge.data.targetShip.id);
    
    // 获取边的类型和价格
    const edgeSourceType = edge.data.sourceType || CcuSourceType.OFFICIAL;
    const edgePrice = edge.data.price || 0;
    
    // 检查是否存在于任何已完成路径中
    for (const completedPath of this.completedPaths) {
      const edgeInCompletedPath = completedPath.path.edges.some(pathEdge => {
        if (!pathEdge.edge.data || !pathEdge.edge.data.sourceShip || !pathEdge.edge.data.targetShip) {
          return false;
        }
        
        const pathEdgeSourceId = String(pathEdge.edge.data.sourceShip.id);
        const pathEdgeTargetId = String(pathEdge.edge.data.targetShip.id);
        const pathEdgeSourceType = pathEdge.edge.data.sourceType || CcuSourceType.OFFICIAL;
        const pathEdgePrice = pathEdge.edge.data.price || 0;
        
        // 比较所有属性
        return pathEdgeSourceId === sourceShipId && 
               pathEdgeTargetId === targetShipId &&
               pathEdgeSourceType === edgeSourceType &&
               pathEdgePrice === edgePrice;
      });
      
      if (edgeInCompletedPath) {
        return true;
      }
    }
    
    return false;
  }
}

export default new PathFinderService(); 