import { useMemo, useState, useEffect } from 'react';
import { Ship, CcuSourceType, CcuEdgeData } from '../../../types';
import { Edge, Node } from 'reactflow';
import { Button, Input, Switch, Tooltip, IconButton } from '@mui/material';
import { InfoOutlined, ArrowBackIos, ArrowForwardIos } from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';
import pathFinderService from '../services/PathFinderService';
import { CcuSourceTypeStrategyFactory } from '../services/CcuSourceTypeFactory';

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
  exchangeRates
}: RouteInfoPanelProps) {
  const [conciergeValue, setConciergeValue] = useState(localStorage.getItem('conciergeValue') || "0.1");
  const [pruneOpt, setPruneOpt] = useState(localStorage.getItem('pruneOpt') === 'true');
  const [currentPage, setCurrentPage] = useState(0);
  const { currency } = useSelector((state: RootState) => state.upgrades);
  const exchangeRate = exchangeRates[currency.toLowerCase()];
  const intl = useIntl();
  const { locale } = intl;
  const ccuSourceTypeFactory = useMemo(() => CcuSourceTypeStrategyFactory.getInstance(), []);

  // Initialize the starting ship price to msrp/100 USD
  useEffect(() => {
    const startNodes = pathFinderService.findStartNodes(edges, nodes);

    startNodes.forEach(node => {
      // Only set the default price for nodes that haven't been set
      if (node.data?.ship?.msrp && startShipPrices[node.id] === undefined) {
        onStartShipPriceChange(node.id, node.data.ship.msrp / 100);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const handleStartShipPriceChange = (nodeId: string, price: string) => {
    onStartShipPriceChange(nodeId, price);
  };

  const completePaths = useMemo(() => {
    if (!selectedNode) return [];

    // Reset node minimum cost
    pathFinderService.resetNodeBestCost();

    const startNodes = pathFinderService.findStartNodes(edges, nodes);
    const allPathIds: string[][] = [];

    // Find all paths from each starting node to the target node
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

    return pathFinderService.buildCompletePaths(allPathIds, edges, nodes, startShipPrices);
  }, [selectedNode, edges, nodes, startShipPrices, exchangeRate, conciergeValue, pruneOpt]);

  const sortedPaths = useMemo(() => {
    if (!completePaths.length) return [];
    return [...completePaths].sort((a, b) => {
      return pathFinderService.calculateTotalCost(a.totalUsdPrice, a.totalCnyPrice, exchangeRate, conciergeValue) - 
             pathFinderService.calculateTotalCost(b.totalUsdPrice, b.totalCnyPrice, exchangeRate, conciergeValue);
    });
  }, [completePaths, exchangeRate, conciergeValue]);

  const totalPages = sortedPaths.length;
  
  const goToNextPage = () => {
    setCurrentPage((prev) => (prev + 1) % totalPages);
  };

  const goToPrevPage = () => {
    setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  };

  useEffect(() => {
    setCurrentPage(0); // 重置为第一页当选择的节点改变时
  }, [selectedNode]);

  if (!selectedNode) return null;

  return (
    <div className="absolute right-0 top-0 w-full sm:w-fit sm:min-w-[400px] h-full bg-white dark:bg-[#121212] border-l border-gray-200 dark:border-gray-800 p-4 shadow-lg overflow-y-auto z-10">
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
            <label htmlFor="prunePath" className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <FormattedMessage id="routeInfoPanel.pruneOpt" defaultMessage="Pruning optimization" />
              <Tooltip arrow title={
                <span style={{ fontSize: '14px' }}>
                  <FormattedMessage id="routeInfoPanel.pruneOptTooltip" defaultMessage="If checked, the upgrade paths have been pruned to ensure calculations can be completed in a reasonable time. Only the first path is guaranteed to be optimal, not all possible alternatives are guaranteed to be shown"/>
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
          {/* 分页导航 */}
          <div className="flex justify-between items-center mb-4">
            <IconButton onClick={goToPrevPage} disabled={totalPages <= 1}>
              <ArrowBackIos fontSize="small" />
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
              <ArrowForwardIos fontSize="small" />
            </IconButton>
          </div>

          {/* 只显示当前页的路径 */}
          {sortedPaths.length > 0 && (
            <div className="space-y-6">
              {(() => {
                const completePath = sortedPaths[currentPage];
                const pathIndex = currentPage;
                const startNode = nodes.find(n => n.id === completePath.startNodeId);
                const startShip = startNode?.data?.ship as Ship;

                return (
                  <div key={pathIndex}>
                    {/* 价格总结 */}
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
                            <span className="text-blue-400">{completePath.totalCnyPrice.toLocaleString(locale, { style: 'currency', currency: currency })}</span>
                          </div>
                        </div>
                        <div className='flex justify-between gap-4'>
                          <div className="text-sm">
                            <span className="text-black dark:text-white mr-1">
                              <FormattedMessage id="routeInfoPanel.total" defaultMessage="Total" />:
                            </span>
                            <span className="text-blue-400">
                              <span>{(completePath.totalUsdPrice + completePath.totalCnyPrice / 7.3).toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                              {conciergeValue !== "0" && <span> + </span>}
                              {conciergeValue !== "0" && <span>{(completePath.totalCnyPrice / 7.3 * parseFloat(conciergeValue)).toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-blue-400">
                              {(completePath.totalUsdPrice * exchangeRate + completePath.totalCnyPrice).toLocaleString(locale, { style: 'currency', currency })}
                              {conciergeValue !== "0" && <span> + </span>}
                              {conciergeValue !== "0" && <span>{(completePath.totalCnyPrice * parseFloat(conciergeValue)).toLocaleString(locale, { style: 'currency', currency })}</span>}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      {/* 起点船价格设置 */}
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

                          return (
                            <div key={edgeIndex} className="p-2 rounded text-sm border-b border-gray-200 dark:border-gray-800 last:border-b-0 flex flex-col gap-2">
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
                                <span className="text-gray-600 dark:text-gray-400">
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
                                    <span className="text-black dark:text-white">{usdPrice.toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
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