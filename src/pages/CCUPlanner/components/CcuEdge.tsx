import { getBezierPath, EdgeLabelRenderer, EdgeProps, Edge } from 'reactflow';
import { CcuEdgeData, CcuSourceType } from '@/types';
import { useIntl } from 'react-intl';
import { useMemo } from 'react';
import { CcuSourceTypeStrategyFactory } from '../services/CcuSourceTypeFactory';
import pathFinderService from '../services/PathFinderService';
import { Check } from 'lucide-react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

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

  // Check if the edge belongs to any completed path
  const isCompleted = useMemo(() => {
    if (!data?.sourceShip || !data?.targetShip) return false;

    // Build a complete Edge<CcuEdgeData> object
    const edge: Edge<CcuEdgeData> = {
      id,
      source: '',  // These fields are not used in the check
      target: '',
      data
    };

    return pathFinderService.isSingleEdgeInAnyCompletedPath(edge);
  }, [data, id]);

  // Check if the edge is in the currently selected path
  const isInSelectedPath = useMemo(() => {
    if (!selectedPath || !data?.sourceShip || !data?.targetShip) return false;

    return selectedPath.edges.some(pathEdge =>
      pathEdge.edge.id === id
    );
  }, [selectedPath, id, data]);

  // Create edge style
  const edgeStyle = useMemo(() => {
    const baseStyle = { ...style };

    const getEdgeStyle = () => {
      const commonStyle = {
        ...baseStyle,
        strokeWidth: 3
      };

      if (isCompleted) {
        return {
          ...commonStyle,
          stroke: isInSelectedPath ? '#50FA7E' : '#4caf50',
          strokeDasharray: '5,5'
        };
      }

      if (isInSelectedPath) {
        return {
          ...commonStyle,
          stroke: '#2196f3'
        };
      }

      return {
        ...baseStyle,
        strokeWidth: 2
      };
    };

    return getEdgeStyle();
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
    importItems: data.importItems,
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
        {
          (price === 0 && data.sourceType !== CcuSourceType.HANGER) ? <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="bg-red-500 text-white px-2 py-1 rounded-md shadow-md text-sm flex items-center gap-1"
          >
            !{isCompleted && <span className="mr-1"><Check className="w-4 h-4" /></span>}
            {sourceType && <span className="mr-1">{sourceTypeDisplay}</span>}
            +{price.toLocaleString(locale, { style: 'currency', currency })}
          </div> : <div
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
        }
      </EdgeLabelRenderer>
    </>
  );
} 