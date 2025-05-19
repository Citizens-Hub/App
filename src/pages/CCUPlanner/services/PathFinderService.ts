import { Edge, Node } from 'reactflow';
import { CcuEdgeData, CcuSourceType, Ship } from '../../../types';
import { CcuSourceTypeStrategyFactory } from './CcuSourceTypeFactory';

interface PathNode {
  nodeId: string;
  ship: Ship;
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
  ship: Ship;      // 完成到的船只
  path: CompletePath; // 完整路径信息
}

// 新增：添加边的识别信息接口
export interface EdgeIdentifier {
  sourceShipId: string;
  targetShipId: string;
}

export class PathFinderService {
  private nodeBestCost: Record<string, number> = {};
  // 新增：已完成的路径存储
  private completedPaths: CompletedPath[] = [];
  // 新增：已完成的边缓存
  private completedEdges: Set<string> = new Set();
  
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
  getPriceInfo(edge: Edge<CcuEdgeData>): { usdPrice: number; tpPrice: number } {
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
      customPrice: edge.data.customPrice
    });
    
    // 根据货币类型分配价格
    let usdPrice = 0;
    let tpPrice = 0;
    
    if (priceResult.currency === 'USD') {
      usdPrice = priceResult.price;
    } else {
      tpPrice = priceResult.price;
    }
    
    return { usdPrice, tpPrice };
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
    currentThirdPartyCost = 0
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
          const { usdPrice, tpPrice } = this.getPriceInfo(edge as Edge<CcuEdgeData>);

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
            currentUsdCost + usdPrice,
            currentThirdPartyCost + tpPrice
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
    startShipPrices: Record<string, number | string>
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

          const { usdPrice, tpPrice } = this.getPriceInfo(edge);
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
    
    // 标记路径中所有的边为已完成
    this.updateCompletedEdges();
    
    // 存储到本地存储以便在会话之间保留
    this.saveCompletedPathsToStorage();
  }

  /**
   * 新增：取消标记路径为已完成
   */
  unmarkCompletedPath(pathId: string): void {
    this.completedPaths = this.completedPaths.filter(p => p.pathId !== pathId);
    
    // 更新已完成的边缓存
    this.updateCompletedEdges();
    
    this.saveCompletedPathsToStorage();
  }

  /**
   * 新增：更新已完成边的缓存集合
   */
  private updateCompletedEdges(): void {
    // 清空缓存
    this.completedEdges.clear();
    
    // 遍历所有已完成路径，记录其中的边
    this.completedPaths.forEach(completedPath => {
      completedPath.path.edges.forEach(edge => {
        const sourceShipId = edge.sourceNode.data?.ship?.id;
        const targetShipId = edge.targetNode.data?.ship?.id;
        if (sourceShipId && targetShipId) {
          const edgeKey = `${sourceShipId}-${targetShipId}`;
          this.completedEdges.add(edgeKey);
        }
      });
    });
  }

  /**
   * 新增：判断指定的边是否属于已完成路径
   */
  isEdgeCompleted(sourceShipId: string, targetShipId: string): boolean {
    const edgeKey = `${sourceShipId}-${targetShipId}`;
    return this.completedEdges.has(edgeKey);
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
    this.completedEdges.clear();
    
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
    
    // 检查当前路径是否使用了任何已完成路径的部分
    // 方式1：直接检查完成的边是否在当前路径中
    for (const edge of path.edges) {
      const sourceShipId = edge.sourceNode.data?.ship?.id;
      const targetShipId = edge.targetNode.data?.ship?.id;
      
      if (sourceShipId && targetShipId) {
        const edgeKey = `${sourceShipId}-${targetShipId}`;
        if (this.completedEdges.has(edgeKey)) {
          return true;
        }
      }
    }
    
    // 方式2：检查路径是否从任何已完成路径的船只开始或经过
    for (const completedPath of this.completedPaths) {
      const completedShipId = completedPath.ship.id;
      
      // 检查路径的任何节点是否是已完成路径的最终节点
      for (const edge of path.edges) {
        if (edge.sourceNode.data?.ship?.id === completedShipId) {
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
      if (targetShip.msrp > completedPath.ship.msrp) {
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
      localStorage.setItem('completedPaths', JSON.stringify(this.completedPaths));
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
        this.completedPaths = JSON.parse(storedPaths);
        // 加载后更新已完成边的缓存
        this.updateCompletedEdges();
      }
    } catch (error) {
      console.error('Failed to load completed paths from storage:', error);
      this.completedPaths = [];
      this.completedEdges.clear();
    }
  }
}

export default new PathFinderService(); 