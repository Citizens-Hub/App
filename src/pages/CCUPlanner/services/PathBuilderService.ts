import { Ship, Ccu, WbHistoryData, HangarItem, ImportItem, PriceHistoryEntity } from '../../../types';
import { CcuSourceType, CcuEdgeData } from '../../../types';
import { Node, Edge } from 'reactflow';

interface ShipNodeData {
  ship: Ship;
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  id: string;
  [key: string]: unknown;
}

export class PathBuilderService {
  /**
   * Create upgrade path
   */
  createPath(params: {
    stepShips: Ship[][];
    ships: Ship[];
    ccus: Ccu[];
    wbHistory: WbHistoryData[];
    hangarItems: HangarItem[];
    importItems: ImportItem[];
    priceHistoryMap: Record<number, PriceHistoryEntity>;
  }): { nodes: Node<ShipNodeData>[]; edges: Edge<CcuEdgeData>[] } {
    const { stepShips, ccus, wbHistory, hangarItems, importItems, priceHistoryMap } = params;
    if (stepShips.length < 2) return { nodes: [], edges: [] };

    const startPosition = { x: 100, y: 100 };
    
    const newNodes: Node<ShipNodeData>[] = [];
    const newEdges: Edge<CcuEdgeData>[] = [];

    const targetShips = stepShips[1];
    const sourceShips = stepShips[0];

    // Get all ships and sort them by price
    const allShips = [...sourceShips, ...targetShips];
    const uniqueShips = this._getUniqueShips(allShips);
    
    // Create a mapping of ships to actual prices
    const shipActualPrices = new Map<string, number>();
    uniqueShips.forEach(ship => {
      shipActualPrices.set(ship.id.toString(), this._getShipPrice(ship, ccus, wbHistory, stepShips[1], priceHistoryMap));
    });
    
    // Sort ships by actual price
    const sortedShips = [...uniqueShips].sort((a, b) =>
      (shipActualPrices.get(a.id.toString()) || 0) - (shipActualPrices.get(b.id.toString()) || 0)
    );
    
    // Create price level mapping
    const priceLevels = this._createPriceLevels(sortedShips, shipActualPrices);
    const sortedPriceLevels = Array.from(priceLevels.keys()).sort((a, b) => a - b);
    
    // Create nodes for each price level
    const shipNodeMap = this._createNodesForPriceLevels(
      priceLevels, 
      sortedPriceLevels, 
      startPosition, 
      ccus, 
      wbHistory,
      newNodes
    );
    
    // Create level ships array
    const levelShips = this._createLevelShipsArray(shipNodeMap, sortedPriceLevels, shipActualPrices);
    
    // Create upgrade edges
    this._createUpgradeEdges(
      levelShips, 
      stepShips, 
      sourceShips, 
      targetShips, 
      ccus, 
      wbHistory, 
      priceHistoryMap,
      hangarItems, 
      importItems,
      shipActualPrices,
      newEdges
    );
    
    return { nodes: newNodes, edges: newEdges };
  }
  
  /**
   * Get unique ship list
   */
  private _getUniqueShips(ships: Ship[]): Ship[] {
    return ships.filter((ship, index, self) =>
      index === self.findIndex(s => s.id === ship.id)
    );
  }
  
  /**
   * Get ship price (considering discounts)
   */
  private _getShipPrice(ship: Ship, ccus: Ccu[], _wbHistory: WbHistoryData[], targetShips: Ship[], priceHistoryMap: Record<number, PriceHistoryEntity>): number {
    // First check if it is a historical or WB named ship
    let checkedShipName = ship.name;

    // Handle the case where the ship data does not contain a suffix but stepShips contains it
    const matchingTargetShip = targetShips.find(s =>
      s.id === ship.id && (s.name.endsWith('-wb') || s.name.endsWith('-historical'))
    );

    if (matchingTargetShip) {
      checkedShipName = matchingTargetShip.name;
    }

    // const actualShipName = checkedShipName.replace('-wb', '').replace('-historical', '');

    if (checkedShipName.endsWith('-wb')) {
      return ccus.find(c => c.id === ship.id)?.skus.find(sku => sku.price !== ship.msrp && sku.available)?.price || ship.msrp;
    } else if (checkedShipName.endsWith('-historical')) {
      const historicalPrice = priceHistoryMap[ship.id]?.history.find(h => h.msrp !== h.baseMsrp)?.msrp

      // const historicalPrice = Number(wbHistory.find(wb =>
      //   wb.name.toUpperCase() === actualShipName.toUpperCase() ||
      //   wb.name.toUpperCase() === ship.name.trim().toUpperCase())?.price) * 100;

      return historicalPrice || ship.msrp;
    }
    return ship.msrp;
  }
  
  /**
   * Create price levels
   */
  private _createPriceLevels(sortedShips: Ship[], shipActualPrices: Map<string, number>): Map<number, Ship[]> {
    const priceLevels: Map<number, Ship[]> = new Map();
    sortedShips.forEach(ship => {
      const price = shipActualPrices.get(ship.id.toString())!;
      if (!priceLevels.has(price)) {
        priceLevels.set(price, []);
      }
      priceLevels.get(price)?.push(ship);
    });
    return priceLevels;
  }
  
  /**
   * Create nodes for price levels
   */
  private _createNodesForPriceLevels(
    priceLevels: Map<number, Ship[]>,
    sortedPriceLevels: number[],
    startPosition: { x: number, y: number },
    ccus: Ccu[],
    wbHistory: WbHistoryData[],
    newNodes: Node<ShipNodeData>[]
  ): Map<string, Node<ShipNodeData>> {
    let levelX = startPosition.x;
    const levelSpacing = 500; // 价格层级之间的水平间距
    const shipNodeMap: Map<string, Node<ShipNodeData>> = new Map(); // 跟踪已创建的节点
    
    sortedPriceLevels.forEach((price, levelIndex) => {
      const shipsAtLevel = priceLevels.get(price) || [];

      // Calculate the vertical spacing for the current level
      const nodeHeight = 500;
      const levelY = startPosition.y;
      const shipsSpacing = Math.max(nodeHeight, 600 / (shipsAtLevel.length || 1));

      shipsAtLevel.forEach((ship, shipIndex) => {
        // Check if the ship node already exists
        const shipKey = `${ship.id}`;
        if (shipNodeMap.has(shipKey)) {
          return; // If the node already exists, skip it
        }

        const yPos = levelY + shipIndex * shipsSpacing;
        const timestamp = Date.now();
        const nodeId = `ship-${ship.id}-${timestamp + shipIndex + levelIndex * 100}`;

        const shipNode: Node<ShipNodeData> = {
          id: nodeId,
          type: 'ship',
          position: { x: levelX, y: yPos },
          data: {
            ship: {
              ...ship,
              name: ship.name.replace('-historical', '').replace('-wb', '')
            },
            ccus,
            wbHistory,
            id: nodeId
          },
        };

        newNodes.push(shipNode);
        shipNodeMap.set(shipKey, shipNode);
      });

      // Move to the next price level
      levelX += levelSpacing;
    });
    
    return shipNodeMap;
  }
  
  /**
   * Create level ships array
   */
  private _createLevelShipsArray(
    shipNodeMap: Map<string, Node<ShipNodeData>>,
    sortedPriceLevels: number[],
    shipActualPrices: Map<string, number>
  ): Node<ShipNodeData>[][] {
    const createdNodes = Array.from(shipNodeMap.values());
    const levelShips: Node<ShipNodeData>[][] = [];

    for (let i = 0; i < sortedPriceLevels.length; i++) {
      const currentPrice = sortedPriceLevels[i];

      // Get nodes for the current price level
      const currentLevelShips = createdNodes.filter(node => {
        const ship = node.data.ship as Ship;
        const actualPrice = shipActualPrices.get(ship.id.toString());
        return actualPrice !== undefined && Math.abs(actualPrice - currentPrice) < 1;
      });

      levelShips.push(currentLevelShips);
    }
    
    return levelShips;
  }
  
  /**
   * Create upgrade edges
   */
  private _createUpgradeEdges(
    levelShips: Node<ShipNodeData>[][],
    stepShips: Ship[][],
    _sourceShips: Ship[],
    _targetShips: Ship[],
    ccus: Ccu[],
    wbHistory: WbHistoryData[],
    priceHistoryMap: Record<number, PriceHistoryEntity>,
    hangarItems: HangarItem[],
    _importItems: ImportItem[],
    _shipActualPrices: Map<string, number>,
    newEdges: Edge<CcuEdgeData>[]
  ): void {
    levelShips.forEach((level, index) => {
      level.forEach(targetShip => {
        for (let i = index - 1; i >= 0; i--) {
          const sourceShips = levelShips[i].filter(ship => {
            const originShip = stepShips[1].find(s => s.id === ship.data.ship.id);
            const targetShipCost = this._getShipPrice(targetShip.data.ship, ccus, wbHistory, stepShips[1], priceHistoryMap);

            const exactMatchCCU = (hangarItems.some(upgrade => 
              upgrade.fromShip?.toUpperCase() === ship.data.ship.name.trim().toUpperCase() && 
              upgrade.toShip?.toUpperCase() === targetShip.data.ship.name.trim().toUpperCase()
            ));

            if (ship.data.ship.msrp >= targetShipCost && !exactMatchCCU) {
              return false;
            }

            if (stepShips[0].find(s => s.id === ship.data.ship.id)) {
              return true;
            }

            return originShip?.name.endsWith('-wb') || 
              originShip?.name.endsWith('-historical') || 
              // If sourceShip is upgraded from a hangar CCU, it can have an outbound edge
              hangarItems.some(upgrade => upgrade.toShip?.toUpperCase() === ship.data.ship.name.trim().toUpperCase()) ||
              // If sourceShip and targetShip are directly matched by a CCU, it can have an outbound edge
              exactMatchCCU;
          });

          if (sourceShips.length > 0) {
            sourceShips.forEach(sourceShip => {
              const priceDifference = targetShip.data.ship.msrp - sourceShip.data.ship.msrp;

              const hangarCcu = hangarItems.find(upgrade => {
                const from = upgrade.fromShip?.toUpperCase();
                const to = upgrade.toShip?.toUpperCase();
                return from === sourceShip.data.ship.name.trim().toUpperCase() && to === targetShip.data.ship.name.trim().toUpperCase();
              });

              const edgeData: CcuEdgeData = {
                price: priceDifference,
                sourceShip: sourceShip.data.ship,
                targetShip: targetShip.data.ship,
                sourceType: CcuSourceType.OFFICIAL,
                // ccus,
                // wbHistory,
                // hangarItems,
                // importItems,
                // priceHistoryMap
              };

              if (hangarCcu) {
                // If there is a hangar CCU, use it
                edgeData.sourceType = CcuSourceType.HANGER;
                edgeData.customPrice = hangarCcu.price;
              } else {
                // Handle special price cases
                const targetShipNameInPath = stepShips[1].find(ship => ship.id === targetShip.data.ship.id)?.name;

                if (targetShipNameInPath?.endsWith('-historical')) {
                  const historicalPrice = Number(wbHistory.find(wb =>
                    wb.name.toUpperCase() === targetShipNameInPath.toUpperCase() ||
                    wb.name.toUpperCase() === targetShip.data.ship.name.trim().toUpperCase())?.price) * 100 || targetShip.data.ship.msrp;

                  if (historicalPrice && historicalPrice !== targetShip.data.ship.msrp) {
                    const historicalPriceUSD = historicalPrice / 100;
                    const sourcePriceUSD = sourceShip.data.ship.msrp / 100;
                    const actualPrice = historicalPriceUSD - sourcePriceUSD;

                    // Ensure the price difference is greater than 0
                    if (actualPrice <= 0) {
                      return;
                    }

                    edgeData.sourceType = CcuSourceType.HISTORICAL;
                    edgeData.customPrice = Math.max(0, actualPrice);
                  }
                }
                else if (targetShipNameInPath?.endsWith('-wb')) {
                  const wbPrice = ccus.find(c => c.id === targetShip.data.ship.id)?.skus.find(sku =>
                    sku.price !== targetShip.data.ship.msrp && sku.available)?.price || targetShip.data.ship.msrp;

                  if (wbPrice && wbPrice !== targetShip.data.ship.msrp) {
                    const wbPriceUSD = wbPrice / 100;
                    const sourcePriceUSD = sourceShip.data.ship.msrp / 100;
                    const actualPrice = wbPriceUSD - sourcePriceUSD;

                    // Ensure the price difference is greater than 0
                    if (actualPrice <= 0) {
                      return;
                    }

                    edgeData.sourceType = CcuSourceType.AVAILABLE_WB;
                    edgeData.customPrice = Math.max(0, actualPrice);
                  }
                }
                else {
                  const targetShipSkus = ccus.find(c => c.id === targetShip.data.ship.id)?.skus;
                  const targetWb = targetShipSkus?.find(sku => sku.price !== targetShip.data.ship.msrp && sku.available);

                  if (targetWb && sourceShip.data.ship.msrp < targetWb.price) {
                    const targetWbPrice = targetWb.price / 100;
                    const sourceShipPrice = sourceShip.data.ship.msrp / 100;
                    const actualPrice = targetWbPrice - sourceShipPrice;

                    // Ensure the price difference is greater than 0
                    if (actualPrice <= 0) {
                      return;
                    }

                    edgeData.sourceType = CcuSourceType.AVAILABLE_WB;
                    edgeData.customPrice = Math.max(0, actualPrice);
                  }
                }
              }

              const newEdge: Edge<CcuEdgeData> = {
                id: `edge-${sourceShip.id}-${targetShip.id}`,
                source: sourceShip.id,
                target: targetShip.id,
                type: 'ccu',
                animated: true,
                data: edgeData
              };

              newEdges.push(newEdge);
            });

            break;
          }
        }
      });
    });
  }
}

export default PathBuilderService; 