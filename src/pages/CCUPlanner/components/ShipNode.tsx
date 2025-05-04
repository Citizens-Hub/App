import { useState, useEffect, useRef } from 'react';
import { Handle, Position, Edge } from 'reactflow';
import { Ship, CcuSourceType, CcuEdgeData } from '../../../types';
import { Button } from '@mui/material';

interface ShipNodeProps {
  data: {
    ship: Ship;
    onUpdateEdge?: (sourceId: string, targetId: string, data: Partial<CcuEdgeData>) => void;
    onDeleteNode?: (nodeId: string) => void;
    incomingEdges?: Edge<CcuEdgeData>[];
    id: string;
  };
  id: string;
  selected?: boolean;
}

export default function ShipNode({ data, id, selected }: ShipNodeProps) {
  const { ship, onUpdateEdge, onDeleteNode, incomingEdges = [] } = data;
  const [isEditing, setIsEditing] = useState(false);

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
    <div className={`bg-gray-800 rounded-lg p-4 w-64 shadow-lg ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ width: 15, height: 15, left: -8 }} />

      <span className="text-sm text-gray-300 absolute left-4 top-[160px] -translate-y-1/2">升级自</span>

      <div className="flex flex-col items-center">
        <img
          src={ship.medias.productThumbMediumAndSmall}
          alt={ship.name}
          className="w-full h-30 object-cover rounded-t-md mb-12"
        />

        <h3 className="text-xl font-bold text-white mb-1">{ship.name}</h3>

        <div className="text-sm text-gray-300 mb-2">
          <span className="font-medium">{ship.manufacturer.name}</span> ·
          <span className="ml-1">{ship.type}</span>
        </div>

        <div className="text-blue-200 font-bold py-1 px-3 rounded text-lg">
          {(ship.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </div>


        <div className="flex flex-row gap-4 mt-4">
          {incomingEdges.length > 0 && !isEditing && (
            <Button
              variant="outlined"
              onClick={handleEditToggle}
            >
              编辑升级路线
            </Button>
          )}
          <Button
            variant="outlined"
            color="error"
            onClick={handleDeleteNode}
          >
            删除
          </Button>
        </div>
      </div>

      {/* 编辑界面 */}
      {isEditing && incomingEdges.length > 0 && (
        <div className="mt-4 border-t border-gray-700 pt-4">
          <h4 className="text-white font-bold mb-2">升级路线设置</h4>

          {incomingEdges.map(edge => (
            <div key={edge.id} className="mb-3 p-2 bg-gray-700 rounded">
              <div className="text-sm text-gray-300 mb-1">
                从 <span className="text-white">{edge.data?.sourceShip?.name || '未知船只'}</span>
              </div>

              <div className="mb-2">
                <label className="text-sm text-gray-300 block mb-1">选择来源:</label>
                <select
                  className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 w-full text-sm"
                  value={edgeSettings[edge.id]?.sourceType || (edge.data?.sourceType || CcuSourceType.OFFICIAL)}
                  onChange={(e) => {
                    handleSourceTypeChange(edge.id, e.target.value as CcuSourceType);
                  }}
                >
                  <option value={CcuSourceType.OFFICIAL}>{CcuSourceType.OFFICIAL}</option>
                  <option value={CcuSourceType.OFFICIAL_WB}>{CcuSourceType.OFFICIAL_WB}</option>
                  <option value={CcuSourceType.THIRD_PARTY}>{CcuSourceType.THIRD_PARTY}</option>
                </select>
              </div>

              {/* 当选择官方WB或第三方时，显示价格输入 */}
              {(edgeSettings[edge.id]?.sourceType === CcuSourceType.OFFICIAL_WB ||
                edgeSettings[edge.id]?.sourceType === CcuSourceType.THIRD_PARTY) && (
                  <div className="mb-2">
                    <label className="text-sm text-gray-300 block mb-1">
                      {edgeSettings[edge.id]?.sourceType === CcuSourceType.OFFICIAL_WB ? '价格 (USD)' : '价格 (CNY)'}:
                    </label>
                    <input
                      type="number"
                      className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 w-full text-sm"
                      value={edgeSettings[edge.id]?.customPrice ?? edge.data?.customPrice ?? ''}
                      onChange={(e) => handleCustomPriceChange(edge.id, e.target.value)}
                      placeholder={edgeSettings[edge.id]?.sourceType === CcuSourceType.OFFICIAL_WB ? '美元' : '人民币'}
                    />
                  </div>
                )}
            </div>
          ))}
          <button
            onClick={handleEditToggle}
            className="mt-2 text-sm text-blue-400 hover:text-blue-300"
          >
            完成编辑
          </button>
        </div>
      )}

      <span className="text-sm text-gray-300 absolute right-4 top-[160px] -translate-y-1/2">升级到</span>

      <Handle type="source" position={Position.Right} style={{ width: 15, height: 15, right: -8 }} />
    </div>
  );
} 