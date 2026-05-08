import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

type MarketImageBadgeKind = 'oc' | 'lti';

interface MarketImageBadgeProps {
  kind: MarketImageBadgeKind;
  raised?: boolean;
  size?: 'compact' | 'detail';
}

type Palette = {
  fill: string;
  glow: string;
  brandText: string;
  labelText: string;
};

function getPalette(kind: MarketImageBadgeKind): Palette {
  if (kind === 'oc') {
    return {
      fill: 'rgba(250, 204, 21, 0.92)',
      glow: 'rgba(253, 224, 71, 0.35)',
      brandText: '#422006',
      labelText: '#422006',
    };
  }

  return {
    fill: 'rgba(56, 189, 248, 0.92)',
    glow: 'rgba(125, 211, 252, 0.30)',
    brandText: '#082f49',
    labelText: '#082f49',
  };
}

export default function MarketImageBadge({
  kind,
  raised = false,
  size = 'compact',
}: MarketImageBadgeProps) {
  const intl = useIntl();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const label = kind === 'oc'
    ? intl.formatMessage({ id: 'market.detail.ocShipBadge', defaultMessage: 'Original Concept' })
    : intl.formatMessage({ id: 'market.detail.ltiShipBadge', defaultMessage: 'LTI' });
  const cssHeight = size === 'detail' ? 84 : 68;
  const bottomClass = raised ? 'bottom-12' : 'bottom-0';

  useLayoutEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const updateSize = () => {
      const nextWidth = Math.max(Math.floor(element.clientWidth), 0);
      setCanvasWidth((currentWidth) => currentWidth === nextWidth ? currentWidth : nextWidth);
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasWidth <= 0) return;

    const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(Math.floor(canvasWidth), 1);
    const height = cssHeight;
    canvas.width = Math.floor(width * devicePixelRatio);
    canvas.height = Math.floor(height * devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette = getPalette(kind);
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.save();

    const bandBottom = height;
    const baseTop = Math.round(height * 0.78);
    const rampTop = Math.round(height * 0.10);
    const rightLabelPadding = size === 'detail' ? 38 : 30;
    const rightLabelFontSizeBase = size === 'detail' ? 30 : 24;
    const brandFontSize = size === 'detail' ? 16 : 13;
    // const brandLeftPadding = size === 'detail' ? 18 : 14;
    let rightLabelFontSize = rightLabelFontSizeBase;

    ctx.font = `900 ${rightLabelFontSize}px Arial, sans-serif`;
    let labelWidth = ctx.measureText(label).width;
    const maxLabelWidth = Math.max(width * 0.40, 140);
    if (labelWidth > maxLabelWidth) {
      rightLabelFontSize = Math.max(Math.floor((rightLabelFontSizeBase * maxLabelWidth) / labelWidth), size === 'detail' ? 18 : 15);
      ctx.font = `900 ${rightLabelFontSize}px Arial, sans-serif`;
      labelWidth = ctx.measureText(label).width;
    }

    const labelRightX = width - rightLabelPadding;
    const labelLeftX = labelRightX - labelWidth;
    const labelRampGap = size === 'detail' ? 22 : 16;
    const labelBlockWidth = Math.max(Math.ceil(labelWidth + rightLabelPadding * 2.4), Math.round(width * 0.28));
    const rampRun = Math.round(width * 0.12);
    const labelCenterY = rampTop + (bandBottom - rampTop) / 2 + 2;
    const rampProgressAtLabelCenter = (labelCenterY - baseTop) / (rampTop - baseTop);
    const rampPeakMaxForLabelGap = Math.round(labelLeftX - labelRampGap + (1 - rampProgressAtLabelCenter) * rampRun);
    const rampPeakX = Math.max(
      Math.min(width - labelBlockWidth, rampPeakMaxForLabelGap),
      Math.round(width * 0.50),
    );
    const rampStart = Math.max(rampPeakX - rampRun, Math.round(width * 0.36));
    // const baseHeight = bandBottom - baseTop;
    const highlightInset = 0;
    const highlightThickness = size === 'detail' ? 28 : 18;

    ctx.fillStyle = palette.fill;
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.moveTo(0, bandBottom);
    ctx.lineTo(0, baseTop);
    ctx.lineTo(rampStart, baseTop);
    ctx.lineTo(rampPeakX, rampTop);
    ctx.lineTo(width, rampTop);
    ctx.lineTo(width, bandBottom);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    const rampDx = rampPeakX - rampStart;
    const rampDy = rampTop - baseTop;
    const rampLength = Math.hypot(rampDx, rampDy);
    if (rampLength > 0) {
      const tangentX = rampDx / rampLength;
      const tangentY = rampDy / rampLength;
      const normalX = -tangentY;
      const normalY = tangentX;
      const capLength = Math.round(highlightThickness * 0.75);
      const startX = rampStart + normalX * highlightInset;
      const startY = baseTop + normalY * highlightInset;
      const endX = rampPeakX + normalX * highlightInset;
      const endY = rampTop + normalY * highlightInset;
      const lowerCapX = Math.max(0, startX - capLength);
      const upperCapX = Math.min(width, endX + capLength);
      const outerStartX = startX + normalX * highlightThickness;
      const outerStartY = startY + normalY * highlightThickness;
      const outerEndX = endX + normalX * highlightThickness;
      const outerEndY = endY + normalY * highlightThickness;

      const highlightGradient = ctx.createLinearGradient(startX, startY, endX, endY);
      highlightGradient.addColorStop(0, 'rgba(255,255,255,0.06)');
      highlightGradient.addColorStop(0.28, 'rgba(255,255,255,0.22)');
      highlightGradient.addColorStop(0.72, 'rgba(255,255,255,0.30)');
      highlightGradient.addColorStop(1, 'rgba(255,255,255,0.08)');
      ctx.fillStyle = highlightGradient;
      ctx.beginPath();
      ctx.moveTo(lowerCapX, startY);
      ctx.lineTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.lineTo(upperCapX, endY);
      ctx.lineTo(outerEndX, outerEndY);
      ctx.lineTo(outerStartX, outerStartY);
      ctx.closePath();
      ctx.fill();
    }

    ctx.font = `700 ${brandFontSize}px Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = palette.brandText;
    // ctx.fillText('CitizensHub', brandLeftPadding, baseTop + baseHeight / 2 + 1);

    ctx.font = `800 ${rightLabelFontSize}px Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = palette.labelText;
    ctx.fillText(label, labelRightX, labelCenterY);

    ctx.restore();
  }, [canvasWidth, cssHeight, kind, label, size]);

  return (
    <div
      ref={wrapperRef}
      className={`pointer-events-none absolute left-0 right-0 ${bottomClass} z-[1] overflow-hidden`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: `${cssHeight}px`, display: 'block' }} />
    </div>
  );
}
