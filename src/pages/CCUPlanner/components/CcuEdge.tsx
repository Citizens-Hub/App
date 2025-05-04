import { EdgeProps, getSmoothStepPath, EdgeLabelRenderer } from 'reactflow';
import { CcuSourceType, CcuEdgeData } from '../../../types';

interface CcuEdgeProps extends EdgeProps {
  data?: CcuEdgeData;
}

export default function CcuEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
  markerEnd,
}: CcuEdgeProps) {
  if (!data) return null;

  // console.log("CcuEdge数据已更新:", data.sourceType);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  // 设置默认的sourceType为OFFICIAL
  const sourceType = data.sourceType || CcuSourceType.OFFICIAL;

  // 根据不同的来源类型确定价格
  let priceToShow = data.price || 0;
  let currency = 'USD';
  
  if (sourceType === CcuSourceType.OFFICIAL_WB && data.customPrice !== undefined) {
    priceToShow = data.customPrice;
  } else if (sourceType === CcuSourceType.THIRD_PARTY && data.customPrice !== undefined) {
    priceToShow = data.customPrice;
    currency = 'CNY';
  }

  // 为不同来源类型设置不同的边框颜色
  let edgeColor = 'stroke-blue-500';
  let bgColor = 'bg-blue-700';
  
  if (sourceType === CcuSourceType.OFFICIAL_WB) {
    edgeColor = 'stroke-green-500';
    bgColor = 'bg-green-700';
  } else if (sourceType === CcuSourceType.THIRD_PARTY) {
    edgeColor = 'stroke-purple-500';
    bgColor = 'bg-purple-700';
  }

  return (
    <>
      <path
        id={id}
        style={{ ...style, strokeWidth: 2 }}
        className={`react-flow__edge-path ${edgeColor}`}
        d={edgePath}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={`${bgColor} text-white px-2 py-1 rounded-md shadow-md text-sm`}
        >
          {sourceType && <span className="text-xs mr-1">{sourceType}</span>}
          +{currency === 'USD' 
            ? sourceType === CcuSourceType.OFFICIAL
              ? (priceToShow / 100).toLocaleString('en-US', { style: 'currency', currency })
              : priceToShow.toLocaleString('en-US', { style: 'currency', currency })
            : priceToShow.toLocaleString('zh-CN', { style: 'currency', currency })}
        </div>
      </EdgeLabelRenderer>
    </>
  );
} 