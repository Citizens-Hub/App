import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Box, FormControlLabel, Switch, Typography } from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
  TooltipItem,
  TooltipModel,
  Plugin
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import { PriceHistoryEntity } from '@/types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

interface PriceHistoryChartProps {
  history: PriceHistoryEntity['history'] | null;
  currentMsrp: number;
  shipName: string;
  overlaySeries?: PriceHistoryOverlaySeries[];
  rangeStartTs?: number;
  rangeEndTs?: number;
  highlightedSkuId?: number | null;
  showRealTimeScaleToggle?: boolean;
  showTitle?: boolean;
  legendPosition?: 'top' | 'left';
  legendAlign?: 'start' | 'center' | 'end';
  showSkuMetaInTooltip?: boolean;
  tooltipZIndex?: number;
  className?: string;
  panelClassName?: string;
}

interface PriceHistoryOverlaySeries {
  label: string;
  periods: Array<{
    startTs: number;
    endTs: number | null;
    price: number;
  }>;
  color?: string;
  borderDash?: number[];
}

const EMPTY_OVERLAY_SERIES: PriceHistoryOverlaySeries[] = [];

export default function PriceHistoryChart({
  history,
  currentMsrp,
  shipName,
  overlaySeries,
  rangeStartTs,
  rangeEndTs,
  highlightedSkuId = null,
  showRealTimeScaleToggle = true,
  showTitle = true,
  legendAlign = 'center',
  legendPosition = 'top',
  showSkuMetaInTooltip = false,
  tooltipZIndex = 100000,
  className,
  panelClassName
}: PriceHistoryChartProps) {
  // Keep currentMsrp for potential future use (e.g., showing current price when no history)
  void currentMsrp;

  const intl = useIntl();
  const tooltipIdRef = useRef(`chartjs-tooltip-${Math.random().toString(36).slice(2, 10)}`);
  const rangeOverlayPluginIdRef = useRef(`selected-range-overlay-${Math.random().toString(36).slice(2, 10)}`);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains('dark')
  );
  const [useRealTimeScale, setUseRealTimeScale] = useState(false);
  const normalizedOverlaySeries = overlaySeries ?? EMPTY_OVERLAY_SERIES;

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const tooltipId = tooltipIdRef.current;
    return () => {
      const tooltipEl = document.getElementById(tooltipId);
      if (tooltipEl) {
        tooltipEl.remove();
      }
    };
  }, []);

  const getEditionName = useCallback((edition: string, skuId: number) => {
    if (
      edition.toLowerCase().trim() === (shipName.toLowerCase().trim() + ' upgrade') ||
      edition.toLowerCase().includes('standard') ||
      edition.toLowerCase().trim() === (shipName.toLowerCase().trim() + ' - upgrade') ||
      edition.trim() === "Unknown"
    ) {
      return `Standard (Sku:${skuId})`;
    }

    return `Warbond (Sku:${skuId})`;
  }, [shipName]);

  const extractSkuIdFromEdition = useCallback((editionLabel: string): number | null => {
    const match = editionLabel.match(/Sku:\s*(\d+)/i);
    if (!match?.[1]) {
      return null;
    }

    const parsedSku = Number(match[1]);
    return Number.isFinite(parsedSku) ? parsedSku : null;
  }, []);

  const withAlpha = useCallback((rgbColor: string, alpha: number): string => {
    const matchedRgb = rgbColor.match(/rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
    if (!matchedRgb) {
      return rgbColor;
    }

    return `rgba(${matchedRgb[1]}, ${matchedRgb[2]}, ${matchedRgb[3]}, ${alpha})`;
  }, []);

  // Generate distinct colors for editions
  const getEditionColor = useCallback((_edition: string, index: number): string => {
    const standardColors = [
      'rgb(37, 99, 235)',     // blue-600 (deeper blue)
      // 'rgb(96, 165, 250)',    // blue-400 (lighter blue)
    ];

    const warbondColors = [
      'rgb(34, 197, 94)',     // green-500 (bright green)
      'rgb(249, 115, 22)',    // orange-500 (vibrant orange)
      'rgb(168, 85, 247)',    // purple-500 (vibrant purple)
      'rgb(239, 68, 68)',     // red-500 (bright red)
      'rgb(234, 179, 8)',     // yellow-500 (golden yellow)
      'rgb(236, 72, 153)',    // pink-500 (bright pink)
    ];

    if (_edition.includes('Standard')) {
      return standardColors[index % standardColors.length];
    }

    return warbondColors[index % warbondColors.length];
  }, []);

  // Filter and sort history entries that have price data
  // Interface for edition period
  interface EditionPeriod {
    startTs: number;
    endTs: number | null; // null means still active
    price: number;
  }

  // Store period data for tooltip access
  const [periodData, setPeriodData] = useState<{
    editionPeriods: Map<string, EditionPeriod[]>;
    sortedTimestamps: number[];
  } | null>(null);

  const rangeStartTsRef = useRef<number | undefined>(rangeStartTs);
  const rangeEndTsRef = useRef<number | undefined>(rangeEndTs);
  const useRealTimeScaleRef = useRef(useRealTimeScale);
  const periodDataRef = useRef(periodData);
  const isDarkModeRef = useRef(isDarkMode);

  useEffect(() => {
    rangeStartTsRef.current = rangeStartTs;
  }, [rangeStartTs]);

  useEffect(() => {
    rangeEndTsRef.current = rangeEndTs;
  }, [rangeEndTs]);

  useEffect(() => {
    useRealTimeScaleRef.current = useRealTimeScale;
  }, [useRealTimeScale]);

  useEffect(() => {
    periodDataRef.current = periodData;
  }, [periodData]);

  useEffect(() => {
    isDarkModeRef.current = isDarkMode;
  }, [isDarkMode]);

  const selectedRangeOverlayPlugin = useMemo<Plugin<'line'>>(() => ({
    id: rangeOverlayPluginIdRef.current,
    beforeDatasetsDraw: (chart) => {
      const activeRangeStartTs = rangeStartTsRef.current;
      const activeRangeEndTs = rangeEndTsRef.current;
      const activeUseRealTimeScale = useRealTimeScaleRef.current;
      const activePeriodData = periodDataRef.current;
      const activeIsDarkMode = isDarkModeRef.current;

      if (typeof activeRangeStartTs !== 'number' || typeof activeRangeEndTs !== 'number') {
        return;
      }
      if (activeRangeEndTs <= activeRangeStartTs) {
        return;
      }

      const xScale = chart.scales.x;
      if (!xScale || !chart.chartArea) {
        return;
      }

      let startPixel: number | null = null;
      let endPixel: number | null = null;

      if (activeUseRealTimeScale) {
        startPixel = xScale.getPixelForValue(activeRangeStartTs);
        endPixel = xScale.getPixelForValue(activeRangeEndTs);
      } else {
        const sortedTimestamps = activePeriodData?.sortedTimestamps || [];
        if (!sortedTimestamps.length) {
          return;
        }

        const startIndex = sortedTimestamps.findIndex(ts => ts >= activeRangeStartTs);
        const endIndexFromLeft = sortedTimestamps.findIndex(ts => ts > activeRangeEndTs);
        const resolvedStartIndex = startIndex === -1 ? sortedTimestamps.length - 1 : startIndex;
        const resolvedEndIndex = endIndexFromLeft === -1 ? sortedTimestamps.length - 1 : Math.max(0, endIndexFromLeft - 1);

        startPixel = xScale.getPixelForValue(resolvedStartIndex);
        endPixel = xScale.getPixelForValue(resolvedEndIndex);
      }

      if (!Number.isFinite(startPixel) || !Number.isFinite(endPixel)) {
        return;
      }

      const left = Math.max(chart.chartArea.left, Math.min(startPixel, endPixel));
      const right = Math.min(chart.chartArea.right, Math.max(startPixel, endPixel));
      if (right <= left) {
        return;
      }

      const ctx = chart.ctx;
      ctx.save();

      const fillColor = activeIsDarkMode ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.10)';
      ctx.fillStyle = fillColor;
      ctx.fillRect(left, chart.chartArea.top, right - left, chart.chartArea.bottom - chart.chartArea.top);

      const strokeColor = activeIsDarkMode ? 'rgba(96, 165, 250, 0.75)' : 'rgba(37, 99, 235, 0.7)';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      ctx.moveTo(left, chart.chartArea.top);
      ctx.lineTo(left, chart.chartArea.bottom);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(right, chart.chartArea.top);
      ctx.lineTo(right, chart.chartArea.bottom);
      ctx.stroke();

      ctx.restore();
    }
  }), []);

  const chartData = useMemo(() => {
    if (!history) return null;

    const now = Date.now();
    const sortedHistory = [...history].sort((a, b) => a.ts - b.ts);

    // Build periods for each edition: [startTs, endTs) - closed start, open end
    const editionPeriods = new Map<string, EditionPeriod[]>();
    const activeEditions = new Map<string, { startTs: number; price: number }>();

    // Process entries to build periods
    for (const entry of sortedHistory) {
      const edition = getEditionName(entry.edition || 'Unknown', entry.sku || 0);

      if (entry.change === '+') {
        const price = (entry.msrp ?? entry.baseMsrp ?? 0) / 100;
        // If this edition was already active, close the previous period first
        if (activeEditions.has(edition)) {
          const previous = activeEditions.get(edition)!;
          if (!editionPeriods.has(edition)) {
            editionPeriods.set(edition, []);
          }
          // End previous period just before new start (open interval)
          editionPeriods.get(edition)!.push({
            startTs: previous.startTs,
            endTs: entry.ts, // This will be excluded (open end)
            price: previous.price
          });
        }
        // Start new period
        activeEditions.set(edition, { startTs: entry.ts, price });
      } else if (entry.change === '-') {
        // Edition removed - close the period
        if (activeEditions.has(edition)) {
          const active = activeEditions.get(edition)!;
          if (!editionPeriods.has(edition)) {
            editionPeriods.set(edition, []);
          }
          // [start, end) - include start, exclude end
          editionPeriods.get(edition)!.push({
            startTs: active.startTs,
            endTs: entry.ts, // Removal timestamp (excluded from interval)
            price: active.price
          });
          activeEditions.delete(edition);
        }
      }
    }

    // Close remaining active editions (they continue to now)
    for (const [edition, active] of activeEditions.entries()) {
      if (!editionPeriods.has(edition)) {
        editionPeriods.set(edition, []);
      }
      editionPeriods.get(edition)!.push({
        startTs: active.startTs,
        endTs: null, // Still active
        price: active.price
      });
    }

    // Collect all unique timestamps needed for the chart
    // For [start, end) intervals, we need:
    // - start (included)
    // - end - 1ms (last valid point before end, if end > start + 1ms)
    // - end (excluded, will be null)
    const allTimestamps = new Set<number>();
    for (const periods of editionPeriods.values()) {
      for (const period of periods) {
        allTimestamps.add(period.startTs);
        if (period.endTs !== null) {
          // Add end - 1ms as the last valid point (included in [start, end))
          // Only add if it's different from startTs and >= startTs
          const lastValidTs = period.endTs - 1;
          if (lastValidTs >= period.startTs && lastValidTs !== period.startTs) {
            allTimestamps.add(lastValidTs);
          }
          // Add end point itself (will be null, excluded from interval)
          allTimestamps.add(period.endTs);
        } else {
          // Still active, add now as the latest point
          allTimestamps.add(now);
        }
      }
    }

    for (const series of normalizedOverlaySeries) {
      for (const period of series.periods) {
        allTimestamps.add(period.startTs);
        if (period.endTs !== null) {
          const lastValidTs = period.endTs - 1;
          if (lastValidTs >= period.startTs && lastValidTs !== period.startTs) {
            allTimestamps.add(lastValidTs);
          }
          allTimestamps.add(period.endTs);
        } else {
          allTimestamps.add(now);
        }
      }
    }

    // Sort all timestamps
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    // Store period data for tooltip
    setPeriodData({ editionPeriods, sortedTimestamps });

    // Create labels from timestamps
    const labels = sortedTimestamps.map(ts =>
      new Date(ts).toLocaleDateString(intl.locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    );

    for (let i = labels.length - 1; i > 0; i--) {
      if (labels[i] === labels[i - 1]) {
        labels[i] = '';
      }
    }

    // Build datasets for each edition
    const editionArray = Array.from(editionPeriods.keys()).sort();

    const datasets: Array<{
      label: string;
      data: Array<number | null> | Array<{ x: number; y: number | null }>;
      borderColor: string;
      backgroundColor: string;
      borderWidth: number;
      borderDash?: number[];
      fill: boolean;
      tension: number;
      pointRadius: number | Array<number>;
      pointHoverRadius: number | Array<number>;
      spanGaps: boolean;
      order: number;
    }> = [];

    editionArray.forEach((edition, index) => {
      const periods = editionPeriods.get(edition)!;
      const editionSkuId = extractSkuIdFromEdition(edition);
      const hasHighlightedSku = typeof highlightedSkuId === 'number';
      const isHighlightedDataset = hasHighlightedSku && editionSkuId === highlightedSkuId;
      const isDimmedDataset = hasHighlightedSku && !isHighlightedDataset;
      const baseColor = getEditionColor(edition, index);
      const borderColor = isDimmedDataset ? withAlpha(baseColor, 0.2) : baseColor;
      const fillColor = isHighlightedDataset
        ? withAlpha(baseColor, 0.2)
        : (isDimmedDataset ? withAlpha(baseColor, 0.03) : withAlpha(baseColor, 0.1));

      if (useRealTimeScale) {
        // Time scale mode: use {x: timestamp, y: price} format
        const data: Array<{ x: number; y: number | null }> = [];

        for (const ts of sortedTimestamps) {
          let value: number | null = null;

          for (const period of periods) {
            if (period.endTs === null) {
              // Still active - include up to and including now (connect to today)
              if (ts >= period.startTs && ts <= now) {
                value = period.price;
                break;
              }
            } else {
              // Closed period - [start, end) interval (start included, end excluded)
              if (ts === period.endTs) {
                // This is the end point (excluded from interval)
                value = null;
                break;
              }
              // Check if timestamp is in [start, end) interval
              if (ts >= period.startTs && ts < period.endTs) {
                // This timestamp is within the interval (included)
                value = period.price;
                break;
              }
            }
          }

          data.push({ x: ts, y: value });
        }

        // Calculate pointRadius array: only show points at the start and end of each continuous segment
        const pointRadius: Array<number> = [];
        const pointHoverRadius: Array<number> = [];

        for (let i = 0; i < data.length; i++) {
          const currentValue = data[i].y;
          const prevValue = i > 0 ? data[i - 1].y : null;
          const nextValue = i < data.length - 1 ? data[i + 1].y : null;

          // Show point if:
          // 1. Current point has a value (not null)
          // 2. It's the start of a segment (prev is null, current is not null)
          // 3. It's the end of a segment (current is not null, next is null)
          // 4. It's a single point segment (prev is null, current is not null, next is null)
          if (currentValue !== null) {
            const isStartOfSegment = prevValue === null;
            const isEndOfSegment = nextValue === null;

            if (isStartOfSegment || isEndOfSegment) {
              pointRadius.push(4);
              pointHoverRadius.push(6);
            } else {
              pointRadius.push(0);
              pointHoverRadius.push(0);
            }
          } else {
            pointRadius.push(0);
            pointHoverRadius.push(0);
          }
        }

        datasets.push({
          label: edition,
          data,
          borderColor,
          backgroundColor: fillColor,
          borderWidth: isHighlightedDataset ? 3 : 2,
          fill: true,
          tension: 0,
          pointRadius: pointRadius,
          pointHoverRadius: pointHoverRadius,
          spanGaps: false, // Don't connect across null values
          order: isHighlightedDataset ? 0 : 1
        });
      } else {
        // Category scale mode: use array format
        const data: Array<number | null> = [];

        for (const ts of sortedTimestamps) {
          let value: number | null = null;

          for (const period of periods) {
            if (period.endTs === null) {
              // Still active - include up to and including now (connect to today)
              if (ts >= period.startTs && ts <= now) {
                value = period.price;
                break;
              }
            } else {
              // Closed period - [start, end) interval (start included, end excluded)
              if (ts === period.endTs) {
                // This is the end point (excluded from interval)
                value = null;
                break;
              }
              // Check if timestamp is in [start, end) interval
              if (ts >= period.startTs && ts < period.endTs) {
                // This timestamp is within the interval (included)
                value = period.price;
                break;
              }
            }
          }

          data.push(value);
        }

        // Calculate pointRadius array: only show points at the start and end of each continuous segment
        const pointRadius: Array<number> = [];
        const pointHoverRadius: Array<number> = [];

        for (let i = 0; i < data.length; i++) {
          const currentValue = data[i];
          const prevValue = i > 0 ? data[i - 1] : null;
          const nextValue = i < data.length - 1 ? data[i + 1] : null;

          // Show point if:
          // 1. Current point has a value (not null)
          // 2. It's the start of a segment (prev is null, current is not null)
          // 3. It's the end of a segment (current is not null, next is null)
          // 4. It's a single point segment (prev is null, current is not null, next is null)
          if (currentValue !== null) {
            const isStartOfSegment = prevValue === null;
            const isEndOfSegment = nextValue === null;

            if (isStartOfSegment || isEndOfSegment) {
              pointRadius.push(4);
              pointHoverRadius.push(6);
            } else {
              pointRadius.push(0);
              pointHoverRadius.push(0);
            }
          } else {
            pointRadius.push(0);
            pointHoverRadius.push(0);
          }
        }

        datasets.push({
          label: edition,
          data,
          borderColor,
          backgroundColor: fillColor,
          borderWidth: isHighlightedDataset ? 3 : 2,
          fill: true,
          tension: 0,
          pointRadius: pointRadius,
          pointHoverRadius: pointHoverRadius,
          spanGaps: false, // Don't connect across null values
          order: isHighlightedDataset ? 0 : 1
        });
      }
    });

    normalizedOverlaySeries.forEach((series) => {
      const overlayColor = series.color || 'rgb(17, 24, 39)';

      if (useRealTimeScale) {
        const data: Array<{ x: number; y: number | null }> = sortedTimestamps.map(ts => {
          let value: number | null = null;

          for (const period of series.periods) {
            if (period.endTs === null) {
              if (ts >= period.startTs && ts <= now) {
                value = period.price;
                break;
              }
            } else {
              if (ts === period.endTs) {
                value = null;
                break;
              }
              if (ts >= period.startTs && ts < period.endTs) {
                value = period.price;
                break;
              }
            }
          }

          return { x: ts, y: value };
        });

        datasets.push({
          label: series.label,
          data,
          borderColor: overlayColor,
          backgroundColor: withAlpha(overlayColor, 0),
          borderWidth: 2,
          borderDash: series.borderDash,
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          spanGaps: false,
          order: -1
        });
      } else {
        const data: Array<number | null> = sortedTimestamps.map(ts => {
          let value: number | null = null;

          for (const period of series.periods) {
            if (period.endTs === null) {
              if (ts >= period.startTs && ts <= now) {
                value = period.price;
                break;
              }
            } else {
              if (ts === period.endTs) {
                value = null;
                break;
              }
              if (ts >= period.startTs && ts < period.endTs) {
                value = period.price;
                break;
              }
            }
          }

          return value;
        });

        datasets.push({
          label: series.label,
          data,
          borderColor: overlayColor,
          backgroundColor: withAlpha(overlayColor, 0),
          borderWidth: 2,
          borderDash: series.borderDash,
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          spanGaps: false,
          order: -1
        });
      }
    });

    return {
      labels: useRealTimeScale ? undefined : labels,
      datasets
    };
  }, [extractSkuIdFromEdition, getEditionName, getEditionColor, highlightedSkuId, history, intl.locale, normalizedOverlaySeries, useRealTimeScale, withAlpha]);

  const yAxisBounds = useMemo(() => {
    if (!chartData?.datasets?.length) {
      return null;
    }

    const yValues: number[] = [];

    chartData.datasets.forEach(dataset => {
      dataset.data.forEach(point => {
        if (typeof point === 'number' && Number.isFinite(point)) {
          yValues.push(point);
          return;
        }

        if (
          point
          && typeof point === 'object'
          && 'y' in point
          && typeof point.y === 'number'
          && Number.isFinite(point.y)
        ) {
          yValues.push(point.y);
        }
      });
    });

    if (!yValues.length) {
      return null;
    }

    const minValue = Math.min(...yValues);
    const maxValue = Math.max(...yValues);
    const span = Math.max(maxValue - minValue, 1);
    const lowerPadding = Math.max(span * 0.08, 0.5);
    const upperPadding = Math.max(span * 0.10, 0.5);

    return {
      min: Math.max(0, minValue - lowerPadding),
      max: maxValue + upperPadding
    };
  }, [chartData]);

  // Helper function to find period info for a data point
  const findPeriodForDataPoint = useCallback((
    dataIndex: number,
    datasetLabel: string,
    editionPeriods: Map<string, EditionPeriod[]>,
    sortedTimestamps: number[]
  ): EditionPeriod | null => {
    if (!periodData || dataIndex < 0 || dataIndex >= sortedTimestamps.length) {
      return null;
    }

    const timestamp = sortedTimestamps[dataIndex];
    const periods = editionPeriods.get(datasetLabel);

    if (!periods) {
      return null;
    }

    // Find the period that contains this timestamp
    for (const period of periods) {
      if (period.endTs === null) {
        // Still active - check if timestamp is within range
        if (timestamp >= period.startTs && timestamp <= Date.now()) {
          return period;
        }
      } else {
        // Closed period - [start, end) interval
        if (timestamp >= period.startTs && timestamp < period.endTs) {
          return period;
        }
      }
    }

    return null;
  }, [periodData]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: legendPosition,
        align: legendAlign,
        labels: {
          color: isDarkMode ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
          usePointStyle: true,
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      title: {
        display: showTitle,
        text: intl.formatMessage({ id: 'priceHistory.chart.title', defaultMessage: 'Price Trend' }),
        color: isDarkMode ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
        font: {
          size: 16,
          weight: 'bold' as const
        },
        padding: {
          top: 10,
          bottom: 20
        }
      },
      tooltip: {
        enabled: false,
        external: (context: { chart: ChartJS; tooltip: TooltipModel<'line'> }) => {
          // Tooltip element
          let tooltipEl = document.getElementById(tooltipIdRef.current);

          // Create element on first render
          if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = tooltipIdRef.current;
            tooltipEl.className = 'price-history-chart-tooltip';
            tooltipEl.innerHTML = '<div class="price-history-chart-tooltip-content"></div>';
            document.body.appendChild(tooltipEl);
          }

          const tooltipModel = context.tooltip;

          // Hide if no tooltip
          if (tooltipModel.opacity === 0) {
            tooltipEl.style.opacity = '0';
            tooltipEl.style.pointerEvents = 'none';
            return;
          }

          // Get period data
          if (!periodData) {
            return;
          }

          const { editionPeriods, sortedTimestamps } = periodData;

          // Set caret position
          tooltipEl.classList.remove('above', 'below', 'no-transform');
          if (tooltipModel.yAlign) {
            tooltipEl.classList.add(tooltipModel.yAlign);
          } else {
            tooltipEl.classList.add('no-transform');
          }

          // Build tooltip content
          const contentDiv = tooltipEl.querySelector('.price-history-chart-tooltip-content') as HTMLElement;
          if (!contentDiv) return;

          let innerHtml = '';

          // Process each tooltip item
          if (tooltipModel.dataPoints && tooltipModel.dataPoints.length > 0) {
            const items = tooltipModel.dataPoints.filter((item: TooltipItem<'line'>) => item.parsed.y !== null);

            if (items.length > 0) {
              // Get timestamp from parsed data
              let dataIndex: number;
              let timestamp: number;

              if (useRealTimeScale) {
                // Time scale mode: get timestamp from parsed.x
                timestamp = items[0].parsed.x as number;
                // Find the index in sortedTimestamps
                dataIndex = sortedTimestamps.findIndex(ts => ts === timestamp);
                // If not found exactly, find the closest timestamp
                if (dataIndex === -1 && sortedTimestamps.length > 0) {
                  // Find the closest timestamp
                  let closestIndex = 0;
                  let minDiff = Math.abs(sortedTimestamps[0] - timestamp);
                  for (let i = 1; i < sortedTimestamps.length; i++) {
                    const diff = Math.abs(sortedTimestamps[i] - timestamp);
                    if (diff < minDiff) {
                      minDiff = diff;
                      closestIndex = i;
                    }
                  }
                  dataIndex = closestIndex;
                  timestamp = sortedTimestamps[dataIndex];
                }
              } else {
                // Category scale mode: use dataIndex
                dataIndex = items[0].dataIndex;
                if (dataIndex >= 0 && dataIndex < sortedTimestamps.length) {
                  timestamp = sortedTimestamps[dataIndex];
                } else {
                  return; // Invalid data index
                }
              }

              const titleLines = tooltipModel.title || [];

              // Add title (date)
              if (titleLines.length > 0) {
                innerHtml += `<div class="ph-tooltip-title">${titleLines[0]}</div>`;
              }

              // Add each dataset's information
              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const datasetLabel = item.dataset.label || '';
                const price = item.parsed.y;

                // Find period info
                const period = findPeriodForDataPoint(
                  dataIndex,
                  datasetLabel,
                  editionPeriods,
                  sortedTimestamps
                );

                const colors = tooltipModel.labelColors[i];
                const colorStyle = `background: ${colors.backgroundColor}; border-color: ${colors.borderColor}; border-width: 2px`;

                innerHtml += '<div class="ph-tooltip-item">';
                innerHtml += `<span class="ph-tooltip-color-box" style="${colorStyle}"></span>`;
                innerHtml += `<span class="ph-tooltip-label">${datasetLabel}: `;
                innerHtml += `<span class="ph-tooltip-price">${(price as number).toLocaleString(intl.locale, {
                  style: 'currency',
                  currency: 'USD'
                })}</span></span>`;

                const periodStartEntry = period ? history?.find(h => h.ts === period.startTs) : undefined;
                const skuFromPeriod = periodStartEntry?.sku;
                const skuMatch = datasetLabel.match(/Sku:\s*(\d+)/i);
                const skuFromLabel = skuMatch?.[1] ? Number(skuMatch[1]) : null;
                const skuValue = typeof skuFromPeriod === 'number'
                  ? skuFromPeriod
                  : (Number.isFinite(skuFromLabel) ? skuFromLabel : null);

                if (showSkuMetaInTooltip && skuValue !== null) {
                  innerHtml += `<div class="ph-tooltip-meta-row">`;
                  innerHtml += `<span class="ph-tooltip-meta-label">${intl.formatMessage({ id: 'priceHistory.chart.sku', defaultMessage: 'SKU' })}:</span>`;
                  innerHtml += `<span class="ph-tooltip-meta-value">${skuValue}</span>`;
                  innerHtml += `</div>`;
                }

                if (periodStartEntry?.items && periodStartEntry.items.length > 1) {
                  innerHtml += `<span class="ph-tooltip-items-value">w/ ${periodStartEntry.items.slice(1).flatMap(item => item.title).join(', ')}</span>`;
                }

                // Add start and end time if period found
                if (period) {
                  innerHtml += '<div class="ph-tooltip-time-info">';

                  // Start time (listed time)
                  const startDate = new Date(period.startTs).toLocaleString(intl.locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  innerHtml += `<div class="ph-tooltip-time-row">`;
                  innerHtml += `<span class="ph-tooltip-time-label">${intl.formatMessage({ id: 'priceHistory.chart.listed', defaultMessage: 'Listed:' })}</span>`;
                  innerHtml += `<span class="ph-tooltip-time-value">${startDate}</span>`;
                  innerHtml += `</div>`;

                  // End time (removed time)
                  if (period.endTs === null) {
                    innerHtml += `<div class="ph-tooltip-time-row">`;
                    innerHtml += `<span class="ph-tooltip-time-label">${intl.formatMessage({ id: 'priceHistory.chart.removed', defaultMessage: 'Removed:' })}</span>`;
                    innerHtml += `<span class="ph-tooltip-time-value">${intl.formatMessage({ id: 'priceHistory.chart.currentlyAvailable', defaultMessage: 'Currently available' })}</span>`;
                    innerHtml += `</div>`;
                  } else {
                    const endDate = new Date(period.endTs).toLocaleString(intl.locale, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    innerHtml += `<div class="ph-tooltip-time-row">`;
                    innerHtml += `<span class="ph-tooltip-time-label">${intl.formatMessage({ id: 'priceHistory.chart.removed', defaultMessage: 'Removed:' })}</span>`;
                    innerHtml += `<span class="ph-tooltip-time-value">${endDate}</span>`;
                    innerHtml += `</div>`;
                  }

                  innerHtml += '</div>';
                }

                innerHtml += '</div>';
              }
            }
          }

          contentDiv.innerHTML = innerHtml;

          // Position tooltip
          const position = context.chart.canvas.getBoundingClientRect();
          const bodyFontSize = 12;
          const bodyFontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
          const bodyFontString = `${bodyFontSize}px ${bodyFontFamily}`;

          // Apply initial styles to measure tooltip size
          tooltipEl.style.opacity = '0';
          tooltipEl.style.position = 'absolute';
          tooltipEl.style.font = bodyFontString;
          tooltipEl.style.padding = (tooltipModel.options.padding || 12) + 'px';
          tooltipEl.style.pointerEvents = 'none';
          tooltipEl.style.backgroundColor = isDarkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)';
          tooltipEl.style.color = isDarkMode ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)';
          tooltipEl.style.border = `1px solid ${isDarkMode ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)'}`;
          tooltipEl.style.borderRadius = '6px';
          tooltipEl.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          tooltipEl.style.zIndex = String(tooltipZIndex);
          tooltipEl.style.maxWidth = '300px';

          // Temporarily position to measure
          tooltipEl.style.left = '-9999px';
          tooltipEl.style.top = '-9999px';

          // Get tooltip dimensions after rendering
          const tooltipRect = tooltipEl.getBoundingClientRect();
          const tooltipWidth = tooltipRect.width;
          const tooltipHeight = tooltipRect.height;

          // Calculate initial position (data point position)
          const dataPointX = position.left + window.scrollX + tooltipModel.caretX;
          const dataPointY = position.top + window.scrollY + tooltipModel.caretY;

          // Calculate offsets to avoid covering the data point
          const offsetX = 10; // Horizontal offset from data point
          const offsetY = 10; // Vertical offset from data point

          // Get viewport dimensions
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;

          // Determine horizontal position (left or right of data point)
          let left: number;
          const spaceOnRight = viewportWidth - dataPointX - offsetX;
          const spaceOnLeft = dataPointX - offsetX;

          if (spaceOnRight >= tooltipWidth) {
            // Enough space on the right, place tooltip to the right
            left = dataPointX + offsetX;
          } else if (spaceOnLeft >= tooltipWidth) {
            // Not enough space on right, but enough on left, place to the left
            left = dataPointX - tooltipWidth - offsetX;
          } else {
            // Not enough space on either side, center on data point
            left = dataPointX - tooltipWidth / 2;
            // Clamp to viewport boundaries
            left = Math.max(10, Math.min(left, viewportWidth - tooltipWidth - 10));
          }

          // Determine vertical position (above or below data point)
          let top: number;
          const spaceBelow = viewportHeight - dataPointY - offsetY;
          const spaceAbove = dataPointY - offsetY;

          if (spaceBelow >= tooltipHeight) {
            // Enough space below, place tooltip below
            top = dataPointY + offsetY;
          } else if (spaceAbove >= tooltipHeight) {
            // Not enough space below, but enough above, place above
            top = dataPointY - tooltipHeight - offsetY;
          } else {
            // Not enough space on either side, center on data point
            top = dataPointY - tooltipHeight / 2;
            // Clamp to viewport boundaries
            top = Math.max(10, Math.min(top, viewportHeight - tooltipHeight - 10));
          }

          // Apply final position
          tooltipEl.style.left = left + 'px';
          tooltipEl.style.top = top + 'px';
          tooltipEl.style.opacity = '1';
        }
      }
    },
    scales: {
      x: useRealTimeScale ? {
        type: 'time' as const,
        max: Date.now(),
        time: {
          unit: 'day' as const,
          displayFormats: {
            day: 'MMM d, yyyy'
          },
          tooltipFormat: 'MMM d, yyyy HH:mm'
        },
        grid: {
          color: isDarkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.5)',
        },
        ticks: {
          color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          maxRotation: 45,
          minRotation: 45,
          font: {
            size: 11
          }
        }
      } : {
        grid: {
          color: isDarkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.5)',
        },
        ticks: {
          color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          maxRotation: 45,
          minRotation: 45,
          font: {
            size: 11
          }
        }
      },
      y: {
        grid: {
          color: isDarkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.5)',
        },
        ticks: {
          color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          callback: function (value: string | number) {
            return (value as number).toLocaleString(intl.locale, {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            });
          },
          font: {
            size: 11
          }
        },
        beginAtZero: false,
        min: yAxisBounds?.min,
        max: yAxisBounds?.max
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [legendPosition, legendAlign, isDarkMode, showTitle, intl, useRealTimeScale, periodData, tooltipZIndex, findPeriodForDataPoint, history, showSkuMetaInTooltip, yAxisBounds, rangeStartTs, rangeEndTs]);

  if (!chartData) {
    return null;
  }

  return (
    <>
      <style>{`
        .price-history-chart-tooltip {
          font-size: 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          max-width: 300px;
        }
        .price-history-chart-tooltip-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ph-tooltip-title {
          font-weight: bold;
          margin-bottom: 4px;
          padding-bottom: 4px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }
        .dark .ph-tooltip-title {
          border-bottom-color: rgba(255, 255, 255, 0.1);
        }
        .ph-tooltip-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ph-tooltip-item .ph-tooltip-label {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ph-tooltip-color-box {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 2px;
          flex-shrink: 0;
        }
        .ph-tooltip-price {
          font-weight: 600;
        }
        .ph-tooltip-meta-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
        }
        .ph-tooltip-meta-label {
          color: rgba(0, 0, 0, 0.6);
          font-weight: 500;
        }
        .dark .ph-tooltip-meta-label {
          color: rgba(255, 255, 255, 0.65);
        }
        .ph-tooltip-meta-value {
          font-weight: 600;
        }
        .ph-tooltip-time-info {
          margin-top: 4px;
          padding-top: 4px;
          border-top: 1px solid rgba(0, 0, 0, 0.1);
          font-size: 11px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ph-tooltip-items-value {
          font-size: 10px;
          color: rgba(0, 0, 0, 0.6);
        }
        .dark .ph-tooltip-items-value {
          color: rgba(255, 255, 255, 0.6);
        }
        .dark .ph-tooltip-time-info {
          border-top-color: rgba(255, 255, 255, 0.1);
        }
        .ph-tooltip-time-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .ph-tooltip-time-label {
          color: rgba(0, 0, 0, 0.6);
          font-weight: 500;
        }
        .dark .ph-tooltip-time-label {
          color: rgba(255, 255, 255, 0.6);
        }
        .ph-tooltip-time-value {
          color: rgba(0, 0, 0, 0.8);
          text-align: right;
        }
        .dark .ph-tooltip-time-value {
          color: rgba(255, 255, 255, 0.8);
        }
      `}</style>
      <Box className={className || 'h-full flex flex-col'}>
        <Box className={panelClassName || 'bg-white dark:bg-gray-800 pb-4 pl-4 flex-1 flex flex-col'}>
          {showRealTimeScaleToggle && (
            <Box className='mb-2 flex justify-end'>
              <FormControlLabel
                control={
                  <Switch
                    checked={useRealTimeScale}
                    onChange={(e) => setUseRealTimeScale(e.target.checked)}
                    size="small"
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                    <FormattedMessage
                      id="priceHistory.chart.realTimeScale"
                      defaultMessage="Real Time Scale"
                    />
                  </Typography>
                }
              />
            </Box>
          )}
          <Box className='flex-1 min-h-0'>
            <Line data={chartData} options={chartOptions} plugins={[selectedRangeOverlayPlugin]} />
          </Box>
        </Box>
      </Box>
    </>
  );
}
