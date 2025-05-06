import { useState, useEffect, useRef } from 'react';
import { Handle, Position, Edge, XYPosition } from 'reactflow';
import { Ship, CcuSourceType, CcuEdgeData, Ccu } from '../../../types';
import { Button, IconButton, Input, Select } from '@mui/material';
import { Copy, X } from 'lucide-react';
import { useSelector } from 'react-redux';
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
  };
  xPos: number;
  yPos: number;
  id: string;
  selected?: boolean;
}

export default function ShipNode({ data, id, selected, xPos, yPos }: ShipNodeProps) {
  const { ship, onUpdateEdge, onDeleteEdge, onDeleteNode, onDuplicateNode, incomingEdges = [], ccus } = data;
  const [isEditing, setIsEditing] = useState(false);
  const intl = useIntl();

  const upgrades = useSelector((state: RootState) => state.upgrades.items);

  const skus = ccus.find(c => c.id === ship.id)?.skus
  const wb = skus?.find(sku => sku.price !== ship.msrp)

  // 为每个传入的边缘设置状态
  const [edgeSettings, setEdgeSettings] = useState<{
    [key: string]: {
      sourceType: CcuSourceType;
      customPrice?: number | string;
    }
  }>({});

  // 使用ref跟踪已初始化的边缘ID
  const initializedEdgesRef = useRef<Set<string>>(new Set());

  // 初始化边缘设置 - 只对新的边缘初始化一次
  useEffect(() => {
    if (incomingEdges.length > 0) {
      setEdgeSettings(currentSettings => {
        const newSettings = { ...currentSettings };
        let hasChanges = false;

        incomingEdges.forEach(edge => {
          // 只初始化未初始化过的边缘
          if (!initializedEdgesRef.current.has(edge.id) && edge.data) {
            newSettings[edge.id] = {
              sourceType: edge.data.sourceType || CcuSourceType.OFFICIAL,
              customPrice: edge.data.customPrice
            };
            initializedEdgesRef.current.add(edge.id);
            hasChanges = true;
          }
        });

        // 只有在有变化时才返回新对象，否则返回原对象避免重渲染
        return hasChanges ? newSettings : currentSettings;
      });
    }
  }, [incomingEdges]);

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  };

  const handleDeleteNode = () => {
    if (onDeleteNode) {
      onDeleteNode(id);
    }
  };

  const handleDuplicateNode = () => {
    onDuplicateNode?.(ship, { x: xPos, y: yPos });
  };

  const handleSourceTypeChange = (edgeId: string, sourceType: CcuSourceType) => {
    // 获取当前边的数据
    const edge = incomingEdges.find(e => e.id === edgeId);

    setEdgeSettings(prevSettings => {
      // 获取当前边缘的设置
      const currentEdgeSettings = prevSettings[edgeId] || {};

      // 确定是否需要设置默认价格
      let defaultPrice: number | undefined;

      if (sourceType !== CcuSourceType.OFFICIAL &&
        currentEdgeSettings.customPrice === undefined &&
        edge?.data?.price) {
        defaultPrice = edge.data.price / 100
      }

      // 创建新的设置对象
      const newEdgeSettings = {
        ...currentEdgeSettings,
        sourceType,
        customPrice: defaultPrice !== undefined ? defaultPrice : currentEdgeSettings.customPrice
      };

      // 更新完整的设置对象
      const newSettings = {
        ...prevSettings,
        [edgeId]: newEdgeSettings
      };

      // 调用onUpdateEdge
      if (onUpdateEdge && edgeId && edge) {
        // 使用边的source作为sourceId，与CcuCanvas中updateEdgeData的调用方式一致
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
      // 获取当前的边缘设置
      const currentEdgeSettings = prevSettings[edgeId] || {};
      const currentSourceType = currentEdgeSettings.sourceType || CcuSourceType.OFFICIAL;

      // 创建新的边缘设置
      const newEdgeSettings = {
        ...currentEdgeSettings,
        sourceType: currentSourceType,
        customPrice: price
      };

      // 更新完整的设置对象
      const newSettings = {
        ...prevSettings,
        [edgeId]: newEdgeSettings
      };

      // 调用onUpdateEdge
      if (onUpdateEdge && edgeId) {
        // 获取当前边的数据
        const edge = incomingEdges.find(e => e.id === edgeId);
        if (edge) {
          // 使用边的source作为sourceId，与CcuCanvas中updateEdgeData的调用方式一致
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
    <div className={`bg-gray-50 border-2 border-blue-400 rounded-lg p-4 w-64 shadow-lg ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ width: 15, height: 15, left: -8 }} />

      <span className="text-sm absolute left-[20px] top-[165px] text-gray-600 -translate-y-1/2">
        <FormattedMessage id="shipNode.upgradeFrom" defaultMessage="Upgrade from" />
      </span>

      <div className="flex flex-col items-center">
        <img
          src={ship.medias.productThumbMediumAndSmall.replace('medium_and_small', 'large')}
          alt={ship.name}
          className="w-full h-30 object-cover rounded-sm mb-12"
        />

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

      {/* 编辑界面 */}
      {isEditing && incomingEdges.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <h4 className="font-bold mb-2">
            <FormattedMessage id="shipNode.upgradePathSettings" defaultMessage="Upgrade Path Settings" />
          </h4>

          {incomingEdges.map(edge => (
            <div key={edge.id} className="mb-3 p-2 rounded">
              <div className="text-sm text-black mb-1 flex flex-row items-center justify-between">
                <span className="text-sm text-gray-600">
                  <FormattedMessage id="shipNode.ccuSource" defaultMessage="CCU Source" />
                </span>
                <span className='flex flex-row items-center gap-1'>
                  {edge.data?.sourceShip?.name ||
                    intl.formatMessage({ id: "ccuPlanner.noData", defaultMessage: "Unknown Ship" })
                  }
                  <IconButton size='small' onClick={() => {
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
                  onChange={(e) => {
                    const selectedValue = e.target.value as string;

                    // 检查是否为AVAILABLE_WB_格式的值
                    if (selectedValue === CcuSourceType.AVAILABLE_WB) {
                      if (wb) {
                        // 计算实际升级花费
                        const sourceShip = edge.data?.sourceShip;
                        if (sourceShip) {
                          // 目标船WB价格
                          const targetWbPrice = wb.price / 100;
                          // 源船官方价格
                          const sourceShipPrice = sourceShip.msrp / 100;
                          // 实际花费是WB价格减去源船价格
                          const actualPrice = targetWbPrice - sourceShipPrice;
                          // 保存为正数
                          handleCustomPriceChange(edge.id, Math.max(0, actualPrice));
                        } else {
                          handleCustomPriceChange(edge.id, wb.price / 100);
                        }
                      }
                    } else if (selectedValue === CcuSourceType.HANGER) {
                      // 如果选择机库CCU，设置源类型但不自动设置价格
                      // 用户需要手动设置机库CCU的价格
                      if (edge.data?.customPrice === undefined) {
                        // 如果之前没有设置过价格，设置一个默认价格
                        const sourceShip = edge.data?.sourceShip;
                        const targetShip = edge.data?.targetShip;
                        if (sourceShip && targetShip) {
                          // 默认使用官方价格差作为机库CCU价格
                          const priceDiff = (targetShip.msrp - sourceShip.msrp) / 100;
                          handleCustomPriceChange(edge.id, priceDiff);
                        }
                      }
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
                  {
                    upgrades.find(upgrade => {
                      const from = upgrade.name.split("to")[0].split("-")[1].trim().toUpperCase()
                      const to = (upgrade.name.split("to")[1]).trim().split(" ").slice(0, -2).join(" ").toUpperCase()

                      return from === edge.data?.sourceShip?.name.toUpperCase() && to === edge.data?.targetShip?.name.toUpperCase()
                    }) && <option value={CcuSourceType.HANGER}>
                      {intl.formatMessage({ id: "shipNode.hanger", defaultMessage: "Hanger" })}:&nbsp;
                      {upgrades.find(upgrade => {
                        const from = upgrade.name.split("to")[0].split("-")[1].trim().toUpperCase()
                        const to = (upgrade.name.split("to")[1]).trim().split(" ").slice(0, -2).join(" ").toUpperCase()

                        return from === edge.data?.sourceShip?.name.toUpperCase() && to === edge.data?.targetShip?.name.toUpperCase()
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

              {/* 当选择官方WB或第三方或机库CCU时，显示价格输入 */}
              {(edgeSettings[edge.id]?.sourceType === CcuSourceType.OFFICIAL_WB ||
                edgeSettings[edge.id]?.sourceType === CcuSourceType.THIRD_PARTY) && (
                  <div className="mb-2">
                    <label className="text-sm text-gray-600 block mb-1 text-left">
                      {edgeSettings[edge.id]?.sourceType === CcuSourceType.OFFICIAL_WB ?
                        intl.formatMessage({ id: "shipNode.priceUSD", defaultMessage: "Price (USD)" }) :
                        edgeSettings[edge.id]?.sourceType === CcuSourceType.HANGER ?
                          intl.formatMessage({ id: "shipNode.priceUSD", defaultMessage: "Price (USD)" }) :
                          intl.formatMessage({ id: "shipNode.priceCNY", defaultMessage: "Price (CNY)" })
                      }:
                    </label>
                    <Input
                      type="number"
                      className="text-sm w-full"
                      value={edgeSettings[edge.id]?.customPrice ?? edge.data?.customPrice ?? ''}
                      onChange={(e) => handleCustomPriceChange(edge.id, e.target.value)}
                      placeholder={edgeSettings[edge.id]?.sourceType === CcuSourceType.OFFICIAL_WB ||
                        edgeSettings[edge.id]?.sourceType === CcuSourceType.HANGER ? 'USD' : 'CNY'}
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