import { getBezierPath, EdgeLabelRenderer, EdgeProps, Edge } from 'reactflow';
import { CcuEdgeData, CcuSourceType } from '../../../types';
import { useIntl } from 'react-intl';
import { useMemo } from 'react';
import { CcuSourceTypeStrategyFactory } from '../services/CcuSourceTypeFactory';
import pathFinderService from '../services/PathFinderService';
import { Check } from 'lucide-react';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';

interface CcuEdgeProps extends EdgeProps {
  data?: CcuEdgeData;
  selectedPath?: {
    edges: Array<{
      edge: Edge<CcuEdgeData>;
    }>;
  };
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
  selectedPath
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

  // 检查边是否在当前选中的路径中
  const isInSelectedPath = useMemo(() => {
    if (!selectedPath || !data?.sourceShip || !data?.targetShip) return false;
    
    return selectedPath.edges.some(pathEdge => 
      pathEdge.edge.id === id
    );
  }, [selectedPath, id, data]);
  
  // 创建边的样式
  const edgeStyle = useMemo(() => {
    const baseStyle = { ...style };
    
    if (isCompleted) {
      return {
        ...baseStyle,
        stroke: '#4caf50',
        strokeDasharray: '5,5',
        strokeWidth: 3
      };
    } else if (isInSelectedPath) {
      return {
        ...baseStyle,
        stroke: '#2196f3',
        strokeWidth: 3
      };
    } else {
      return {
        ...baseStyle,
        strokeWidth: 2
      };
    }
  }, [style, isCompleted, isInSelectedPath]);
  
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

  const labelBgColor = isCompleted ? 'bg-green-600' : bgColor;

  const { price, currency } = strategy.calculatePrice(data.sourceShip!, data.targetShip!, {
    ccus: data.ccus,
    wbHistory: data.wbHistory,
    hangarItems: data.hangarItems,
    currency: selectedCurrency,
    customPrice: data.customPrice,
  });

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
          +{price.toLocaleString(locale, { style: 'currency', currency })}
        </div>
      </EdgeLabelRenderer>
    </>
  );
} 