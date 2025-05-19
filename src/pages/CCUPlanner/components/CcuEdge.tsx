import { getBezierPath, EdgeLabelRenderer, EdgeProps, Edge } from 'reactflow';
import { CcuEdgeData, CcuSourceType } from '../../../types';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';
import { useMemo } from 'react';
import { CcuSourceTypeStrategyFactory } from '../services/CcuSourceTypeFactory';
import pathFinderService from '../services/PathFinderService';
import { Check } from 'lucide-react';

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
  const intl = useIntl();
  const { locale } = intl;
  const { currency: selectedCurrency } = useSelector((state: RootState) => state.upgrades);
  const factory = useMemo(() => CcuSourceTypeStrategyFactory.getInstance(), []);
  
  // 检查边是否属于任何已完成路径
  const isCompleted = useMemo(() => {
    if (!data?.sourceShip || !data?.targetShip) return false;
    
    // 构建一个完整的Edge<CcuEdgeData>对象
    const edge: Edge<CcuEdgeData> = {
      id,
      source: '',  // 这些字段在检查中不使用
      target: '',
      data
    };
    
    return pathFinderService.isSingleEdgeInAnyCompletedPath(edge);
  }, [data, id]);
  
  // 创建边的样式
  const edgeStyle = useMemo(() => {
    const baseStyle = { ...style };
    
    if (isCompleted) {
      return {
        ...baseStyle,
        stroke: '#4caf50', // 绿色 
        strokeDasharray: '5,5', // 虚线样式
        strokeWidth: 3 // 加粗
      };
    } else {
      return {
        ...baseStyle,
        strokeWidth: 2
      };
    }
  }, [style, isCompleted]);
  
  if (!data) return null;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  
  // Get source type, default to OFFICIAL
  const sourceType = data.sourceType || CcuSourceType.OFFICIAL;
  
  // Get corresponding strategy
  const strategy = factory.getStrategy(sourceType);
  
  // Get display name
  const sourceTypeDisplay = strategy.getDisplayName(intl);
  
  // Get edge style
  const { edgeColor, bgColor } = strategy.getEdgeStyle();

  // 标签背景色，已完成的边使用绿色背景
  const labelBgColor = isCompleted ? 'bg-green-600' : bgColor;

  // Calculate price to display
  let priceToShow = data.price || 0;
  let currency = 'USD';
  
  if (data.customPrice !== undefined && data.sourceType !== CcuSourceType.OFFICIAL) {
    priceToShow = data.customPrice;
    
    // For THIRD_PARTY type, use user selected currency
    if (sourceType === CcuSourceType.THIRD_PARTY) {
      currency = selectedCurrency;
    }
  }

  return (
    <>
      <path
        id={id}
        style={edgeStyle}
        className={`react-flow__edge-path ${!isCompleted ? edgeColor : ''}`}
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
          className={`${labelBgColor} text-white px-2 py-1 rounded-md shadow-md text-sm flex items-center gap-1`}
        >
          {isCompleted && <span className="mr-1"><Check className="w-4 h-4" /></span>}
          {sourceType && <span className="mr-1">{sourceTypeDisplay}</span>}
          +{(() => {
            switch (true) {
              case currency === 'USD' && sourceType === CcuSourceType.OFFICIAL:
                return (priceToShow / 100).toLocaleString(locale, { style: 'currency', currency });
              default:
                return priceToShow.toLocaleString(locale, { style: 'currency', currency });
            }
          })()}
        </div>
      </EdgeLabelRenderer>
    </>
  );
} 