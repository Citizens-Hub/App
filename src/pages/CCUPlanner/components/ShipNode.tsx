import { useState, useEffect, useRef } from 'react';
import { Handle, Position, Edge, XYPosition } from 'reactflow';
import { Ship, CcuSourceType, CcuEdgeData, Ccu, WbHistoryData } from '../../../types';
import { Button, IconButton, Input, Select } from '@mui/material';
import { Copy, X } from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectHangarItems } from '../../../store/upgradesStore';
import { RootState } from '../../../store';
import { FormattedMessage, useIntl } from 'react-intl';

interface ShipNodeProps {
  data: {
    ship: Ship;
    onUpdateEdge?: (sourceId: string, targetId: string, data: Partial<CcuEdgeData>) => void;
    onDeleteEdge?: (edgeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
    onDuplicateNode?: (ship: Ship, position: XYPosition) => void;
    incomingEdges?: Edge<CcuEdgeData>[];
    id: string;
    ccus: Ccu[];
    wbHistory: WbHistoryData[];
  };
  xPos: number;
  yPos: number;
  id: string;
  selected?: boolean;
}

export default function ShipNode({ data, id, selected, xPos, yPos }: ShipNodeProps) {
  const { ship, onUpdateEdge, onDeleteEdge, onDeleteNode, onDuplicateNode, incomingEdges = [], ccus, wbHistory } = data;
  const [isEditing, setIsEditing] = useState(false);
  const intl = useIntl();

  const { currency } = useSelector((state: RootState) => state.upgrades);
  const upgrades = useSelector(selectHangarItems);

  const skus = ccus.find(c => c.id === ship.id)?.skus
  const wb = skus?.find(sku => sku.price !== ship.msrp)
  const historical = wbHistory?.find(wb => wb.name.trim().toUpperCase() === ship.name.trim().toUpperCase() && wb.price !== '')

  const [edgeSettings, setEdgeSettings] = useState<{
    [key: string]: {
      sourceType: CcuSourceType;
      customPrice?: number | string;
    }
  }>({});

  // Track initialized edge IDs
  const initializedEdgesRef = useRef<Set<string>>(new Set());

  // Initialize edge settings - only initialize new edges once
  useEffect(() => {
    if (incomingEdges.length > 0) {
      setEdgeSettings(currentSettings => {
        const newSettings = { ...currentSettings };
        let hasChanges = false;

        incomingEdges.forEach(edge => {
          // Only initialize uninitialized edges
          if (!initializedEdgesRef.current.has(edge.id) && edge.data) {
            newSettings[edge.id] = {
              sourceType: edge.data.sourceType || CcuSourceType.OFFICIAL,
              customPrice: edge.data.customPrice
            };
            initializedEdgesRef.current.add(edge.id);
            hasChanges = true;
          }
        });

        // Only return new object if there are changes, otherwise return original object to avoid unnecessary re-renders
        return hasChanges ? newSettings : currentSettings;
      });
    }
  }, [incomingEdges]);

  const handleEditToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsEditing(!isEditing);
  };

  const handleDeleteNode = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onDeleteNode) {
      onDeleteNode(id);
    }
  };

  const handleDuplicateNode = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onDuplicateNode?.(ship, { x: xPos, y: yPos });
  };

  const handleSourceTypeChange = (edgeId: string, sourceType: CcuSourceType) => {
    const edge = incomingEdges.find(e => e.id === edgeId);

    setEdgeSettings(prevSettings => {
      const currentEdgeSettings = prevSettings[edgeId] || {};

      let defaultPrice: number | undefined;

      if (sourceType !== CcuSourceType.OFFICIAL &&
        currentEdgeSettings.customPrice === undefined &&
        edge?.data?.price) {
        defaultPrice = edge.data.price / 100
      }

      const newEdgeSettings = {
        ...currentEdgeSettings,
        sourceType,
        customPrice: defaultPrice !== undefined ? defaultPrice : currentEdgeSettings.customPrice
      };

      const newSettings = {
        ...prevSettings,
        [edgeId]: newEdgeSettings
      };

      if (onUpdateEdge && edgeId && edge) {
        const sourceId = edge.source;

        onUpdateEdge(sourceId, id, {
          sourceType,
          customPrice: defaultPrice !== undefined
            ? defaultPrice
            : Number(newEdgeSettings.customPrice)
        });
      }

      return newSettings;
    });
  };

  const handleCustomPriceChange = (edgeId: string, price: number | string) => {
    setEdgeSettings(prevSettings => {
      const currentEdgeSettings = prevSettings[edgeId] || {};
      const currentSourceType = currentEdgeSettings.sourceType || CcuSourceType.OFFICIAL;

      const newEdgeSettings = {
        ...currentEdgeSettings,
        sourceType: currentSourceType,
        customPrice: price
      };

      const newSettings = {
        ...prevSettings,
        [edgeId]: newEdgeSettings
      };

      if (onUpdateEdge && edgeId) {
        const edge = incomingEdges.find(e => e.id === edgeId);
        if (edge) {
          const sourceId = edge.source;

          onUpdateEdge(sourceId, id, {
            sourceType: currentSourceType,
            customPrice: Number(price)
          });
        }
      }

      return newSettings;
    });
  };

  return (
    <div className={`bg-gray-50 dark:bg-[#121212] border-2 border-blue-400 dark:border-sky-700 rounded-lg p-4 w-64 shadow-lg ${selected ? 'ring-2 ring-blue-500 dark:ring-sky-700' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ width: 15, height: 15, left: -8 }} />

      <span className="text-sm absolute left-[20px] top-[165px] text-gray-600 -translate-y-1/2">
        <FormattedMessage id="shipNode.upgradeFrom" defaultMessage="Upgrade from" />
      </span>

      <div className="flex flex-col items-center">
        <div className="w-full h-30 object-cover rounded-sm mb-12 relative">
          <div className="absolute top-2 right-2 flex flex-row gap-2">
            {wb && <div className="text-sm text-white bg-orange-400 rounded-sm py-0.5 px-2">WB</div>}
            {ship.flyableStatus !== 'Flyable' && <div className="text-sm text-white bg-sky-400 rounded-sm py-0.5 px-2">{ship.flyableStatus}</div>}
          </div>
          <img
            src={ship.medias.productThumbMediumAndSmall.replace('medium_and_small', 'large')}
            alt={ship.name}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-row items-center gap-2 mb-1">
          <h3 className="text-xl font-bold">{ship.name}</h3>
          <IconButton size="small" onClick={handleDuplicateNode}>
            <Copy className="w-3 h-3" />
          </IconButton>
        </div>

        <div className="text-sm text-gray-600 mb-2">
          <span className="font-medium">{ship.manufacturer.name}</span> ·
          <span className="ml-1">{ship.type}</span>
        </div>

        <div className="text-blue-400 font-bold py-1 px-3 rounded text-lg">
          {(ship.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </div>


        <div className="flex flex-row gap-4 mt-4">
          {incomingEdges.length > 0 && (
            <Button
              variant="outlined"
              onClick={handleEditToggle}
            >
              {isEditing ?
                <FormattedMessage id="shipNode.finishEditing" defaultMessage="Finish Editing" /> :
                <FormattedMessage id="shipNode.editUpgradePath" defaultMessage="Edit Upgrade Path" />
              }
            </Button>
          )}
          <Button
            variant="outlined"
            color="error"
            onClick={handleDeleteNode}
          >
            <FormattedMessage id="shipNode.deleteNode" defaultMessage="Delete" />
          </Button>
        </div>
      </div>

      {isEditing && incomingEdges.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <h4 className="font-bold mb-2">
            <FormattedMessage id="shipNode.upgradePathSettings" defaultMessage="Upgrade Path Settings" />
          </h4>

          {incomingEdges.map(edge => (
            <div key={edge.id} className="mb-3 p-2 rounded">
              <div className="text-sm text-black mb-1 flex flex-row items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  <FormattedMessage id="shipNode.ccuSource" defaultMessage="CCU Source" />
                </span>
                <span className='flex flex-row items-center gap-1 dark:text-white'>
                  {edge.data?.sourceShip?.name ||
                    intl.formatMessage({ id: "ccuPlanner.noData", defaultMessage: "Unknown Ship" })
                  }
                  <IconButton size='small' onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEdge?.(edge.id);
                  }}>
                    <X className='w-4 h-4' />
                  </IconButton>
                </span>
              </div>

              <div className="mb-2">
                <Select
                  className="w-full text-sm z-50"
                  size="small"
                  native
                  value={edgeSettings[edge.id]?.sourceType}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onChange={(e) => {
                    const selectedValue = e.target.value as string;

                    if (selectedValue === CcuSourceType.AVAILABLE_WB) {
                      if (wb) {
                        const sourceShip = edge.data?.sourceShip;
                        if (sourceShip) {
                          const targetWbPrice = wb.price / 100;
                          const sourceShipPrice = sourceShip.msrp / 100;
                          const actualPrice = targetWbPrice - sourceShipPrice;
                          handleCustomPriceChange(edge.id, Math.max(0, actualPrice));
                        } else {
                          handleCustomPriceChange(edge.id, wb.price / 100);
                        }
                      }
                    } else if (selectedValue === CcuSourceType.HANGER) {
                      handleCustomPriceChange(edge.id, upgrades.ccus.find(upgrade => {
                        const from = upgrade.parsed.from.toUpperCase()
                        const to = upgrade.parsed.to.toUpperCase()

                        return from === edge.data?.sourceShip?.name.trim().toUpperCase() && to === edge.data?.targetShip?.name.trim().toUpperCase()
                      })?.value || 0)
                    } else if (selectedValue === CcuSourceType.HISTORICAL) {
                      handleCustomPriceChange(edge.id, Number(historical?.price) - Number(edge?.data?.sourceShip?.msrp) / 100)
                    }
                    handleSourceTypeChange(edge.id, selectedValue as CcuSourceType);
                  }}
                >
                  <option value={CcuSourceType.OFFICIAL}>
                    {intl.formatMessage({ id: "shipNode.official", defaultMessage: "Official" })}
                  </option>
                  {wb && Number(edge?.data?.sourceShip?.msrp) < wb.price && (
                    <option value={CcuSourceType.AVAILABLE_WB}>
                      {intl.formatMessage({ id: "shipNode.availableWB", defaultMessage: "WB" })}: {(wb.price / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </option>
                  )}
                  {historical && Number(edge?.data?.sourceShip?.msrp) / 100 < Number(historical.price) && (
                    <option value={CcuSourceType.HISTORICAL}>
                      {intl.formatMessage({ id: "shipNode.historical", defaultMessage: "Historical" })}: {(Number(historical.price) - Number(edge?.data?.sourceShip?.msrp) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </option>
                  )}
                  {
                    upgrades.ccus.find(upgrade => {
                      const from = upgrade.parsed.from.toUpperCase()
                      const to = upgrade.parsed.to.toUpperCase()

                      return from === edge.data?.sourceShip?.name.trim().toUpperCase() && to === edge.data?.targetShip?.name.trim().toUpperCase()
                    }) && <option value={CcuSourceType.HANGER}>
                      {intl.formatMessage({ id: "shipNode.hangar", defaultMessage: "Hangar" })}:&nbsp;
                      {upgrades.ccus.find(upgrade => {
                        const from = upgrade.parsed.from.toUpperCase()
                        const to = upgrade.parsed.to.toUpperCase()

                        return from === edge.data?.sourceShip?.name.trim().toUpperCase() && to === edge.data?.targetShip?.name.trim().toUpperCase()
                      })?.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </option>
                  }
                  <option value={CcuSourceType.OFFICIAL_WB}>
                    {intl.formatMessage({ id: "shipNode.manualOfficialWB", defaultMessage: "Manual: Official WB CCU" })}
                  </option>
                  <option value={CcuSourceType.THIRD_PARTY}>
                    {intl.formatMessage({ id: "shipNode.manualThirdParty", defaultMessage: "Manual: Third Party CCU" })}
                  </option>
                </Select>
              </div>

              {(edgeSettings[edge.id]?.sourceType === CcuSourceType.OFFICIAL_WB ||
                edgeSettings[edge.id]?.sourceType === CcuSourceType.THIRD_PARTY) && (
                  <div className="mb-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1 text-left">
                      {edgeSettings[edge.id]?.sourceType === CcuSourceType.OFFICIAL_WB ?
                        intl.formatMessage({ id: "shipNode.priceUSD", defaultMessage: "Price (USD)" }) :
                        edgeSettings[edge.id]?.sourceType === CcuSourceType.HANGER ?
                          intl.formatMessage({ id: "shipNode.priceUSD", defaultMessage: "Price (USD)" }) :
                          intl.formatMessage({ id: "shipNode.priceCNY", defaultMessage: "Price ({currency})" }, { currency })
                      }:
                    </label>
                    <Input
                      type="number"
                      className="text-sm w-full"
                      value={edgeSettings[edge.id]?.customPrice ?? edge.data?.customPrice ?? ''}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      onChange={(e) => handleCustomPriceChange(edge.id, e.target.value)}
                      placeholder={edgeSettings[edge.id]?.sourceType === CcuSourceType.OFFICIAL_WB ||
                        edgeSettings[edge.id]?.sourceType === CcuSourceType.HANGER ? 'USD' : currency}
                    />
                  </div>
                )}
            </div>
          ))}
        </div>
      )}

      <span className="text-sm absolute right-[20px] top-[165px] text-gray-600 -translate-y-1/2">
        <FormattedMessage id="shipNode.upgradeTo" defaultMessage="Upgrade to" />
      </span>

      <Handle type="source" position={Position.Right} style={{ width: 15, height: 15, right: -8 }} />
    </div>
  );
} 