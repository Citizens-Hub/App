import { EdgeProps, EdgeLabelRenderer, getBezierPath } from 'reactflow';
import { CcuSourceType, CcuEdgeData } from '../../../types';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';
import { useMemo } from 'react';
import { CcuSourceTypeStrategyFactory } from '../services/CcuSourceTypeFactory';

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
          {sourceType && <span className="text-xs mr-1">{sourceTypeDisplay}</span>}
          +{(() => {
            switch (true) {
              case currency === 'USD' && sourceType === CcuSourceType.OFFICIAL:
                return (priceToShow / 100).toLocaleString(locale, { style: 'currency', currency });
              // case currency === 'USD':
              //   return priceToShow.toLocaleString(locale, { style: 'currency', currency });
              default:
                return priceToShow.toLocaleString(locale, { style: 'currency', currency });
            }
          })()}
        </div>
      </EdgeLabelRenderer>
    </>
  );
} 