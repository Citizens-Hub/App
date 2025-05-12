import { EdgeProps, EdgeLabelRenderer, getBezierPath } from 'reactflow';
import { CcuSourceType, CcuEdgeData } from '../../../types';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';

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
  
  if (!data) return null;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const sourceType = data.sourceType || CcuSourceType.OFFICIAL;

  let priceToShow = data.price || 0;
  let currency = 'USD';
  
  if ((sourceType === CcuSourceType.OFFICIAL_WB || sourceType === CcuSourceType.AVAILABLE_WB) && data.customPrice !== undefined) {
    priceToShow = data.customPrice;
  } else if (sourceType === CcuSourceType.THIRD_PARTY && data.customPrice !== undefined) {
    priceToShow = data.customPrice;
    currency = selectedCurrency;
  } else if (sourceType === CcuSourceType.HANGER && data.customPrice !== undefined) {
    priceToShow = data.customPrice;
    currency = 'USD';
  } else if (sourceType === CcuSourceType.HISTORICAL && data.customPrice !== undefined) {
    priceToShow = data.customPrice;
    currency = 'USD';
  }

  let edgeColor = 'stroke-blue-500';
  let bgColor = 'bg-blue-700';
  
  if (sourceType === CcuSourceType.OFFICIAL_WB) {
    edgeColor = 'stroke-red-500';
    bgColor = 'bg-red-600';
  } else if (sourceType === CcuSourceType.THIRD_PARTY) {
    edgeColor = 'stroke-purple-500';
    bgColor = 'bg-purple-700';
  } else if (sourceType === CcuSourceType.AVAILABLE_WB) {
    edgeColor = 'stroke-orange-400';
    bgColor = 'bg-orange-400';
  } else if (sourceType === CcuSourceType.HANGER) {
    edgeColor = 'stroke-cyan-300';
    bgColor = 'bg-cyan-500';
  } else if (sourceType === CcuSourceType.HISTORICAL) {
    edgeColor = 'stroke-gray-500';
    bgColor = 'bg-gray-500';
  }

  const getSourceTypeDisplay = (type: CcuSourceType) => {
    switch (type) {
      case CcuSourceType.OFFICIAL:
        return intl.formatMessage({ id: "shipNode.official", defaultMessage: "Official" });
      case CcuSourceType.OFFICIAL_WB:
        return intl.formatMessage({ id: "shipNode.manualOfficialWB", defaultMessage: "Manual: Official WB CCU" });
      case CcuSourceType.THIRD_PARTY:
        return intl.formatMessage({ id: "shipNode.manualThirdParty", defaultMessage: "Manual: Third Party CCU" });
      case CcuSourceType.AVAILABLE_WB:
        return intl.formatMessage({ id: "shipNode.availableWB", defaultMessage: "WB" });
      case CcuSourceType.HANGER:
        return intl.formatMessage({ id: "shipNode.hangar", defaultMessage: "Hangar" });
      case CcuSourceType.HISTORICAL:
        return intl.formatMessage({ id: "shipNode.historical", defaultMessage: "Historical" });
      default:
        return type;
    }
  };

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
          {sourceType && <span className="text-xs mr-1">{getSourceTypeDisplay(sourceType)}</span>}
          +{(() => {
            switch (true) {
              case currency === 'USD' && sourceType === CcuSourceType.OFFICIAL:
                return (priceToShow / 100).toLocaleString(locale, { style: 'currency', currency });
              case currency === 'USD':
                return priceToShow.toLocaleString(locale, { style: 'currency', currency });
              default:
                return priceToShow.toLocaleString(locale, { style: 'currency', currency });
            }
          })()}
        </div>
      </EdgeLabelRenderer>
    </>
  );
} 