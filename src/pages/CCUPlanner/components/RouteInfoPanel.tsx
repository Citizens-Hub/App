import { useMemo, useState, useEffect } from 'react';
import { Ship, CcuSourceType, CcuEdgeData } from '../../../types';
import { Edge, Node } from 'reactflow';
import { Button, Input, Switch, Tooltip, IconButton, Divider } from '@mui/material';
import { InfoOutlined, CheckCircle } from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';
import pathFinderService, { CompletePath } from '../services/PathFinderService';
import { CcuSourceTypeStrategyFactory } from '../services/CcuSourceTypeFactory';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

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
  exchangeRates: {
    [currency: string]: number;
  };
  onPathCompletionChange?: () => void;
}

if (!String.prototype.getNodeShipId) {
  String.prototype.getNodeShipId = function () {
    return this.split('-')[1];
  }
}

export default function RouteInfoPanel({
  selectedNode,
  edges,
  nodes,
  onClose,
  startShipPrices,
  onStartShipPriceChange,
  exchangeRates,
  onPathCompletionChange
}: RouteInfoPanelProps) {
  const [conciergeValue, setConciergeValue] = useState(localStorage.getItem('conciergeValue') || "0.1");
  const [pruneOpt, setPruneOpt] = useState(localStorage.getItem('pruneOpt') === 'true');
  const [sortByNewInvestment, setSortByNewInvestment] = useState(localStorage.getItem('sortByNewInvestment') === 'true');
  const [currentPage, setCurrentPage] = useState(0);
  const { currency } = useSelector((state: RootState) => state.upgrades);
  const exchangeRate = exchangeRates[currency.toLowerCase()];
  const intl = useIntl();
  const { locale } = intl;
  const ccuSourceTypeFactory = useMemo(() => CcuSourceTypeStrategyFactory.getInstance(), []);

  useEffect(() => {
    pathFinderService.loadCompletedPathsFromStorage();
  }, []);

  useEffect(() => {
    const startNodes = pathFinderService.findStartNodes(edges, nodes);

    startNodes.forEach(node => {
      if (node.data?.ship?.msrp && startShipPrices[node.id] === undefined) {
        onStartShipPriceChange(node.id, node.data.ship.msrp / 100);
      }
    });
  }, [nodes, edges, startShipPrices, onStartShipPriceChange]);

  const handleStartShipPriceChange = (nodeId: string, price: string) => {
    onStartShipPriceChange(nodeId, price);
  };

  const completePaths = useMemo(() => {
    if (!selectedNode) return [];

    pathFinderService.resetNodeBestCost();

    const startNodes = pathFinderService.findStartNodes(edges, nodes);
    const allPathIds: string[][] = [];

    startNodes.forEach(startNode => {
      const startPrice = startShipPrices[startNode.id] || 0;
      const paths = pathFinderService.findAllPaths(
        startNode,
        selectedNode.id,
        edges,
        nodes,
        exchangeRate,
        conciergeValue,
        pruneOpt,
        new Set(),
        [],
        [],
        Number(startPrice),
        0
      );
      allPathIds.push(...paths);
    });

    // totalCnyPrice actually represents third-party price (tpPrice) in the user's selected currency
    return pathFinderService.buildCompletePaths(allPathIds, edges, nodes, startShipPrices);
  }, [selectedNode, edges, nodes, startShipPrices, exchangeRate, conciergeValue, pruneOpt]);

  const sortedPathsGroups = useMemo(() => {
    if (!completePaths.length) return { pathsWithCompletedEdges: [], normalPaths: [] };

    // 简化路径分类系统，只分为两类
    const pathsWithCompletedEdges: CompletePath[] = []; // 包含已完成边的路径
    const normalPaths: CompletePath[] = [];           // 普通路径

    // 对所有路径进行分类
    completePaths.forEach(path => {
      // 检查路径是否包含了已完成的边
      const hasCompletedEdge = path.edges.some(edge => {
        const sourceShipId = edge.sourceNode.data?.ship?.id;
        const targetShipId = edge.targetNode.data?.ship?.id;
        return sourceShipId && targetShipId &&
          pathFinderService.isEdgeCompleted(
            String(sourceShipId), 
            String(targetShipId),
            edge.edge,  // 传入完整的边信息
            path       // 传入当前完整路径
          );
      });

      // 如果路径包含已完成边，优先显示
      if (hasCompletedEdge) {
        pathsWithCompletedEdges.push(path);
      } else {
        normalPaths.push(path);
      }
    });

    // 根据排序选项确定排序函数
    const sortPaths = (a: CompletePath, b: CompletePath) => {
      if (sortByNewInvestment) {
        // 计算新增投资（排序时：排除已完成边和机库CCU的成本）
        const getNewInvestmentCostForSorting = (path: CompletePath) => {
          let newUsdCost = 0;
          let newCnyCost = 0;
          
          path.edges.forEach(edge => {
            const sourceShipId = edge.sourceNode.data?.ship?.id;
            const targetShipId = edge.targetNode.data?.ship?.id;
            const isCompleted = sourceShipId && targetShipId && 
              pathFinderService.isEdgeCompleted(String(sourceShipId), String(targetShipId));
            
            // 对排序来说：如果边未完成且不是机库CCU，则计入新增成本
            if (!isCompleted && edge.edge.data?.sourceType !== CcuSourceType.HANGER) {
              if (edge.edge.data?.sourceType !== CcuSourceType.THIRD_PARTY) {
                newUsdCost += pathFinderService.getPriceInfo(edge.edge).usdPrice;
              } else {
                newCnyCost += pathFinderService.getPriceInfo(edge.edge).tpPrice;
              }
            }
          });
          
          return pathFinderService.calculateTotalCost(newUsdCost, newCnyCost, exchangeRate, conciergeValue);
        };
        
        return getNewInvestmentCostForSorting(a) - getNewInvestmentCostForSorting(b);
      } else {
        // 原有的总投资成本排序
        return pathFinderService.calculateTotalCost(a.totalUsdPrice, a.totalThirdPartyPrice, exchangeRate, conciergeValue) -
          pathFinderService.calculateTotalCost(b.totalUsdPrice, b.totalThirdPartyPrice, exchangeRate, conciergeValue);
      }
    };

    return {
      pathsWithCompletedEdges: pathsWithCompletedEdges.sort(sortPaths),
      normalPaths: normalPaths.sort(sortPaths)
    };
  }, [completePaths, exchangeRate, conciergeValue, sortByNewInvestment]);

  const sortedPaths = useMemo(() => {
    return [...sortedPathsGroups.pathsWithCompletedEdges, ...sortedPathsGroups.normalPaths];
  }, [sortedPathsGroups]);

  const totalPages = sortedPaths.length;

  const goToNextPage = () => {
    setCurrentPage((prev) => (prev + 1) % totalPages);
  };

  const goToPrevPage = () => {
    setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  };

  useEffect(() => {
    setCurrentPage(0);
  }, [selectedNode]);

  const handleMarkAsCompleted = (path: CompletePath) => {
    if (!selectedNode) return;

    pathFinderService.markPathAsCompleted(path, selectedNode.data.ship);

    if (onPathCompletionChange) {
      onPathCompletionChange();
    }
  };

  const handleUnmarkCompletedPath = (pathId: string) => {
    pathFinderService.unmarkCompletedPath(pathId);

    if (onPathCompletionChange) {
      onPathCompletionChange();
    }
  };

  const isPathCompleted = (path: CompletePath): { completed: boolean, pathId?: string } => {
    // 使用PathFinderService的新方法
    return pathFinderService.isPathCompleted(path);
  };

  const getNewInvestmentCost = (path: CompletePath) => {
    let newUsdCost = 0;
    let newCnyCost = 0;

    path.edges.forEach(edge => {
      const sourceShipId = edge.sourceNode.data?.ship?.id;
      const targetShipId = edge.targetNode.data?.ship?.id;
      const isCompleted = sourceShipId && targetShipId &&
        pathFinderService.isEdgeCompleted(
          String(sourceShipId), 
          String(targetShipId),
          edge.edge,   // 传入边信息
          path         // 传入完整路径
        );

      // 排除已完成边和机库CCU的成本，与排序逻辑保持一致
      if (!isCompleted && edge.edge.data?.sourceType !== CcuSourceType.HANGER) {
        if (edge.edge.data?.sourceType !== CcuSourceType.THIRD_PARTY) {
          newUsdCost += pathFinderService.getPriceInfo(edge.edge).usdPrice;
        } else {
          newCnyCost += pathFinderService.getPriceInfo(edge.edge).tpPrice;
        }
      }
    });

    return { newUsdCost, newCnyCost };
  };

  if (!selectedNode) return null;

  return (
    <div className="absolute right-0 top-0 w-full sm:w-fit sm:min-w-[450px] h-full bg-white dark:bg-[#121212] border-l border-gray-200 dark:border-gray-800 p-4 shadow-lg overflow-y-auto z-10">
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
          className="mb-2 m-auto w-[360px]"
        />
        <div className="text-blue-400 font-bold py-1 px-3 rounded text-lg flex gap-2 w-full justify-center">
          <span className='text-black dark:text-white'>
            <FormattedMessage id="routeInfoPanel.shipValue" defaultMessage="Ship Value:" />
          </span>
          {(selectedNode.data.ship.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-lg text-left">
          <FormattedMessage id="routeInfoPanel.sortingSettings" defaultMessage="Sorting Settings" />
        </div>
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="sortByNewInvestment" className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <FormattedMessage id="routeInfoPanel.sortByNewInvestment" defaultMessage="Sort by new investment" />
              <Tooltip arrow title={
                <span style={{ fontSize: '14px' }}>
                  <FormattedMessage
                    id="routeInfoPanel.sortByNewInvestmentTooltip"
                    defaultMessage="If checked, routes will be sorted by new investment cost only. Completed paths and hangar CCUs will be treated as free for sorting purposes."
                  />
                </span>
              }>
                <InfoOutlined sx={{ fontSize: 14 }} />
              </Tooltip>
            </label>
            <Switch
              id="sortByNewInvestment"
              checked={sortByNewInvestment}
              onChange={(e) => {
                setSortByNewInvestment(e.target.checked);
                localStorage.setItem('sortByNewInvestment', e.target.checked.toString());
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <label htmlFor="prunePath" className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <FormattedMessage id="routeInfoPanel.pruneOpt" defaultMessage="Pruning optimization" />
              <Tooltip arrow title={
                <span style={{ fontSize: '14px' }}>
                  <FormattedMessage id="routeInfoPanel.pruneOptTooltip" defaultMessage="If checked, the upgrade paths have been pruned to ensure calculations can be completed in a reasonable time. Only the first path is guaranteed to be optimal, not all possible alternatives are guaranteed to be shown" />
                </span>
              }>
                <InfoOutlined sx={{ fontSize: 14 }} />
              </Tooltip>
            </label>
            <Switch
              id="prunePath"
              checked={pruneOpt}
              onChange={(e) => {
                setPruneOpt(e.target.checked);
                localStorage.setItem('pruneOpt', e.target.checked.toString());
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <label htmlFor="conciergeValue" className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <FormattedMessage id="routeInfoPanel.conciergeValue" defaultMessage="Concierge Value" />
              <Tooltip arrow title={
                <span style={{ fontSize: '14px' }}>
                  <FormattedMessage
                    id="routeInfoPanel.conciergeTooltip"
                    defaultMessage="Fill in how many dollars it costs you to get $1 of concierge value. If you don't care about concierge value, enter 0. The actual cost of upgrading is calculated as dollars spent + RMB spent * exchange rate * (1 + concierge conversion ratio)"
                  />
                </span>
              }>
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
                onChange={(e) => {
                  setConciergeValue(e.target.value);
                  localStorage.setItem('conciergeValue', e.target.value);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <h4 className="text-lg font-bold mb-2 bg-gray-100 dark:bg-[#222] py-1 flex justify-center items-center gap-2">
        <FormattedMessage id="routeInfoPanel.title" defaultMessage="Alternative Upgrade Routes" />
      </h4>

      {sortedPaths.length === 0 ? (
        <p className="text-gray-400">
          <FormattedMessage id="routeInfoPanel.noRoutes" defaultMessage="No available upgrade routes found" />
        </p>
      ) : (
        <div>
          <div className="flex justify-between items-center mb-4">
            <IconButton onClick={goToPrevPage} disabled={totalPages <= 1}>
              <ChevronLeft className="w-4 h-4" />
            </IconButton>
            <div className="text-sm">
              <FormattedMessage
                id="routeInfoPanel.pagination"
                defaultMessage="Route {current} of {total}"
                values={{
                  current: currentPage + 1,
                  total: totalPages
                }}
              />
            </div>
            <IconButton onClick={goToNextPage} disabled={totalPages <= 1}>
              <ChevronRight className="w-4 h-4" />
            </IconButton>
          </div>

          {sortedPaths.length > 0 && (
            <div className="space-y-6">
              {(() => {
                const completePath = sortedPaths[currentPage];
                const pathIndex = currentPage;
                const startNode = nodes.find(n => n.id === completePath.startNodeId);
                const startShip = startNode?.data?.ship as Ship;
                const { completed, pathId } = isPathCompleted(completePath);

                // 计算新增投资
                const { newUsdCost, newCnyCost } = getNewInvestmentCost(completePath);

                return (
                  <div key={pathIndex}>
                    <div className="flex justify-between items-center mb-2">
                      {completed ? (
                        <Button
                          variant="outlined"
                          color="success"
                          size="small"
                          startIcon={<CheckCircle />}
                          onClick={() => pathId && handleUnmarkCompletedPath(pathId)}
                        >
                          <FormattedMessage id="routeInfoPanel.completed" defaultMessage="Completed" />
                        </Button>
                      ) : (
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<Check />}
                          onClick={() => handleMarkAsCompleted(completePath)}
                        >
                          <FormattedMessage id="routeInfoPanel.markCompleted" defaultMessage="Mark as Completed" />
                        </Button>
                      )}
                    </div>

                    <div className="bg-gray-100 dark:bg-[#222] p-2 rounded mt-2">
                      <div className="flex flex-col gap-2 px-2">
                        <div className='flex justify-between gap-4'>
                          <div className="text-sm">
                            <span className="text-black dark:text-white mr-1">
                              <FormattedMessage id="routeInfoPanel.expense" defaultMessage="Expense" />:
                            </span>
                            <span className="text-blue-400">{completePath.totalUsdPrice.toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                          </div>
                          <div className="text-sm">
                            {/* Third-party price in user's selected currency */}
                            <span className="text-blue-400">{completePath.totalThirdPartyPrice.toLocaleString(locale, { style: 'currency', currency: currency })}</span>
                          </div>
                        </div>

                        <div className='flex justify-between gap-4'>
                          <div className="text-sm">
                            <span className="text-black dark:text-white mr-1">
                              <FormattedMessage id="routeInfoPanel.total" defaultMessage="Total" />:
                            </span>
                            <span className="text-blue-400">
                              <span>{(completePath.totalUsdPrice + completePath.totalThirdPartyPrice / exchangeRate).toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                              {conciergeValue !== "0" && <span> + </span>}
                              {conciergeValue !== "0" && <span>{(completePath.totalThirdPartyPrice / exchangeRate * parseFloat(conciergeValue)).toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-blue-400">
                              {(completePath.totalUsdPrice * exchangeRate + completePath.totalThirdPartyPrice).toLocaleString(locale, { style: 'currency', currency })}
                              {conciergeValue !== "0" && <span> + </span>}
                              {conciergeValue !== "0" && <span>{(completePath.totalThirdPartyPrice * parseFloat(conciergeValue)).toLocaleString(locale, { style: 'currency', currency })}</span>}
                            </span>
                          </div>
                        </div>

                        {sortByNewInvestment && (
                          <>
                            <Divider className="w-full" />
                            <div className='flex justify-between gap-4'>
                              <div className="text-sm">
                                <span className="text-black dark:text-white mr-1">
                                  <FormattedMessage id="routeInfoPanel.newInvestment" defaultMessage="New Investment" />:
                                </span>
                                <span className="text-blue-400">{newUsdCost.toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                                <Tooltip arrow title={
                                  <span style={{ fontSize: '14px' }}>
                                    <FormattedMessage 
                                      id="routeInfoPanel.newInvestmentExplanation" 
                                      defaultMessage="New investment only includes costs of uncompleted edges excluding hangar CCUs. Both completed paths and hangar CCUs are treated as free in this calculation."
                                    />
                                  </span>
                                }>
                                  <InfoOutlined sx={{ fontSize: 14, marginLeft: '4px' }} />
                                </Tooltip>
                              </div>
                              <div className="text-sm">
                                <span className="text-blue-400">{newCnyCost.toLocaleString(locale, { style: 'currency', currency: currency })}</span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-3">
                      {startShip && (
                        <div className="mb-3 p-2 bg-gray-50 dark:bg-[#222] rounded">
                          <div className="flex items-center gap-2 mb-2">
                            <img
                              src={startShip.medias.productThumbMediumAndSmall}
                              alt={startShip.name}
                              className="w-8 h-8 rounded object-cover"
                            />
                            <span className="font-medium">{startShip.name}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              <FormattedMessage id="routeInfoPanel.startShipPrice" defaultMessage="Start Ship Price ($)" />
                            </label>
                            <Input
                              type="number"
                              className="w-24"
                              inputProps={{ min: 0, max: startShip.msrp / 100, step: 1 }}
                              value={startShipPrices[completePath.startNodeId] || ""}
                              onChange={(e) => handleStartShipPriceChange(completePath.startNodeId, e.target.value)}
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {completePath.edges.map((pathEdge, edgeIndex) => {
                          const { usdPrice, tpPrice } = pathFinderService.getPriceInfo(pathEdge.edge);
                          const sourceType = pathEdge.edge.data?.sourceType || CcuSourceType.OFFICIAL;

                          const isEdgeCompleted = pathEdge.edge.data?.sourceShip && pathEdge.edge.data?.targetShip &&
                            pathFinderService.isEdgeCompleted(
                              String(pathEdge.edge.data.sourceShip.id),
                              String(pathEdge.edge.data.targetShip.id),
                              pathEdge.edge,  // 传入完整的边信息
                              completePath    // 传入当前完整路径
                            );

                          return (
                            <div
                              key={edgeIndex}
                              className={`p-2 rounded text-sm border-b border-gray-200 dark:border-gray-800 last:border-b-0 flex flex-col gap-2 ${isEdgeCompleted ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
                            >
                              <div className="flex mb-1 gap-2 justify-between w-full">
                                <div className='flex gap-4'>
                                  <img
                                    src={pathEdge.sourceNode.data?.ship?.medias.productThumbMediumAndSmall}
                                    alt={pathEdge.sourceNode.data?.ship?.name}
                                    className="w-8 h-8 rounded object-cover"
                                  />
                                  <span className="text-gray-400">
                                    <FormattedMessage id="routeInfoPanel.from" defaultMessage="From" />
                                    {' '}
                                    <span className='text-black dark:text-white'>{pathEdge.sourceNode.data?.ship?.name}</span>
                                  </span>
                                </div>
                                <div className='flex gap-4'>
                                  <span className="text-gray-400">
                                    <FormattedMessage id="routeInfoPanel.to" defaultMessage="To" />
                                    {' '}
                                    <span className='text-black dark:text-white'>{pathEdge.targetNode.data?.ship?.name}</span>
                                  </span>
                                  <img
                                    src={pathEdge.targetNode.data?.ship?.medias.productThumbMediumAndSmall}
                                    alt={pathEdge.targetNode.data?.ship?.name}
                                    className="w-8 h-8 rounded object-cover"
                                  />
                                </div>
                              </div>

                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                  {isEdgeCompleted && <span className="text-green-600 mr-1"><Check className="w-4 h-4" /></span>}
                                  <span className="text-black dark:text-white">{
                                    (() => {
                                      return ccuSourceTypeFactory.getStrategy(sourceType).getDisplayName(intl);
                                    })()
                                  }</span>{' '}
                                  <FormattedMessage id="routeInfoPanel.upgradeType" defaultMessage="Upgrade" />
                                </span>

                                {(sourceType !== CcuSourceType.THIRD_PARTY) ? (
                                  <span className="text-gray-600 dark:text-gray-400 flex gap-1">
                                    <FormattedMessage id="routeInfoPanel.price" defaultMessage="Price" />:
                                    <span className="text-black dark:text-white">
                                      {usdPrice.toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-gray-600 dark:text-gray-400 flex gap-1">
                                    <FormattedMessage id="routeInfoPanel.price" defaultMessage="Price" />:
                                    <span className="text-black dark:text-white">{tpPrice.toLocaleString(locale, { style: 'currency', currency: currency })}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 