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
  totalCnyPrice: number;
  hasUsdPricing: boolean;
  hasCnyPricing: boolean;
  startNodeId: string;
}

export class PathFinderService {
  private nodeBestCost: Record<string, number> = {};
  
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
  calculateTotalCost(usdPrice: number, cnyPrice: number, exchangeRate: number, conciergeValue: string): number {
    const conciergeMultiplier = 1 + parseFloat(conciergeValue || "0");
    return usdPrice * exchangeRate + cnyPrice * conciergeMultiplier;
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
    currentCnyCost = 0
  ): string[][] {
    currentPath.push(startNode.id);
    visited.add(startNode.id);

    const totalCost = this.calculateTotalCost(currentUsdCost, currentCnyCost, exchangeRate, conciergeValue);

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
            currentCnyCost + tpPrice
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
      let totalCnyPrice = 0;
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
          totalCnyPrice += tpPrice;

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
        totalCnyPrice,
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
}

export default new PathFinderService(); 