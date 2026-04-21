import { memo, useState, useEffect, useRef } from 'react';
import { Handle, Position, Edge, XYPosition } from 'reactflow';
import { Ship, CcuSourceType, CcuEdgeData } from '@/types';
import { Button, IconButton, Input, Select, Tooltip } from '@mui/material';
import { Copy, Info, X } from 'lucide-react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { FormattedMessage, useIntl } from 'react-intl';
import { useLocale } from '@/contexts/LocaleContext';
import { localizeShipStatus, localizeShipType } from '@/data/shipMetadataI18n';
import { useCcuPlanner } from '../context/useCcuPlanner';
import { getShipDisplayName } from '@/utils/shipDisplay';
import {
  CcuConcretePricingOption,
  findMatchingConcretePricingOption,
  getAvailableWbPricingOptions,
  getExpectedWbPricingOptions,
  getHistoricalPricingOptions,
  getPriceIncreasePricingOptions
} from '../services/CcuPriceOptions';

interface ShipNodeProps {
  data: {
    ship: Ship;
    onUpdateEdge?: (sourceId: string, targetId: string, data: Partial<CcuEdgeData>) => void;
    onDeleteEdge?: (edgeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
    onDuplicateNode?: (ship: Ship, position: XYPosition) => void;
    onOpenShipInfo?: (ship: Ship) => void;
    onOpenShipContextMenu?: (event: React.MouseEvent<HTMLElement>, ship: Ship) => void;
    incomingEdges?: Edge<CcuEdgeData>[];
    id: string;
  };
  xPos: number;
  yPos: number;
  id: string;
  selected?: boolean;
}

interface ShipNodeSourceSelectionOption {
  value: string;
  sourceType: CcuSourceType;
  label: string;
  pricingOption?: CcuConcretePricingOption;
}

function ShipNode({ data, id, selected, xPos, yPos }: ShipNodeProps) {
  const { ship, onUpdateEdge, onDeleteEdge, onDeleteNode, onDuplicateNode, onOpenShipInfo, onOpenShipContextMenu, incomingEdges = [] } = data;
  const [isEditing, setIsEditing] = useState(false);
  const intl = useIntl();
  const { locale } = useLocale();
  const shipDisplayName = getShipDisplayName(ship);

  // Get data and services from context
  const { ccus, wbHistory, hangarItems, importItems, edgeService, priceHistoryMap } = useCcuPlanner();

  const { currency } = useSelector((state: RootState) => state.upgrades);
  const localizedStatus = localizeShipStatus(locale, ship);
  const localizedType = localizeShipType(locale, ship.type);
  const hasAvailableWb = (ccus.find(c => c.id === ship.id)?.skus || []).some(
    sku => sku.available && sku.price !== ship.msrp
  );

  // Track initialized edge IDs
  const initializedEdgesRef = useRef<Set<string>>(new Set());
  const [edgeSettings, setEdgeSettings] = useState<{
    [key: string]: {
      sourceType: CcuSourceType;
      customPrice?: number | string;
      selectedTargetPriceCents?: number;
      selectedSourcePriceCents?: number;
    }
  }>({});

  const formatUsd = (amount: number) => amount.toLocaleString(locale, { style: 'currency', currency: 'USD' });

  const buildBasicOptionValue = (sourceType: CcuSourceType) => `basic:${sourceType}`;

  const findHangarItem = (edge: Edge<CcuEdgeData>) => hangarItems.find(item =>
    item.fromShip &&
    item.toShip &&
    item.fromShip.toUpperCase() === edge.data?.sourceShip?.name.trim().toUpperCase() &&
    item.toShip.toUpperCase() === edge.data?.targetShip?.name.trim().toUpperCase()
  );

  const findSubscriptionItem = (edge: Edge<CcuEdgeData>) => importItems.find(item =>
    item.from === edge.data?.sourceShip?.id &&
    item.to === edge.data?.targetShip?.id
  );

  const buildSelectableOptions = (edge: Edge<CcuEdgeData>): ShipNodeSourceSelectionOption[] => {
    const sourceShip = edge.data?.sourceShip;
    const targetShip = edge.data?.targetShip;
    const options: ShipNodeSourceSelectionOption[] = [{
      value: buildBasicOptionValue(CcuSourceType.OFFICIAL),
      sourceType: CcuSourceType.OFFICIAL,
      label: intl.formatMessage({ id: "shipNode.official", defaultMessage: "Official" })
    }];

    if (!sourceShip || !targetShip) {
      return options;
    }

    const pricingContext = {
      sourceShip,
      targetShip,
      ccus,
      priceHistoryMap
    };
    const subscriptionItem = findSubscriptionItem(edge);
    const hangarItem = findHangarItem(edge);

    if (subscriptionItem) {
      options.push({
        value: buildBasicOptionValue(CcuSourceType.SUBSCRIPTION),
        sourceType: CcuSourceType.SUBSCRIPTION,
        label: intl.formatMessage({ id: "shipNode.subscription", defaultMessage: "Subscription" })
      });
    }

    getAvailableWbPricingOptions(pricingContext).forEach(option => {
      options.push({
        value: option.key,
        sourceType: option.sourceType,
        pricingOption: option,
        label: `${intl.formatMessage({ id: "shipNode.availableWB", defaultMessage: "WB" })}: ${formatUsd((option.targetPriceCents || 0) / 100)} (+${formatUsd(option.customPrice)})`
      });
    });

    getHistoricalPricingOptions(pricingContext).forEach(option => {
      options.push({
        value: option.key,
        sourceType: option.sourceType,
        pricingOption: option,
        label: `${intl.formatMessage({ id: "shipNode.historical", defaultMessage: "Historical WB" })}: ${formatUsd((option.targetPriceCents || 0) / 100)} / ${formatUsd((option.sourcePriceCents || 0) / 100)} (+${formatUsd(option.customPrice)})`
      });
    });

    getExpectedWbPricingOptions(pricingContext).forEach(option => {
      options.push({
        value: option.key,
        sourceType: option.sourceType,
        pricingOption: option,
        label: `${intl.formatMessage({ id: "shipNode.expectedWB", defaultMessage: "Expected WB" })}: ${formatUsd((option.targetPriceCents || 0) / 100)} / ${formatUsd((option.sourcePriceCents || 0) / 100)} (+${formatUsd(option.customPrice)})`
      });
    });

    getPriceIncreasePricingOptions(pricingContext).forEach(option => {
      options.push({
        value: option.key,
        sourceType: option.sourceType,
        pricingOption: option,
        label: `${intl.formatMessage({ id: "shipNode.priceIncrease", defaultMessage: "Price Increase" })}: ${formatUsd((option.targetPriceCents || 0) / 100)} / ${formatUsd((option.sourcePriceCents || 0) / 100)} (+${formatUsd(option.customPrice)})`
      });
    });

    if (hangarItem) {
      options.push({
        value: buildBasicOptionValue(CcuSourceType.HANGER),
        sourceType: CcuSourceType.HANGER,
        label: `${intl.formatMessage({ id: "shipNode.hangar", defaultMessage: "Hangar" })}: ${hangarItem.price?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`
      });
    }

    options.push({
      value: buildBasicOptionValue(CcuSourceType.OFFICIAL_WB),
      sourceType: CcuSourceType.OFFICIAL_WB,
      label: intl.formatMessage({ id: "shipNode.manualOfficialWB", defaultMessage: "Manual: Official WB CCU" })
    });

    options.push({
      value: buildBasicOptionValue(CcuSourceType.THIRD_PARTY),
      sourceType: CcuSourceType.THIRD_PARTY,
      label: intl.formatMessage({ id: "shipNode.manualThirdParty", defaultMessage: "Manual: Third Party CCU" })
    });

    return options;
  };

  const getSelectedOptionValue = (
    edge: Edge<CcuEdgeData>,
    selectableOptions: ShipNodeSourceSelectionOption[]
  ): string => {
    const currentSettings = edgeSettings[edge.id];
    const sourceType = currentSettings?.sourceType ?? edge.data?.sourceType ?? CcuSourceType.OFFICIAL;

    if (
      sourceType === CcuSourceType.AVAILABLE_WB ||
      sourceType === CcuSourceType.HISTORICAL ||
      sourceType === CcuSourceType.EXPECTED_WB ||
      sourceType === CcuSourceType.PRICE_INCREASE
    ) {
      const sourceShip = edge.data?.sourceShip;
      const targetShip = edge.data?.targetShip;

      if (sourceShip && targetShip) {
        const resolvedCustomPrice = currentSettings?.customPrice === '' || currentSettings?.customPrice === undefined
          ? edge.data?.customPrice
          : Number(currentSettings.customPrice);
        const matchedOption = findMatchingConcretePricingOption({
          sourceType,
          sourceShip,
          targetShip,
          ccus,
          priceHistoryMap,
          selectedTargetPriceCents: currentSettings?.selectedTargetPriceCents ?? edge.data?.selectedTargetPriceCents,
          selectedSourcePriceCents: currentSettings?.selectedSourcePriceCents ?? edge.data?.selectedSourcePriceCents,
          customPrice: resolvedCustomPrice
        });

        if (matchedOption) {
          return matchedOption.key;
        }
      }

      const fallbackTypedOption = selectableOptions.find(option => option.sourceType === sourceType);
      if (fallbackTypedOption) {
        return fallbackTypedOption.value;
      }
    }

    const basicValue = buildBasicOptionValue(sourceType);
    if (selectableOptions.some(option => option.value === basicValue)) {
      return basicValue;
    }

    return selectableOptions[0]?.value || buildBasicOptionValue(CcuSourceType.OFFICIAL);
  };

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
              customPrice: edge.data.customPrice,
              selectedTargetPriceCents: edge.data.selectedTargetPriceCents,
              selectedSourcePriceCents: edge.data.selectedSourcePriceCents
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

  const handleOpenShipInfo = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onOpenShipInfo?.(ship);
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    onOpenShipContextMenu?.(event, ship);
  };

  const handleSourceTypeChange = (
    edgeId: string,
    selectedOption: ShipNodeSourceSelectionOption
  ) => {
    const edge = incomingEdges.find(e => e.id === edgeId);
    const sourceType = selectedOption.sourceType;

    setEdgeSettings(prevSettings => {
      const currentEdgeSettings = prevSettings[edgeId] || {};

      const newEdgeSettings = {
        ...currentEdgeSettings,
        sourceType,
        customPrice: selectedOption.pricingOption?.customPrice,
        selectedTargetPriceCents: selectedOption.pricingOption?.targetPriceCents,
        selectedSourcePriceCents: selectedOption.pricingOption?.sourcePriceCents
      };

      const newSettings = {
        ...prevSettings,
        [edgeId]: newEdgeSettings
      };

      if (onUpdateEdge && edgeId && edge) {
        const sourceId = edge.source;

        if (edge.data) {
          const updatedData = edgeService.updateEdgeData(edge.data, {
            sourceType,
            selectedOption: selectedOption.pricingOption
          }, {
            ccus,
            wbHistory,
            hangarItems,
            importItems,
            priceHistoryMap,
            currency
          });
          onUpdateEdge(sourceId, id, updatedData);

          newEdgeSettings.customPrice = updatedData.customPrice;
          newEdgeSettings.selectedTargetPriceCents = updatedData.selectedTargetPriceCents;
          newEdgeSettings.selectedSourcePriceCents = updatedData.selectedSourcePriceCents;
        }
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
        if (edge && edge.data) {
          const sourceId = edge.source;

          // Use CcuEdgeService to update edge data
          const updatedData = edgeService.updateEdgeData(
            edge.data,
            {
              sourceType: currentSourceType,
              customPrice: Number(price)
            }
          );

          onUpdateEdge(sourceId, id, updatedData);
        }
      }

      return newSettings;
    });
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      className={`bg-gray-50 dark:bg-[#121212] border-2 border-blue-400 dark:border-sky-700 rounded-lg p-4 w-64 shadow-lg ${selected ? 'ring-2 ring-blue-500 dark:ring-sky-700' : ''}`}
    >
      <Handle type="target" position={Position.Left} style={{ width: 15, height: 15, left: -8 }} />

      <span className="text-sm absolute left-[20px] top-[165px] text-gray-600 -translate-y-1/2">
        <FormattedMessage id="shipNode.upgradeFrom" defaultMessage="Upgrade from" />
      </span>

      <div className="flex flex-col items-center">
        <div className="w-full h-30 object-cover rounded-sm mb-12 relative">
          <div className="absolute top-2 right-2 flex flex-row gap-2">
            {hasAvailableWb && <div className="text-sm text-white bg-orange-400 rounded-sm py-0.5 px-2">WB</div>}
            {ship.flyableStatus !== 'Flyable' && <div className="text-sm text-white bg-sky-400 rounded-sm py-0.5 px-2">{localizedStatus}</div>}
          </div>
          <img
            src={ship.medias.productThumbMediumAndSmall.replace('medium_and_small', 'large')}
            alt={shipDisplayName || ship.name}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-row items-center gap-2 mb-1">
          <h3 className="text-xl font-bold">{shipDisplayName}</h3>
        </div>

        <div>
          <Tooltip title={intl.formatMessage({ id: 'ccuPlanner.shipMenu.viewInfo', defaultMessage: 'Ship Information' })}>
            <IconButton
              size="small"
              aria-label={intl.formatMessage({ id: 'ccuPlanner.shipMenu.viewInfo', defaultMessage: 'Ship Information' })}
              onClick={handleOpenShipInfo}
            >
              <Info className="w-4 h-4" />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={handleDuplicateNode}>
            <Copy className="w-3 h-3" />
          </IconButton>
        </div>

        <div className="text-sm text-gray-600 mb-2">
          <span className="font-medium">{ship.manufacturer.name}</span>
          <span className="mx-1">·</span>
          <span>{localizedType}</span>
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

          {incomingEdges.map(edge => {
            const selectableOptions = buildSelectableOptions(edge);
            const selectedValue = getSelectedOptionValue(edge, selectableOptions);
            const selectedSourceType = selectableOptions.find(option => option.value === selectedValue)?.sourceType
              || edgeSettings[edge.id]?.sourceType
              || edge.data?.sourceType
              || CcuSourceType.OFFICIAL;

            return (
              <div key={edge.id} className="mb-3 p-2 rounded">
                <div className="text-sm text-black mb-1 flex flex-row items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    <FormattedMessage id="shipNode.ccuSource" defaultMessage="CCU Source" />
                  </span>
                  <span className='flex flex-row items-center gap-1 dark:text-white'>
                    <span>
                      {getShipDisplayName(edge.data?.sourceShip) ||
                        edge.data?.sourceShip?.name ||
                        intl.formatMessage({ id: "ccuPlanner.noData", defaultMessage: "Unknown Ship" })
                      }
                    </span>
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
                    value={selectedValue}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    onChange={(e) => {
                      const nextOption = selectableOptions.find(option => option.value === e.target.value);
                      if (nextOption) {
                        handleSourceTypeChange(edge.id, nextOption);
                      }
                    }}
                  >
                    {selectableOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>

                {(selectedSourceType === CcuSourceType.OFFICIAL_WB ||
                  selectedSourceType === CcuSourceType.THIRD_PARTY) && (
                    <div className="mb-2">
                      <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1 text-left">
                        {selectedSourceType === CcuSourceType.OFFICIAL_WB ?
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
                        placeholder={selectedSourceType === CcuSourceType.OFFICIAL_WB ? 'USD' : currency}
                      />
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}

      <span className="text-sm absolute right-[20px] top-[165px] text-gray-600 -translate-y-1/2">
        <FormattedMessage id="shipNode.upgradeTo" defaultMessage="Upgrade to" />
      </span>

      <Handle type="source" position={Position.Right} style={{ width: 15, height: 15, right: -8 }} />
    </div>
  );
}

export default memo(ShipNode);
