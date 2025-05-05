import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Ship, CcuSourceType, CcuEdgeData } from '../../../types';
import { Edge, Node } from 'reactflow';
import { Button, Input, Tooltip } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';

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
  startShipPrices: Record<string, number | string>;
  onStartShipPriceChange: (nodeId: string, price: number | string) => void;
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

String.prototype.getNodeShipId = function() {
  return this.split('-')[1];
}

export default function RouteInfoPanel({ 
  selectedNode, 
  edges, 
  nodes, 
  onClose, 
  startShipPrices, 
  onStartShipPriceChange 
}: RouteInfoPanelProps) {
  const [conciergeValue, setConciergeValue] = useState("0.1");
  const nodeBestCostRef = useRef<Record<string, number>>({});

  // 查找所有可能的起点（没有入边的节点）
  const findStartNodes = useCallback(() => {
    const nodesWithIncomingEdges = new Set(edges.map(edge => edge.target));
    return nodes.filter(node => !nodesWithIncomingEdges.has(node.id));
  }, [edges, nodes]);

  // 初始化起点船价格为msrp/100
  useEffect(() => {
    const startNodes = findStartNodes();
    
    startNodes.forEach(node => {
      // 只为没有设置过价格的节点设置默认价格
      if (node.data?.ship?.msrp && startShipPrices[node.id] === undefined) {
        onStartShipPriceChange(node.id, node.data.ship.msrp / 100);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, findStartNodes]);

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

  // 计算花费的换算值（美元花费*7.3+人民币花费*（1+消费额价值））
  const calculateTotalCost = useCallback((usdPrice: number, cnyPrice: number) => {
    const conciergeMultiplier = 1 + parseFloat(conciergeValue || "0");
    return usdPrice * 7.3 + cnyPrice * conciergeMultiplier;
  }, [conciergeValue]);

  // 查找从起点到选中节点的所有可能路径
  const findAllPaths = useCallback((
    startNode: Node, 
    endNodeId: string, 
    visited = new Set<string>(), 
    currentPath: string[] = [], 
    allPaths: string[][] = [],
    currentUsdCost = 0,
    currentCnyCost = 0
  ) => {
    // 添加当前节点到路径和访问集合
    currentPath.push(startNode.id);
    visited.add(startNode.id);
    
    // 计算当前路径的总花费
    const totalCost = calculateTotalCost(currentUsdCost, currentCnyCost);
    
    // 如果这个节点已经有更低的花费记录，则剪枝
    if (nodeBestCostRef.current[startNode.id] !== undefined && totalCost >= nodeBestCostRef.current[startNode.id]) {
      return allPaths;
    }
    
    // 更新当前节点的最低花费
    nodeBestCostRef.current[startNode.id] = totalCost;

    // 如果达到目标节点，添加当前路径到所有路径
    if (startNode.id.getNodeShipId() === endNodeId.getNodeShipId()) {
      allPaths.push([...currentPath]);
    } else {
      // 查找所有从当前节点出发的边
      const outgoingEdges = edges.filter(edge => edge.source.getNodeShipId() === startNode.id.getNodeShipId());

      // 对于每条出边，递归查找路径
      for (const edge of outgoingEdges) {
        const targetNode = nodes.find(node => node.id === edge.target);
        if (targetNode && !visited.has(targetNode.id)) {
          // 计算这条边的花费
          const { usdPrice, cnyPrice } = getPriceInfo(edge);
          
          // 递归搜索，更新当前花费
          findAllPaths(
            targetNode, 
            endNodeId, 
            new Set(visited), 
            [...currentPath], 
            allPaths,
            currentUsdCost + usdPrice,
            currentCnyCost + cnyPrice
          );
        }
      }
    }

    return allPaths;
  }, [edges, nodes, getPriceInfo, calculateTotalCost]);

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

      // 添加起点船的价格（如果有自定义价格）
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
        hasCnyPricing,
        startNodeId: pathId[0]
      };
    });
  }, [edges, nodes, getPriceInfo, startShipPrices]);

  // 查找所有完整路径
  const completePaths = useMemo(() => {
    if (!selectedNode) return [];

    // 重置节点最小花费
    nodeBestCostRef.current = {};
    
    const startNodes = findStartNodes();
    const allPathIds: string[][] = [];

    // 从每个起点查找到终点的所有路径
    startNodes.forEach(startNode => {
      // 获取起点船的价格
      const startPrice = startShipPrices[startNode.id] || 0;
      const paths = findAllPaths(startNode, selectedNode.id, new Set(), [], [], Number(startPrice), 0);
      allPathIds.push(...paths);
    });

    return buildCompletePaths(allPathIds);
  }, [selectedNode, findStartNodes, buildCompletePaths, findAllPaths, startShipPrices]);

  // 处理起点船价格变化
  const handleStartShipPriceChange = (nodeId: string, price: string) => {
    onStartShipPriceChange(nodeId, price);
  };

  if (!selectedNode) return null;

  return (
    <div className="absolute right-0 top-0 w-fit h-full bg-white border-l border-gray-200 p-4 shadow-lg overflow-y-auto z-10">
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
          src={selectedNode.data.ship.medias.productThumbMediumAndSmall.replace('medium_and_small', 'large')}
          alt={selectedNode.data.ship.name}
          className="mb-2 m-auto"
        />
        <div className="text-blue-400 font-bold py-1 px-3 rounded text-lg text-center">
          <span className='text-black'>舰船价值：</span>{(selectedNode.data.ship.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-lg text-left">
          排序设置
        </div>
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex items-center justify-between">
            <label htmlFor="conciergeValue" className="text-sm text-gray-600 flex items-center gap-1">
              消费额价值
              <Tooltip arrow title={<span style={{ fontSize: '14px' }}>在这里填写你获取1美元消费额的成本是多少美元, 如果你不在意消费额则填0, 升级的实际花销按照消费美元+消费人民币*汇率*(1+消费额换算比例),即花销为总花费换算为美元后再加上'购买'没有从官方购买获得的消费额的费用</span>}>
                <InfoOutlined sx={{ fontSize: 14 }} />
              </Tooltip>
            </label>
            <div className="flex items-center">
              <Input
                id="conciergeValue"
                type="number"
                className="w-24"
                inputProps={{ min: 0, max: 1, step: 0.1 }}
                value={conciergeValue}
                onChange={(e) => setConciergeValue(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <h4 className="text-lg font-bold mb-2 bg-gray-100 py-1 flex justify-center items-center gap-2">
        备选升级路线
        <Tooltip arrow title={<span style={{ fontSize: '14px' }}>升级路径经过剪枝以确保能在有意义时间内完成计算, 只保证第一条路径为花费最优路径, 不保证存在不存在优于第二条（及以后）路径的路径</span>}>
          <InfoOutlined sx={{ fontSize: 14 }} />
        </Tooltip>
      </h4>

      {completePaths.length === 0 ? (
        <p className="text-gray-400">没有找到可用的升级路线</p>
      ) : (
        <div className="space-y-6">
          {completePaths.sort((a, b) => {
            return (a.totalUsdPrice + a.totalCnyPrice / 7.3 * (1 + parseFloat(conciergeValue))) - (b.totalUsdPrice + b.totalCnyPrice / 7.3 * (1 + parseFloat(conciergeValue)))
          }).map((completePath, pathIndex) => {
            const startNode = nodes.find(n => n.id === completePath.startNodeId);
            const startShip = startNode?.data?.ship as Ship;
            
            return (
              <div key={pathIndex}>
                <div className="mt-3">
                  <h5 className="font-medium mb-2 pb-1">
                    路线 {pathIndex + 1}: {completePath.path.length} 个节点
                  </h5>
                  
                  {/* 起点船价格设置 */}
                  {startShip && (
                    <div className="mb-3 p-2 bg-gray-50 rounded">
                      <div className="flex items-center gap-2 mb-2">
                        <img
                          src={startShip.medias.productThumbMediumAndSmall}
                          alt={startShip.name}
                          className="w-8 h-8 rounded object-cover"
                        />
                        <span className="font-medium">{startShip.name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-gray-600">
                          起点船价格 ($)
                        </label>
                        <Input
                          type="number"
                          className="w-24"
                          inputProps={{ min: 0, max: startShip.msrp / 100, step: 1 }}
                          value={startShipPrices[completePath.startNodeId]}
                          onChange={(e) => handleStartShipPriceChange(completePath.startNodeId, e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    {completePath.edges.map((pathEdge, edgeIndex) => {
                      const { usdPrice, cnyPrice } = getPriceInfo(pathEdge.edge);
                      const sourceType = pathEdge.edge.data?.sourceType || CcuSourceType.OFFICIAL;

                      return (
                        <div key={edgeIndex} className="p-2 rounded text-sm border-b border-gray-200 last:border-b-0 flex flex-col gap-2">
                          <div className="flex mb-1 gap-2 justify-between w-full">
                            <div className='flex gap-4'>
                              <img
                                src={pathEdge.sourceNode.data?.ship?.medias.productThumbMediumAndSmall}
                                alt={pathEdge.sourceNode.data?.ship?.name}
                                className="w-8 h-8 rounded object-cover"
                              />
                              <span className="text-gray-400">
                                从 <span className='text-black'>{pathEdge.sourceNode.data?.ship?.name}</span>
                              </span>
                            </div>
                            <div className='flex gap-4'>
                              <span className="text-gray-400">
                                到 <span className='text-black'>{pathEdge.targetNode.data?.ship?.name}</span>
                              </span>
                              <img
                                src={pathEdge.targetNode.data?.ship?.medias.productThumbMediumAndSmall}
                                alt={pathEdge.targetNode.data?.ship?.name}
                                className="w-8 h-8 rounded object-cover"
                              />
                            </div>
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
                  <div className="flex flex-col gap-2 px-2">
                    <div className='flex justify-between gap-4'>
                      <div className="text-sm">
                        <span className="text-black">花费: </span>
                        <span className="text-blue-400">{completePath.totalUsdPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-blue-400">{completePath.totalCnyPrice.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })}</span>
                      </div>
                    </div>
                    <div className='flex justify-between gap-4'>
                      <div className="text-sm">
                        <span className="text-black">合计: </span>
                        <span className="text-blue-400">
                          {(completePath.totalUsdPrice + completePath.totalCnyPrice / 7.3).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                          {conciergeValue !== "0" && " + "}
                          {conciergeValue !== "0" && (completePath.totalCnyPrice / 7.3 * parseFloat(conciergeValue)).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="text-blue-400">
                          {(completePath.totalUsdPrice * 7.3 + completePath.totalCnyPrice).toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })}
                          {conciergeValue !== "0" && " + "}
                          {conciergeValue !== "0" && (completePath.totalCnyPrice * parseFloat(conciergeValue)).toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 