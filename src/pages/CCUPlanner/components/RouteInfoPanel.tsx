import { useCallback, useMemo } from 'react';
import { Ship, CcuSourceType, CcuEdgeData } from '../../../types';
import { Edge, Node } from 'reactflow';
import { Button } from '@mui/material';

interface RouteInfoPanelProps {
  selectedNode: {
    id: string;
    data: {
      ship: Ship;
    };
  } | null;
  edges: Edge<CcuEdgeData>[];
  nodes: Node[];
  onClose: () => void;
}

// 定义路径节点类型
interface PathNode {
  nodeId: string;
  ship: Ship;
}

// 定义路径边类型
interface PathEdge {
  edge: Edge<CcuEdgeData>;
  sourceNode: Node;
  targetNode: Node;
}

export default function RouteInfoPanel({ selectedNode, edges, nodes, onClose }: RouteInfoPanelProps) {
  // 根据不同的来源类型获取价格与币种
  const getPriceInfo = useCallback((edge: Edge<CcuEdgeData>) => {
    if (!edge.data) return { usdPrice: 0, cnyPrice: 0 };

    const sourceType = edge.data.sourceType || CcuSourceType.OFFICIAL;
    let usdPrice = 0;
    let cnyPrice = 0;

    if (sourceType === CcuSourceType.OFFICIAL) {
      usdPrice = edge.data.price / 100;
      cnyPrice = 0;
    } else if (sourceType === CcuSourceType.OFFICIAL_WB) {
      usdPrice = edge.data.customPrice || edge.data.price / 100;
      cnyPrice = 0;
    } else if (sourceType === CcuSourceType.THIRD_PARTY) {
      cnyPrice = edge.data.customPrice || 0;
      usdPrice = 0;
    }

    return { usdPrice, cnyPrice };
  }, []);

  // 查找所有可能的起点（没有入边的节点）
  const findStartNodes = useCallback(() => {
    const nodesWithIncomingEdges = new Set(edges.map(edge => edge.target));
    return nodes.filter(node => !nodesWithIncomingEdges.has(node.id));
  }, [edges, nodes]);

  // 查找从起点到选中节点的所有可能路径
  const findAllPaths = useCallback((startNode: Node, endNodeId: string, visited = new Set<string>(), currentPath: string[] = [], allPaths: string[][] = []) => {
    // 添加当前节点到路径和访问集合
    currentPath.push(startNode.id);
    visited.add(startNode.id);

    // 如果达到目标节点，添加当前路径到所有路径
    if (startNode.id === endNodeId) {
      allPaths.push([...currentPath]);
    } else {
      // 查找所有从当前节点出发的边
      const outgoingEdges = edges.filter(edge => edge.source === startNode.id);

      // 对于每条出边，递归查找路径
      for (const edge of outgoingEdges) {
        const targetNode = nodes.find(node => node.id === edge.target);
        if (targetNode && !visited.has(targetNode.id)) {
          findAllPaths(targetNode, endNodeId, new Set(visited), [...currentPath], allPaths);
        }
      }
    }

    return allPaths;
  }, [edges, nodes]);

  // 将节点ID路径转换为完整的路径对象
  const buildCompletePaths = useCallback((pathIds: string[][]) => {
    return pathIds.map(pathId => {
      const pathNodes: PathNode[] = pathId.map(id => {
        const node = nodes.find(n => n.id === id);
        return {
          nodeId: id,
          ship: node?.data?.ship as Ship
        };
      });

      // 构建路径中的边
      const pathEdges: PathEdge[] = [];
      let totalUsdPrice = 0;
      let totalCnyPrice = 0;
      let hasUsdPricing = false;
      let hasCnyPricing = false;

      for (let i = 0; i < pathId.length - 1; i++) {
        const edge = edges.find(e => e.source === pathId[i] && e.target === pathId[i + 1]);
        if (edge) {
          const sourceNode = nodes.find(n => n.id === pathId[i])!;
          const targetNode = nodes.find(n => n.id === pathId[i + 1])!;

          pathEdges.push({
            edge,
            sourceNode,
            targetNode
          });

          // 计算价格
          const { usdPrice, cnyPrice } = getPriceInfo(edge);
          totalUsdPrice += usdPrice;
          totalCnyPrice += cnyPrice;

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
        hasCnyPricing
      };
    });
  }, [edges, nodes, getPriceInfo]);

  // 查找所有完整路径
  const completePaths = useMemo(() => {
    if (!selectedNode) return [];

    const startNodes = findStartNodes();
    const allPathIds: string[][] = [];

    // 从每个起点查找到终点的所有路径
    startNodes.forEach(startNode => {
      const paths = findAllPaths(startNode, selectedNode.id);
      allPathIds.push(...paths);
    });

    return buildCompletePaths(allPathIds);
  }, [selectedNode, findStartNodes, buildCompletePaths, findAllPaths]);

  if (!selectedNode) return null;

  return (
    <div className="absolute right-0 top-0 w-96 h-full bg-white border-l border-gray-200 p-4 shadow-lg overflow-y-auto z-10">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold">{selectedNode.data.ship.name}</h3>
        <Button
          variant="text"
          color="error"
          onClick={onClose}
        >
          ✕
        </Button>
      </div>

      <div className="mb-4">
        <img
          src={selectedNode.data.ship.medias.productThumbMediumAndSmall}
          alt={selectedNode.data.ship.name}
          className="w-full mb-2"
        />
        <div className="text-blue-400 font-bold py-1 px-3 rounded text-lg text-center">
          <span className='text-black'>舰船价值：</span>{(selectedNode.data.ship.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </div>
      </div>

      <h4 className="text-lg font-bold mb-2">可用升级路线</h4>

      {completePaths.length === 0 ? (
        <p className="text-gray-400">没有找到可用的升级路线</p>
      ) : (
        <div className="space-y-6">
          {completePaths.map((completePath, pathIndex) => (
            <div key={pathIndex} className="p-3 border border-gray-200 rounded-lg">
              {/* <h5 className="font-medium mb-2 pb-1">
                路线 {pathIndex + 1}: {completePath.path.length} 个节点
              </h5> */}

              {/* 详细升级步骤 */}
              <div className="mt-3">
                <h5 className="font-medium mb-2 pb-1">
                  路线 {pathIndex + 1}: {completePath.path.length} 个节点
                </h5>
                <div className="space-y-2">
                  {completePath.edges.map((pathEdge, edgeIndex) => {
                    const { usdPrice, cnyPrice } = getPriceInfo(pathEdge.edge);
                    const sourceType = pathEdge.edge.data?.sourceType || CcuSourceType.OFFICIAL;

                    return (
                      <div key={edgeIndex} className="p-2 rounded text-sm border-b border-gray-200 last:border-b-0">
                        <div className="flex justify-between mb-1">
                          <img
                            src={pathEdge.sourceNode.data?.ship?.medias.productThumbMediumAndSmall}
                            alt={pathEdge.sourceNode.data?.ship?.name}
                            className="w-8 h-8 rounded object-cover"
                          />
                          <span className="text-gray-400">
                            从 <span className='text-black'>{pathEdge.sourceNode.data?.ship?.name}</span>
                          </span>
                          <span className="text-gray-400">
                            到 <span className='text-black'>{pathEdge.targetNode.data?.ship?.name}</span>
                          </span>
                          <img
                            src={pathEdge.targetNode.data?.ship?.medias.productThumbMediumAndSmall}
                            alt={pathEdge.targetNode.data?.ship?.name}
                            className="w-8 h-8 rounded object-cover"
                          />
                        </div>

                        <div className="flex justify-between">
                          <span className="text-gray-600">
                            <span className="text-black">{sourceType}</span> 升级
                          </span>

                          {sourceType !== CcuSourceType.THIRD_PARTY ? (
                            <span className="text-gray-600">
                              价格: <span className="text-black">${usdPrice.toFixed(2)}</span>
                            </span>
                          ) : (
                            <span className="text-gray-600">
                              价格: <span className="text-black">￥{cnyPrice.toFixed(2)}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 价格总结 */}
              <div className="bg-gray-100 p-2 rounded mt-2">
                {/* <div className="text-sm font-medium text-gray-300 mb-1">
                  总价:
                </div> */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-sm">
                    <span className="text-black">美元: </span>
                    <span className="text-blue-400">${completePath.totalUsdPrice.toFixed(2)}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-black">人民币: </span>
                    <span className="text-blue-400">￥{completePath.totalCnyPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 