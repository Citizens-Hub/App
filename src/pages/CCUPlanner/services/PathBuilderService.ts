import { Ship, Ccu, WbHistoryData, HangarItem, ImportItem, PriceHistoryEntity } from '../../../types';
import { CcuSourceType, CcuEdgeData } from '../../../types';
import { Node, Edge } from 'reactflow';

type ShipVariant = 'base' | 'wb' | 'historical';

interface ShipNodeData {
  ship: Ship;
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  id: string;
  shipVariant: ShipVariant;
  pathShipName: string;
  plannerShipKey: string;
  [key: string]: unknown;
}

interface SpecialShipPricing {
  priceCents: number;
  sourceType: CcuSourceType;
}

interface PathLayoutOptions {
  startPosition?: { x: number; y: number };
  levelSpacing?: number;
  minVerticalSpacing?: number;
  preferredLevelHeight?: number;
}

interface PathBuildOptions {
  exhaustiveEdgeSearch?: boolean;
  preferHangarCcu?: boolean;
}

export interface AutoPathBuildRequest {
  startShipId: number;
  targetShipId: number;
  rangeStartTs: number;
  rangeEndTs: number;
  includeWarbond: boolean;
  includePriceIncrease: boolean;
  ignoreTargetAvailability: boolean;
  preferHangarCcu: boolean;
}

export class PathBuilderService {
  createPath(params: {
    stepShips: Ship[][];
    ccus: Ccu[];
    wbHistory: WbHistoryData[];
    hangarItems: HangarItem[];
    importItems: ImportItem[];
    priceHistoryMap: Record<number, PriceHistoryEntity>;
    specialPricingMap?: Record<string, SpecialShipPricing>;
    layout?: PathLayoutOptions;
    options?: PathBuildOptions;
  }): { nodes: Node<ShipNodeData>[]; edges: Edge<CcuEdgeData>[] } {
    const { stepShips, ccus, wbHistory, hangarItems, importItems, priceHistoryMap, specialPricingMap, layout, options } = params;
    if (stepShips.length < 2) return { nodes: [], edges: [] };

    const startPosition = layout?.startPosition || { x: 100, y: 100 };
    const newNodes: Node<ShipNodeData>[] = [];
    const newEdges: Edge<CcuEdgeData>[] = [];

    const targetShips = stepShips[1];
    const sourceShips = stepShips[0];
    const allShips = [...sourceShips, ...targetShips];
    const uniqueShips = this._getUniqueShips(allShips);

    const shipActualPrices = new Map<string, number>();
    uniqueShips.forEach(ship => {
      shipActualPrices.set(
        this._getShipVariantKey(ship),
        this._getShipPrice(ship, ccus, wbHistory, priceHistoryMap, specialPricingMap)
      );
    });

    const sortedShips = [...uniqueShips].sort((a, b) =>
      (shipActualPrices.get(this._getShipVariantKey(a)) || 0) - (shipActualPrices.get(this._getShipVariantKey(b)) || 0)
    );

    const priceLevels = this._createPriceLevels(sortedShips, shipActualPrices);
    const sortedPriceLevels = Array.from(priceLevels.keys()).sort((a, b) => a - b);

    const shipNodeMap = this._createNodesForPriceLevels(
      priceLevels,
      sortedPriceLevels,
      startPosition,
      ccus,
      wbHistory,
      newNodes,
      layout
    );

    const levelShips = this._createLevelShipsArray(shipNodeMap, sortedPriceLevels, shipActualPrices);

    this._createUpgradeEdges(
      levelShips,
      stepShips,
      ccus,
      wbHistory,
      priceHistoryMap,
      hangarItems,
      importItems,
      specialPricingMap,
      options,
      newEdges
    );

    return { nodes: newNodes, edges: newEdges };
  }

  createAutoPath(params: {
    request: AutoPathBuildRequest;
    ships: Ship[];
    ccus: Ccu[];
    wbHistory: WbHistoryData[];
    hangarItems: HangarItem[];
    importItems: ImportItem[];
    priceHistoryMap: Record<number, PriceHistoryEntity>;
  }): { nodes: Node<ShipNodeData>[]; edges: Edge<CcuEdgeData>[] } {
    const { request, ships, ccus, wbHistory, hangarItems, importItems, priceHistoryMap } = params;
    const startShip = ships.find(ship => ship.id === request.startShipId);
    const targetShip = ships.find(ship => ship.id === request.targetShipId);

    if (!startShip || !targetShip || startShip.msrp <= 0 || targetShip.msrp <= 0 || startShip.msrp >= targetShip.msrp) {
      return { nodes: [], edges: [] };
    }

    const targetHistory = priceHistoryMap[targetShip.id]?.history || [];
    if (!request.ignoreTargetAvailability && !this._hasValidSkuInRange(targetHistory, request.rangeStartTs, request.rangeEndTs)) {
      return { nodes: [], edges: [] };
    }

    const candidateShips = ships
      .filter(ship => ship.msrp > 0 && ship.msrp >= startShip.msrp && ship.msrp <= targetShip.msrp)
      .sort((a, b) => a.msrp - b.msrp);

    if (!candidateShips.some(ship => ship.id === targetShip.id)) {
      candidateShips.push(targetShip);
    }

    const baseTargets = candidateShips.filter(ship => ship.id !== startShip.id);
    const specialPricingMap: Record<string, SpecialShipPricing> = {};
    const variantTargets: Ship[] = [];

    baseTargets.forEach(ship => {
      const history = priceHistoryMap[ship.id]?.history || [];

      if (request.includeWarbond) {
        const warbondPrices = this._findHistoryPriceOptionsInRange(
          history,
          request.rangeStartTs,
          request.rangeEndTs,
          (entry) => this._isDiscountPriceEntry(entry)
        );

        warbondPrices
          .filter(price => price < ship.msrp)
          .forEach(price => {
            const wbShip = { ...ship, name: `${ship.name}__auto_wb_${price}` };
            variantTargets.push(wbShip);
            specialPricingMap[this._getShipVariantKey(wbShip)] = {
              priceCents: price,
              sourceType: CcuSourceType.HISTORICAL
            };
          });
      }

      if (request.includePriceIncrease) {
        const standardPrices = this._findHistoryPriceOptionsInRange(
          history,
          request.rangeStartTs,
          request.rangeEndTs,
          (entry) => this._isStandardOrNormalPriceEntry(entry)
        );

        standardPrices
          .filter(price => price < ship.msrp)
          .forEach(price => {
            const historicalShip = { ...ship, name: `${ship.name}__auto_pi_${price}` };
            variantTargets.push(historicalShip);
            specialPricingMap[this._getShipVariantKey(historicalShip)] = {
              priceCents: price,
              sourceType: CcuSourceType.PRICE_INCREASE
            };
          });
      }
    });

    const stepShips: Ship[][] = [[startShip], [...baseTargets, ...variantTargets]];

    const generated = this.createPath({
      stepShips,
      ccus,
      wbHistory,
      hangarItems,
      importItems,
      priceHistoryMap,
      specialPricingMap,
      options: {
        exhaustiveEdgeSearch: true,
        preferHangarCcu: request.preferHangarCcu
      }
    });

    return this._keepOnlySavingPaths({
      nodes: generated.nodes,
      edges: generated.edges,
      startShipId: request.startShipId,
      targetShipId: request.targetShipId,
      directUpgradeCost: (targetShip.msrp - startShip.msrp) / 100
    });
  }

  private _getUniqueShips(ships: Ship[]): Ship[] {
    const seen = new Set<string>();
    return ships.filter(ship => {
      const key = this._getShipVariantKey(ship);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private _getShipVariant(shipName: string): ShipVariant {
    if (this._isWbVariantName(shipName)) return 'wb';
    if (this._isPriceIncreaseVariantName(shipName)) return 'historical';
    return 'base';
  }

  private _getBaseShipName(shipName: string): string {
    return shipName
      .replace(/__auto_(wb|pi)_\d+$/, '')
      .replace(/-historical$/, '')
      .replace(/-wb$/, '');
  }

  private _getShipVariantKey(ship: Ship): string {
    return `${ship.id}:${ship.name}`;
  }

  private _getSpecialShipPricing(
    ship: Ship,
    specialPricingMap?: Record<string, SpecialShipPricing>
  ): SpecialShipPricing | undefined {
    if (!specialPricingMap) return undefined;
    return specialPricingMap[this._getShipVariantKey(ship)];
  }

  private _isWarbondEdition(edition?: string): boolean {
    if (!edition) return false;
    const lowerEdition = edition.toLowerCase();
    return lowerEdition.includes('warbond') || lowerEdition.includes('-wb') || lowerEdition.includes(' wb');
  }

  private _isStandardEdition(edition?: string): boolean {
    if (!edition) return true;
    const lowerEdition = edition.toLowerCase();
    if (this._isWarbondEdition(edition)) return false;
    return lowerEdition.includes('standard');
  }

  private _isDiscountPriceEntry(entry: PriceHistoryEntity['history'][number]): boolean {
    if (typeof entry.msrp !== 'number') return false;
    if (typeof entry.baseMsrp === 'number' && entry.msrp < entry.baseMsrp) {
      return true;
    }
    return this._isWarbondEdition(entry.edition);
  }

  private _isStandardOrNormalPriceEntry(entry: PriceHistoryEntity['history'][number]): boolean {
    if (typeof entry.msrp !== 'number') return false;
    if (this._isDiscountPriceEntry(entry)) return false;
    if (typeof entry.baseMsrp === 'number') {
      return entry.msrp >= entry.baseMsrp;
    }
    return this._isStandardEdition(entry.edition);
  }

  private _findHistoryPriceOptionsInRange(
    history: PriceHistoryEntity['history'],
    rangeStartTs: number,
    rangeEndTs: number,
    predicate: (entry: PriceHistoryEntity['history'][number]) => boolean
  ): number[] {
    const prices = history
      .filter(entry =>
        entry.change === '+' &&
        typeof entry.msrp === 'number' &&
        entry.ts >= rangeStartTs &&
        entry.ts <= rangeEndTs &&
        predicate(entry)
      )
      .map(entry => entry.msrp as number);

    return [...new Set(prices)].sort((a, b) => a - b);
  }

  private _isWbVariantName(shipName: string): boolean {
    return shipName.endsWith('-wb') || /__auto_wb_\d+$/.test(shipName);
  }

  private _isPriceIncreaseVariantName(shipName: string): boolean {
    return shipName.endsWith('-historical') || /__auto_pi_\d+$/.test(shipName);
  }

  private _hasValidSkuInRange(
    history: PriceHistoryEntity['history'],
    rangeStartTs: number,
    rangeEndTs: number
  ): boolean {
    return history.some(entry =>
      entry.change === '+' &&
      typeof entry.msrp === 'number' &&
      typeof entry.sku === 'number' &&
      entry.ts >= rangeStartTs &&
      entry.ts <= rangeEndTs
    );
  }

  private _getShipPrice(
    ship: Ship,
    ccus: Ccu[],
    _wbHistory: WbHistoryData[],
    priceHistoryMap: Record<number, PriceHistoryEntity>,
    specialPricingMap?: Record<string, SpecialShipPricing>
  ): number {
    const specialPrice = this._getSpecialShipPricing(ship, specialPricingMap);
    if (specialPrice) {
      return specialPrice.priceCents;
    }

    if (this._isWbVariantName(ship.name)) {
      return ccus.find(c => c.id === ship.id)?.skus.find(sku => sku.price !== ship.msrp && sku.available)?.price || ship.msrp;
    }

    if (this._isPriceIncreaseVariantName(ship.name)) {
      const historicalPrice = priceHistoryMap[ship.id]?.history
        .filter(entry => entry.change === '+' && this._isStandardOrNormalPriceEntry(entry))
        .map(entry => entry.msrp as number)
        .sort((a, b) => a - b)[0];
      return historicalPrice || ship.msrp;
    }

    return ship.msrp;
  }

  private _createPriceLevels(sortedShips: Ship[], shipActualPrices: Map<string, number>): Map<number, Ship[]> {
    const priceLevels: Map<number, Ship[]> = new Map();
    sortedShips.forEach(ship => {
      const price = shipActualPrices.get(this._getShipVariantKey(ship))!;
      if (!priceLevels.has(price)) {
        priceLevels.set(price, []);
      }
      priceLevels.get(price)?.push(ship);
    });
    return priceLevels;
  }

  private _createNodesForPriceLevels(
    priceLevels: Map<number, Ship[]>,
    sortedPriceLevels: number[],
    startPosition: { x: number; y: number },
    ccus: Ccu[],
    wbHistory: WbHistoryData[],
    newNodes: Node<ShipNodeData>[],
    layout?: PathLayoutOptions
  ): Map<string, Node<ShipNodeData>> {
    let levelX = startPosition.x;
    const levelSpacing = layout?.levelSpacing || 500;
    const minVerticalSpacing = layout?.minVerticalSpacing || 500;
    const preferredLevelHeight = layout?.preferredLevelHeight || 600;
    const shipNodeMap: Map<string, Node<ShipNodeData>> = new Map();

    sortedPriceLevels.forEach((price, levelIndex) => {
      const shipsAtLevel = priceLevels.get(price) || [];
      const levelY = startPosition.y;
      const shipsSpacing = Math.max(minVerticalSpacing, preferredLevelHeight / (shipsAtLevel.length || 1));

      shipsAtLevel.forEach((ship, shipIndex) => {
        const shipKey = this._getShipVariantKey(ship);
        if (shipNodeMap.has(shipKey)) {
          return;
        }

        const yPos = levelY + shipIndex * shipsSpacing;
        const timestamp = Date.now();
        const nodeId = `ship-${ship.id}-${timestamp + shipIndex + levelIndex * 100}`;
        const shipVariant = this._getShipVariant(ship.name);

        const shipNode: Node<ShipNodeData> = {
          id: nodeId,
          type: 'ship',
          position: { x: levelX, y: yPos },
          data: {
            ship: {
              ...ship,
              name: this._getBaseShipName(ship.name)
            },
            ccus,
            wbHistory,
            id: nodeId,
            shipVariant,
            pathShipName: ship.name,
            plannerShipKey: shipKey
          }
        };

        newNodes.push(shipNode);
        shipNodeMap.set(shipKey, shipNode);
      });

      levelX += levelSpacing;
    });

    return shipNodeMap;
  }

  private _createLevelShipsArray(
    shipNodeMap: Map<string, Node<ShipNodeData>>,
    sortedPriceLevels: number[],
    shipActualPrices: Map<string, number>
  ): Node<ShipNodeData>[][] {
    const createdNodes = Array.from(shipNodeMap.values());
    const levelShips: Node<ShipNodeData>[][] = [];

    for (let i = 0; i < sortedPriceLevels.length; i++) {
      const currentPrice = sortedPriceLevels[i];
      const currentLevelShips = createdNodes.filter(node => {
        const actualPrice = shipActualPrices.get(node.data.plannerShipKey);
        return actualPrice !== undefined && Math.abs(actualPrice - currentPrice) < 1;
      });
      levelShips.push(currentLevelShips);
    }

    return levelShips;
  }

  private _createUpgradeEdges(
    levelShips: Node<ShipNodeData>[][],
    stepShips: Ship[][],
    ccus: Ccu[],
    _wbHistory: WbHistoryData[],
    priceHistoryMap: Record<number, PriceHistoryEntity>,
    hangarItems: HangarItem[],
    _importItems: ImportItem[],
    specialPricingMap: Record<string, SpecialShipPricing> | undefined,
    options: PathBuildOptions | undefined,
    newEdges: Edge<CcuEdgeData>[]
  ): void {
    const exhaustiveEdgeSearch = options?.exhaustiveEdgeSearch === true;
    const preferHangarCcu = options?.preferHangarCcu !== false;

    levelShips.forEach((level, index) => {
      level.forEach(targetShipNode => {
        for (let i = index - 1; i >= 0; i--) {
          const sourceShips = levelShips[i].filter(sourceShipNode => {
            const originShip = stepShips[1].find(s => this._getShipVariantKey(s) === sourceShipNode.data.plannerShipKey);
            const targetShipInPath = stepShips[1].find(s => this._getShipVariantKey(s) === targetShipNode.data.plannerShipKey);
            const targetShipCost = this._getShipPrice(targetShipInPath || targetShipNode.data.ship, ccus, [], priceHistoryMap, specialPricingMap);

            const exactMatchCCU = preferHangarCcu && hangarItems.some(upgrade =>
              upgrade.fromShip?.toUpperCase() === sourceShipNode.data.ship.name.trim().toUpperCase() &&
              upgrade.toShip?.toUpperCase() === targetShipNode.data.ship.name.trim().toUpperCase()
            );

            if (sourceShipNode.data.ship.msrp >= targetShipCost && !exactMatchCCU) {
              return false;
            }

            if (exhaustiveEdgeSearch) {
              return true;
            }

            if (stepShips[0].find(s => s.id === sourceShipNode.data.ship.id)) {
              return true;
            }

            return (originShip ? this._isWbVariantName(originShip.name) : false) ||
              (originShip ? this._isPriceIncreaseVariantName(originShip.name) : false) ||
              hangarItems.some(upgrade => upgrade.toShip?.toUpperCase() === sourceShipNode.data.ship.name.trim().toUpperCase()) ||
              exactMatchCCU;
          });

          if (sourceShips.length > 0) {
            sourceShips.forEach(sourceShipNode => {
              const priceDifference = targetShipNode.data.ship.msrp - sourceShipNode.data.ship.msrp;

              const hangarCcu = hangarItems.find(upgrade => {
                const from = upgrade.fromShip?.toUpperCase();
                const to = upgrade.toShip?.toUpperCase();
                return from === sourceShipNode.data.ship.name.trim().toUpperCase() && to === targetShipNode.data.ship.name.trim().toUpperCase();
              });

              const edgeData: CcuEdgeData = {
                price: priceDifference,
                sourceShip: sourceShipNode.data.ship,
                targetShip: targetShipNode.data.ship,
                sourceType: CcuSourceType.OFFICIAL
              };

              if (hangarCcu && preferHangarCcu) {
                edgeData.sourceType = CcuSourceType.HANGER;
                edgeData.customPrice = hangarCcu.price;
              } else {
                const targetShipInPath = stepShips[1].find(ship => this._getShipVariantKey(ship) === targetShipNode.data.plannerShipKey);
                const targetShipNameInPath = targetShipInPath?.name;
                const specialPricing = targetShipInPath ? this._getSpecialShipPricing(targetShipInPath, specialPricingMap) : undefined;

                if (specialPricing) {
                  const actualPrice = specialPricing.priceCents / 100 - sourceShipNode.data.ship.msrp / 100;
                  if (actualPrice <= 0) {
                    return;
                  }
                  edgeData.sourceType = specialPricing.sourceType;
                  edgeData.customPrice = Math.max(0, actualPrice);
                } else if (targetShipNameInPath && this._isPriceIncreaseVariantName(targetShipNameInPath)) {
                  const historicalPrice = priceHistoryMap[targetShipNode.data.ship.id]?.history
                    .filter(entry => entry.change === '+' && this._isStandardOrNormalPriceEntry(entry))
                    .map(entry => entry.msrp as number)
                    .sort((a, b) => a - b)[0];

                  if (historicalPrice && historicalPrice !== targetShipNode.data.ship.msrp) {
                    const actualPrice = historicalPrice / 100 - sourceShipNode.data.ship.msrp / 100;
                    if (actualPrice <= 0) {
                      return;
                    }
                    edgeData.sourceType = CcuSourceType.PRICE_INCREASE;
                    edgeData.customPrice = Math.max(0, actualPrice);
                  }
                } else if (targetShipNameInPath && this._isWbVariantName(targetShipNameInPath)) {
                  const wbPrice = ccus.find(c => c.id === targetShipNode.data.ship.id)?.skus.find(sku =>
                    sku.price !== targetShipNode.data.ship.msrp && sku.available)?.price || targetShipNode.data.ship.msrp;

                  if (wbPrice && wbPrice !== targetShipNode.data.ship.msrp) {
                    const actualPrice = wbPrice / 100 - sourceShipNode.data.ship.msrp / 100;
                    if (actualPrice <= 0) {
                      return;
                    }
                    edgeData.sourceType = CcuSourceType.AVAILABLE_WB;
                    edgeData.customPrice = Math.max(0, actualPrice);
                  }
                } else {
                  const targetShipSkus = ccus.find(c => c.id === targetShipNode.data.ship.id)?.skus;
                  const targetWb = targetShipSkus?.find(sku => sku.price !== targetShipNode.data.ship.msrp && sku.available);

                  if (targetWb && sourceShipNode.data.ship.msrp < targetWb.price) {
                    const actualPrice = targetWb.price / 100 - sourceShipNode.data.ship.msrp / 100;
                    if (actualPrice <= 0) {
                      return;
                    }
                    edgeData.sourceType = CcuSourceType.AVAILABLE_WB;
                    edgeData.customPrice = Math.max(0, actualPrice);
                  }
                }
              }

              const newEdge: Edge<CcuEdgeData> = {
                id: `edge-${sourceShipNode.id}-${targetShipNode.id}`,
                source: sourceShipNode.id,
                target: targetShipNode.id,
                type: 'ccu',
                animated: true,
                data: edgeData
              };

              newEdges.push(newEdge);
            });

            if (!exhaustiveEdgeSearch) {
              break;
            }
          }
        }
      });
    });
  }

  private _getEdgeCost(edge: Edge<CcuEdgeData>): number {
    if (!edge.data) return Number.POSITIVE_INFINITY;

    if (typeof edge.data.customPrice === 'number') {
      return edge.data.customPrice;
    }

    const sourcePrice = edge.data.sourceShip?.msrp || 0;
    const targetPrice = edge.data.targetShip?.msrp || 0;
    return (targetPrice - sourcePrice) / 100;
  }

  private _getOfficialEdgeCost(edge: Edge<CcuEdgeData>): number {
    const sourcePrice = edge.data?.sourceShip?.msrp || 0;
    const targetPrice = edge.data?.targetShip?.msrp || 0;
    return (targetPrice - sourcePrice) / 100;
  }

  private _getEdgeSavings(edge: Edge<CcuEdgeData>): number {
    const officialCost = this._getOfficialEdgeCost(edge);
    const actualCost = this._getEdgeCost(edge);
    if (!Number.isFinite(officialCost) || !Number.isFinite(actualCost)) {
      return 0;
    }
    return officialCost - actualCost;
  }

  private _keepOnlySavingPaths(params: {
    nodes: Node<ShipNodeData>[];
    edges: Edge<CcuEdgeData>[];
    startShipId: number;
    targetShipId: number;
    directUpgradeCost: number;
  }): { nodes: Node<ShipNodeData>[]; edges: Edge<CcuEdgeData>[] } {
    const { nodes, edges, startShipId, targetShipId, directUpgradeCost } = params;
    if (!nodes.length || !edges.length) {
      return { nodes: [], edges: [] };
    }

    const startNodes = nodes.filter(node => node.data.ship.id === startShipId);
    const targetNodes = new Set(nodes.filter(node => node.data.ship.id === targetShipId).map(node => node.id));

    if (!startNodes.length || !targetNodes.size) {
      return { nodes: [], edges: [] };
    }

    const outgoingMap = new Map<string, Edge<CcuEdgeData>[]>();
    edges.forEach(edge => {
      const list = outgoingMap.get(edge.source) || [];
      list.push(edge);
      outgoingMap.set(edge.source, list);
    });

    const topoNodes = [...nodes].sort((a, b) => {
      if (a.position.x !== b.position.x) {
        return a.position.x - b.position.x;
      }
      return a.position.y - b.position.y;
    });

    const distFromStart = new Map<string, number>();
    const distToTarget = new Map<string, number>();
    const bestPrevEdgeId = new Map<string, string>();
    const edgeById = new Map<string, Edge<CcuEdgeData>>();
    nodes.forEach(node => {
      distFromStart.set(node.id, Number.POSITIVE_INFINITY);
      distToTarget.set(node.id, Number.POSITIVE_INFINITY);
    });
    edges.forEach(edge => edgeById.set(edge.id, edge));

    startNodes.forEach(node => distFromStart.set(node.id, 0));
    topoNodes.forEach(node => {
      const currentCost = distFromStart.get(node.id) ?? Number.POSITIVE_INFINITY;
      if (!Number.isFinite(currentCost)) return;
      const nextEdges = outgoingMap.get(node.id) || [];
      nextEdges.forEach(edge => {
        const edgeCost = this._getEdgeCost(edge);
        if (!Number.isFinite(edgeCost) || edgeCost < 0) return;
        const nextCost = currentCost + edgeCost;
        const currentTargetCost = distFromStart.get(edge.target) ?? Number.POSITIVE_INFINITY;
        if (nextCost < currentTargetCost - 1e-6) {
          distFromStart.set(edge.target, nextCost);
          bestPrevEdgeId.set(edge.target, edge.id);
        }
      });
    });

    targetNodes.forEach(nodeId => distToTarget.set(nodeId, 0));
    [...topoNodes].reverse().forEach(node => {
      const nextEdges = outgoingMap.get(node.id) || [];
      nextEdges.forEach(edge => {
        const edgeCost = this._getEdgeCost(edge);
        const tailCost = distToTarget.get(edge.target) ?? Number.POSITIVE_INFINITY;
        if (!Number.isFinite(edgeCost) || edgeCost < 0 || !Number.isFinite(tailCost)) return;
        const candidateCost = edgeCost + tailCost;
        const currentCost = distToTarget.get(node.id) ?? Number.POSITIVE_INFINITY;
        if (candidateCost < currentCost) {
          distToTarget.set(node.id, candidateCost);
        }
      });
    });

    const sortedTargets = Array.from(targetNodes)
      .map(nodeId => ({
        nodeId,
        cost: distFromStart.get(nodeId) ?? Number.POSITIVE_INFINITY
      }))
      .sort((a, b) => a.cost - b.cost);

    const bestTarget = sortedTargets[0];
    const bestTargetCost = bestTarget?.cost ?? Number.POSITIVE_INFINITY;

    if (!Number.isFinite(bestTargetCost) || bestTargetCost >= directUpgradeCost || !bestTarget) {
      return { nodes: [], edges: [] };
    }

    const startNodeIdSet = new Set(startNodes.map(node => node.id));
    const mandatoryEdgeIds = new Set<string>();
    const visitedBacktrackNodes = new Set<string>();
    let cursorNodeId: string | undefined = bestTarget.nodeId;
    while (cursorNodeId && !startNodeIdSet.has(cursorNodeId) && !visitedBacktrackNodes.has(cursorNodeId)) {
      visitedBacktrackNodes.add(cursorNodeId);
      const prevEdgeId = bestPrevEdgeId.get(cursorNodeId);
      if (!prevEdgeId) break;
      mandatoryEdgeIds.add(prevEdgeId);
      cursorNodeId = edgeById.get(prevEdgeId)?.source;
    }

    const edgeScore = new Map<string, number>();
    const edgeSavings = new Map<string, number>();
    const candidateEdges = edges.filter(edge => {
      const sourceCost = distFromStart.get(edge.source) ?? Number.POSITIVE_INFINITY;
      const targetRemainCost = distToTarget.get(edge.target) ?? Number.POSITIVE_INFINITY;
      const edgeCost = this._getEdgeCost(edge);
      if (!Number.isFinite(sourceCost) || !Number.isFinite(targetRemainCost) || !Number.isFinite(edgeCost) || edgeCost < 0) {
        return false;
      }

      const lowerBound = sourceCost + edgeCost + targetRemainCost;
      edgeScore.set(edge.id, lowerBound);
      const savings = this._getEdgeSavings(edge);
      edgeSavings.set(edge.id, savings);
      if (mandatoryEdgeIds.has(edge.id)) {
        return true;
      }

      if (startNodeIdSet.has(edge.source) && targetNodes.has(edge.target) && savings <= 1e-6) {
        return false;
      }

      const explorationSlack = Math.max(1, Math.min(8, bestTargetCost * 0.12));
      const relaxedBound = Math.min(directUpgradeCost, bestTargetCost + explorationSlack);
      if (savings <= 1e-6) {
        const noSavingRelaxedBound = Math.min(directUpgradeCost, bestTargetCost + Math.min(2, explorationSlack * 0.5));
        return lowerBound < noSavingRelaxedBound;
      }

      return lowerBound < relaxedBound;
    });

    const maxEdgesPerSource = nodes.length > 220 ? 1 : 2;
    const maxNoSavingPerSource = 1;
    const maxTotalEdges = nodes.length > 300 ? 180 : 260;
    const maxNoSavingEdgesTotal = Math.max(20, Math.floor(maxTotalEdges * 0.16));
    const selectedEdgeIds = new Set<string>();
    const bySource = new Map<string, Edge<CcuEdgeData>[]>();

    candidateEdges.forEach(edge => {
      const list = bySource.get(edge.source) || [];
      list.push(edge);
      bySource.set(edge.source, list);
    });

    bySource.forEach(sourceEdges => {
      const sortedEdges = [...sourceEdges].sort((a, b) => {
        const scoreA = edgeScore.get(a.id) ?? Number.POSITIVE_INFINITY;
        const scoreB = edgeScore.get(b.id) ?? Number.POSITIVE_INFINITY;
        if (scoreA !== scoreB) return scoreA - scoreB;
        const savingsA = edgeSavings.get(a.id) ?? 0;
        const savingsB = edgeSavings.get(b.id) ?? 0;
        if (savingsA !== savingsB) return savingsB - savingsA;
        return this._getEdgeCost(a) - this._getEdgeCost(b);
      });

      const mandatoryInSource = sortedEdges.filter(edge => mandatoryEdgeIds.has(edge.id));
      mandatoryInSource.forEach(edge => selectedEdgeIds.add(edge.id));

      const discountedEdges = sortedEdges.filter(edge =>
        !selectedEdgeIds.has(edge.id) && (edgeSavings.get(edge.id) ?? 0) > 1e-6
      );
      const noSavingEdges = sortedEdges.filter(edge =>
        !selectedEdgeIds.has(edge.id) && (edgeSavings.get(edge.id) ?? 0) <= 1e-6
      );

      let slotsLeft = Math.max(0, maxEdgesPerSource - mandatoryInSource.length);
      discountedEdges.forEach(edge => {
        if (slotsLeft <= 0) return;
        selectedEdgeIds.add(edge.id);
        slotsLeft--;
      });

      let noSavingSlots = Math.min(maxNoSavingPerSource, slotsLeft);
      noSavingEdges.forEach(edge => {
        if (noSavingSlots <= 0) return;
        selectedEdgeIds.add(edge.id);
        noSavingSlots--;
      });
    });

    if (selectedEdgeIds.size > maxTotalEdges) {
      const mandatoryList = Array.from(selectedEdgeIds).filter(id => mandatoryEdgeIds.has(id));
      const nonMandatorySorted = Array.from(selectedEdgeIds)
        .filter(id => !mandatoryEdgeIds.has(id))
        .sort((a, b) => {
          const scoreDiff = (edgeScore.get(a) ?? Number.POSITIVE_INFINITY) - (edgeScore.get(b) ?? Number.POSITIVE_INFINITY);
          if (scoreDiff !== 0) return scoreDiff;
          const savingsDiff = (edgeSavings.get(b) ?? 0) - (edgeSavings.get(a) ?? 0);
          if (savingsDiff !== 0) return savingsDiff;
          return 0;
        });

      selectedEdgeIds.clear();
      mandatoryList.forEach(id => selectedEdgeIds.add(id));

      const slotsLeft = Math.max(0, maxTotalEdges - selectedEdgeIds.size);
      nonMandatorySorted.slice(0, slotsLeft).forEach(id => selectedEdgeIds.add(id));
    }

    const noSavingSelected = Array.from(selectedEdgeIds).filter(id =>
      !mandatoryEdgeIds.has(id) && (edgeSavings.get(id) ?? 0) <= 1e-6
    );
    if (noSavingSelected.length > maxNoSavingEdgesTotal) {
      const noSavingSorted = [...noSavingSelected].sort((a, b) =>
        (edgeScore.get(a) ?? Number.POSITIVE_INFINITY) - (edgeScore.get(b) ?? Number.POSITIVE_INFINITY)
      );
      const keepNoSaving = new Set(noSavingSorted.slice(0, maxNoSavingEdgesTotal));
      noSavingSelected.forEach(id => {
        if (!keepNoSaving.has(id)) {
          selectedEdgeIds.delete(id);
        }
      });
    }

    const keptEdges = candidateEdges.filter(edge => selectedEdgeIds.has(edge.id));
    if (!keptEdges.length) {
      return { nodes: [], edges: [] };
    }

    const nextFromStart = new Map<string, string[]>();
    const prevToTarget = new Map<string, string[]>();
    keptEdges.forEach(edge => {
      const out = nextFromStart.get(edge.source) || [];
      out.push(edge.target);
      nextFromStart.set(edge.source, out);

      const back = prevToTarget.get(edge.target) || [];
      back.push(edge.source);
      prevToTarget.set(edge.target, back);
    });

    const reachableFromStart = new Set<string>();
    const startQueue = startNodes.map(node => node.id);
    while (startQueue.length > 0) {
      const current = startQueue.shift()!;
      if (reachableFromStart.has(current)) continue;
      reachableFromStart.add(current);
      (nextFromStart.get(current) || []).forEach(next => {
        if (!reachableFromStart.has(next)) {
          startQueue.push(next);
        }
      });
    }

    const canReachTarget = new Set<string>();
    const targetQueue = Array.from(targetNodes);
    while (targetQueue.length > 0) {
      const current = targetQueue.shift()!;
      if (canReachTarget.has(current)) continue;
      canReachTarget.add(current);
      (prevToTarget.get(current) || []).forEach(prev => {
        if (!canReachTarget.has(prev)) {
          targetQueue.push(prev);
        }
      });
    }

    const keptNodeIds = new Set<string>();
    nodes.forEach(node => {
      if (reachableFromStart.has(node.id) && canReachTarget.has(node.id)) {
        keptNodeIds.add(node.id);
      }
    });

    const fullyConnectedEdges = keptEdges.filter(edge =>
      keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target)
    );
    if (!fullyConnectedEdges.length) {
      return { nodes: [], edges: [] };
    }

    const keptNodes = nodes.filter(node => keptNodeIds.has(node.id));

    return {
      nodes: this._normalizeHorizontalLayoutByDepth(keptNodes, fullyConnectedEdges, startShipId),
      edges: fullyConnectedEdges
    };
  }

  private _normalizeHorizontalLayoutByDepth(
    nodes: Node<ShipNodeData>[],
    edges: Edge<CcuEdgeData>[],
    startShipId: number
  ): Node<ShipNodeData>[] {
    if (!nodes.length) {
      return nodes;
    }

    const nodeMap = new Map<string, Node<ShipNodeData>>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    const outgoingMap = new Map<string, Edge<CcuEdgeData>[]>();
    const incomingCount = new Map<string, number>();

    nodes.forEach(node => incomingCount.set(node.id, 0));
    edges.forEach(edge => {
      const list = outgoingMap.get(edge.source) || [];
      list.push(edge);
      outgoingMap.set(edge.source, list);
      incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
    });

    const startNodeIds = nodes
      .filter(node => node.data.ship.id === startShipId)
      .map(node => node.id);

    const rootNodeIds = startNodeIds.length
      ? startNodeIds
      : nodes.filter(node => (incomingCount.get(node.id) || 0) === 0).map(node => node.id);

    if (!rootNodeIds.length) {
      return nodes;
    }

    const depthMap = new Map<string, number>();
    const queue: string[] = [];

    rootNodeIds.forEach(nodeId => {
      depthMap.set(nodeId, 0);
      queue.push(nodeId);
    });

    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      const currentDepth = depthMap.get(currentNodeId) || 0;
      const nextEdges = outgoingMap.get(currentNodeId) || [];

      nextEdges.forEach(edge => {
        if (!nodeMap.has(edge.target)) {
          return;
        }

        const nextDepth = currentDepth + 1;
        const existingDepth = depthMap.get(edge.target);

        if (existingDepth === undefined || nextDepth < existingDepth) {
          depthMap.set(edge.target, nextDepth);
          queue.push(edge.target);
        }
      });
    }

    for (let i = 0; i < nodes.length; i++) {
      let changed = false;
      edges.forEach(edge => {
        const sourceDepth = depthMap.get(edge.source);
        if (sourceDepth === undefined) return;
        const targetDepth = depthMap.get(edge.target);
        if (targetDepth === undefined || targetDepth <= sourceDepth) {
          depthMap.set(edge.target, sourceDepth + 1);
          changed = true;
        }
      });
      if (!changed) break;
    }

    const fallbackColumns = [...new Set(nodes.map(node => node.position.x))].sort((a, b) => a - b);
    const fallbackDepthMap = new Map<number, number>();
    fallbackColumns.forEach((x, index) => fallbackDepthMap.set(x, index));

    const resolvedDepth = new Map<string, number>();
    nodes.forEach(node => {
      resolvedDepth.set(node.id, depthMap.get(node.id) ?? fallbackDepthMap.get(node.position.x) ?? 0);
    });

    const nodesByDepth = new Map<number, Node<ShipNodeData>[]>();
    nodes.forEach(node => {
      const depth = resolvedDepth.get(node.id) || 0;
      const list = nodesByDepth.get(depth) || [];
      list.push(node);
      nodesByDepth.set(depth, list);
    });

    const minX = Math.min(...nodes.map(node => node.position.x));
    const minY = Math.min(...nodes.map(node => node.position.y));
    const horizontalSpacing = 500;
    const verticalSpacing = 620;
    const maxColumnSize = Math.max(...Array.from(nodesByDepth.values()).map(col => col.length));

    const layoutMap = new Map<string, { x: number; y: number }>();

    Array.from(nodesByDepth.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([depth, columnNodes]) => {
        const sortedColumnNodes = [...columnNodes].sort((a, b) => {
          const msrpDiff = (a.data.ship.msrp || 0) - (b.data.ship.msrp || 0);
          if (msrpDiff !== 0) return msrpDiff;
          return a.position.y - b.position.y;
        });

        const columnOffset = ((maxColumnSize - sortedColumnNodes.length) * verticalSpacing) / 2;

        sortedColumnNodes.forEach((node, index) => {
          layoutMap.set(node.id, {
            x: minX + depth * horizontalSpacing,
            y: minY + columnOffset + index * verticalSpacing
          });
        });
      });

    return nodes.map(node => ({
      ...node,
      position: layoutMap.get(node.id) || node.position
    }));
  }
}

export default PathBuilderService;
