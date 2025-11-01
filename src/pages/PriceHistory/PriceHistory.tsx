import { useState, useMemo, useEffect, useCallback } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  TextField,
  InputAdornment,
  Typography,
  CircularProgress,
  Box
} from '@mui/material';
import { Search } from '@mui/icons-material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useShipsData, usePriceHistoryData } from '@/hooks';
import { PriceHistoryEntity } from '@/types';
import { useApi } from '@/hooks/swr/useApi';
import { CcusData } from '@/types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function PriceHistory() {
  const intl = useIntl();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShipId, setSelectedShipId] = useState<number | null>(null);

  // Fetch ships data
  const { ships, loading: shipsLoading, error: shipsError } = useShipsData();

  // Fetch price history data
  const { priceHistoryMap, loading: priceHistoryLoading, error: priceHistoryError } = usePriceHistoryData();

  // Fetch CCU data to check if CCU is available
  const { data: ccusData } = useApi<CcusData>('/api/ccus');
  const ccus = ccusData?.data?.to?.ships || [];

  const loading = shipsLoading || priceHistoryLoading;
  const error = shipsError || priceHistoryError;

  // Filter ships based on search term
  const filteredShips = useMemo(() => {
    if (!ships) return [];

    // Filter out ships with price 0 and ships without price history
    let filtered = ships.filter(ship => {
      // Must have price > 1500
      if (ship.msrp <= 1500) return false;

      // Must have price history records (ship is available for sale)
      const priceHistory = priceHistoryMap[ship.id];
      if (!priceHistory || !priceHistory.history || priceHistory.history.length === 0) {
        return false;
      }

      return true;
    });

    if (searchTerm) {
      filtered = filtered.filter(ship =>
        ship.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.manufacturer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered.sort((a, b) => a.msrp - b.msrp);
  }, [ships, searchTerm, priceHistoryMap]);

  // Get selected ship
  const selectedShip = selectedShipId ? ships.find(s => s.id === selectedShipId) : null;

  // Get price history for selected ship
  const selectedPriceHistory = selectedShipId ? priceHistoryMap[selectedShipId] : null;

  // Check if ship has CCU available
  // const hasCcuAvailable = (shipId: number) => {
  //   return ccus.some(ccu => ccu.id === shipId);
  // };

  // Get WB price if available
  const getWbPrice = (shipId: number) => {
    const ship = ships.find(s => s.id === shipId);
    if (!ship) return null;

    const ccu = ccus.find(c => c.id === shipId);
    if (ccu) {
      const wbSku = ccu.skus.find(sku => sku.price < ship.msrp && sku.available);
      return wbSku ? wbSku.price : null;
    }
    return null;
  };

  if (loading) {
    return (
      <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 flex items-center justify-center'>
        <CircularProgress />
      </div>
    );
  }

  if (error) {
    return (
      <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 flex items-center justify-center'>
        <Typography color="error">{error}</Typography>
      </div>
    );
  }

  return (
    <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 flex flex-col md:flex-row'>
      {/* Left Panel - Ship List */}
      <div className='w-full md:w-96 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full overflow-hidden'>
        <div className='p-4 border-b border-gray-200 dark:border-gray-800'>
          {/* <Typography variant="h6" className='mb-4'>
            <FormattedMessage id="priceHistory.title" defaultMessage="Price History" />
          </Typography> */}
          <TextField
            size="small"
            fullWidth
            placeholder={intl.formatMessage({ id: 'priceHistory.searchPlaceholder', defaultMessage: 'Search ships...' })}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              }
            }}
          />
        </div>

        <div className='flex-1 overflow-y-auto'>
          {filteredShips.map((ship) => {
            const wbPrice = getWbPrice(ship.id);
            // const hasCcu = hasCcuAvailable(ship.id);

            return (
              <div
                key={ship.id}
                onClick={() => setSelectedShipId(ship.id)}
                className={`p-3 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-700 ${selectedShipId === ship.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
              >
                <div className='flex items-center gap-3'>
                  {ship.medias?.productThumbMediumAndSmall && (
                    <img
                      src={ship.medias.productThumbMediumAndSmall}
                      alt={ship.name}
                      className='w-16 h-16 object-cover rounded'
                    />
                  )}
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-1'>
                      {wbPrice && (
                        <span className='text-xs text-white bg-orange-400 rounded px-1'>WB</span>
                      )}
                      <Typography variant="body2" className='font-medium truncate'>
                        {ship.name}
                      </Typography>
                    </div>
                    <div className='text-gray-500 dark:text-gray-400 text-left text-sm'>
                      {ship.manufacturer.name}
                    </div>
                    <div className='flex items-center gap-2 mt-1'>
                      {wbPrice ? (
                        <>
                          <span className='text-sm text-gray-400 line-through'>
                            {(ship.msrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                          </span>
                          <span className='text-sm text-blue-400 font-bold'>
                            {(wbPrice / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                          </span>
                        </>
                      ) : (
                        <span className='text-sm text-blue-400 font-bold'>
                          {(ship.msrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                        </span>
                      )}
                    </div>
                    {/* {!hasCcu && (
                      <Typography variant="caption" className='text-red-500 block mt-1'>
                        <FormattedMessage id="priceHistory.ccuUnavailable" defaultMessage="CCU Unavailable" />
                      </Typography>
                    )} */}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel - Price History Details */}
      <div className='flex-1 flex flex-col overflow-hidden'>
        {selectedShip ? (
          <div className='flex flex-col h-full p-4'>
            <Typography variant="h5" className='mb-2'>
              {selectedShip.name}
            </Typography>
            <Typography variant="body2" className='text-gray-500 dark:text-gray-400'>
              {selectedShip.manufacturer.name}
            </Typography>

            {/* Chart and Timeline - Side by side layout */}
            <div className='flex-1 flex flex-row gap-4 min-h-0 mt-4'>
              <div className='flex-[1] min-w-0 overflow-y-auto'>
                <PriceHistoryTimeline history={selectedPriceHistory?.history || null} />
              </div>

              <div className='flex-[5] min-w-0'>
                <PriceHistoryChart history={selectedPriceHistory?.history || null} currentMsrp={selectedShip.msrp} shipName={selectedShip.name} />
              </div>
            </div>
          </div>
        ) : (
          <div className='flex items-center justify-center h-full'>
            <Typography variant="body1" className='text-gray-400'>
              <FormattedMessage id="priceHistory.selectShip" defaultMessage="Select a ship to view price history" />
            </Typography>
          </div>
        )}
      </div>
    </div>
  );
}

// Price History Chart Component
function PriceHistoryChart({ history, currentMsrp, shipName }: { history: PriceHistoryEntity['history'] | null; currentMsrp: number; shipName: string }) {
  // Keep currentMsrp for potential future use (e.g., showing current price when no history)
  void currentMsrp;

  const intl = useIntl();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

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

  const getEditionName = useCallback((edition: string, skuId: number) => {
    if (
      edition.toLowerCase().trim() === (shipName.toLowerCase().trim() + ' upgrade') ||
      edition.toLowerCase().includes('standard') ||
      edition.toLowerCase().trim() === (shipName.toLowerCase().trim() + ' - upgrade') ||
      edition.trim() === "Unknown"
    ) {
      return 'Standard (Sku:' + skuId.toString() + ")";
    }

    return "Warbond (Sku:" + skuId.toString() + ")";
  }, [shipName]);

  // Generate distinct colors for editions
  const getEditionColor = (_edition: string, index: number): string => {
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
  };

  // Filter and sort history entries that have price data
  const chartData = useMemo(() => {
    if (!history) return null;

    const now = Date.now();
    const sortedHistory = [...history].sort((a, b) => a.ts - b.ts);

    // sortedHistory.forEach(entry => {
    //   entry.ts = Math.ceil(entry.ts / 1000 / 24 / 60 / 60) * 1000 * 24 * 60 * 60;

    //   console.log("entry>>>>", new Date(entry.ts).toLocaleDateString(intl.locale, {
    //     month: 'short',
    //     day: 'numeric',
    //     year: 'numeric'
    //   }));
    // });

    // Build periods for each edition: [startTs, endTs) - closed start, open end
    interface EditionPeriod {
      startTs: number;
      endTs: number | null; // null means still active
      price: number;
    }

    const editionPeriods = new Map<string, EditionPeriod[]>();
    const activeEditions = new Map<string, { startTs: number; price: number }>();

    // Process entries to build periods
    for (const entry of sortedHistory) {
      const edition = getEditionName(entry.edition || 'Unknown', entry.sku || 0);

      // console.log("edition>>>>", edition, new Date(entry.ts).toLocaleDateString(intl.locale, {
      //   month: 'short',
      //   day: 'numeric',
      //   year: 'numeric'
      // }));

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

    // Sort all timestamps
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

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
      data: Array<number | null>;
      borderColor: string;
      backgroundColor: string;
      fill: boolean;
      tension: number;
      pointRadius: number | Array<number>;
      pointHoverRadius: number | Array<number>;
      spanGaps: boolean;
    }> = [];

    editionArray.forEach((edition, index) => {
      const periods = editionPeriods.get(edition)!;
      const data: Array<number | null> = [];

      for (const ts of sortedTimestamps) {
        let value: number | null = null;

        // console.log("ts>>>>", new Date(ts).toLocaleDateString(intl.locale, {
        //   month: 'short',
        //   day: 'numeric',
        //   year: 'numeric'
        // }));

        // console.log("periods>>>>", periods);

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
        borderColor: getEditionColor(getEditionName(edition, 0), index),
        backgroundColor: getEditionColor(edition, index).replace('rgb', 'rgba').replace(')', ', 0.1)'),
        fill: true,
        tension: 0,
        pointRadius: pointRadius,
        pointHoverRadius: pointHoverRadius,
        spanGaps: false // Don't connect across null values
      });
    });

    return {
      labels,
      datasets
    };
  }, [getEditionName, history, intl.locale]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
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
        display: true,
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
        mode: 'index' as const,
        intersect: false,
        backgroundColor: isDarkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: isDarkMode ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
        bodyColor: isDarkMode ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
        borderColor: isDarkMode ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: function (context: { dataset: { label?: string }; parsed: { y: number | null } }) {
            let label = context.dataset.label || '';
            if (label) {
              label += ':';
            }
            if (context.parsed.y !== null) {
              label += (context.parsed.y).toLocaleString(intl.locale, {
                style: 'currency',
                currency: 'USD'
              });
            }

            const skuId = label.match(/Sku:(\d+)/)?.[1];

            const sku = history?.find(h => h.sku === parseInt(skuId || '0') && h.change === '+');

            const items = sku?.items;

            if (items && items.length > 1) {
              label += ` /w ${items.slice(1).map(item => item.title).join(', ')}`;
            }

            return label;
          }
        }
      }
    },
    scales: {
      x: {
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
        beginAtZero: true,
        grace: '15%'
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    }
  }), [history, intl, isDarkMode]);

  if (!chartData) {
    return null;
  }

  return (
    <Box className='h-full'>
      <Box className='bg-white dark:bg-gray-800 p-4 h-full'>
        <Line data={chartData} options={chartOptions} />
      </Box>
    </Box>
  );
}

// Price History Timeline Component
function PriceHistoryTimeline({ history }: { history: PriceHistoryEntity['history'] | null }) {
  const intl = useIntl();

  // Helper function to check if edition indicates a discount version
  const isDiscountEdition = (edition?: string) => {
    if (!edition) return false;
    const lowerEdition = edition.toLowerCase();
    return lowerEdition.includes('warbond') ||
      lowerEdition.includes(' - wb') ||
      lowerEdition.includes('-wb') ||
      lowerEdition.endsWith(' - ') ||
      lowerEdition.includes('upgrade -');
  };

  // Helper function to get effective price for an entry
  const getEffectivePrice = (entry: PriceHistoryEntity['history'][0], allHistory: PriceHistoryEntity['history']) => {
    // If entry has msrp, use it
    if (entry.msrp !== undefined) {
      return entry.msrp;
    }

    // If this is a discount edition removal (change === '-' and edition indicates discount)
    if (entry.change === '-' && isDiscountEdition(entry.edition)) {
      // Use baseMsrp if available
      if (entry.baseMsrp !== undefined) {
        return entry.baseMsrp;
      }

      // Sort history by timestamp (newest first for easier lookup)
      const sortedHistory = [...allHistory].sort((a, b) => b.ts - a.ts);
      const currentIndex = sortedHistory.findIndex(e => e.ts === entry.ts && e.edition === entry.edition);

      if (currentIndex >= 0) {
        // First, look for a standard edition added after this removal (in the past, so earlier timestamp)
        // Since sortedHistory is newest first, we look at indices after currentIndex (older entries)
        for (let i = currentIndex + 1; i < sortedHistory.length; i++) {
          const laterEntry = sortedHistory[i];
          // If we find a standard edition addition after removal, that's the recovered price
          if (laterEntry.change === '+' &&
            laterEntry.msrp !== undefined &&
            !isDiscountEdition(laterEntry.edition) &&
            laterEntry.ts < entry.ts) {
            return laterEntry.baseMsrp || laterEntry.msrp;
          }
        }

        // If not found, look for the most recent standard edition before the discount was added
        // This represents the price before the discount was applied
        for (let i = currentIndex + 1; i < sortedHistory.length; i++) {
          const prevEntry = sortedHistory[i];
          if (prevEntry.change === '+' &&
            prevEntry.msrp !== undefined &&
            !isDiscountEdition(prevEntry.edition)) {
            return prevEntry.baseMsrp || prevEntry.msrp;
          }
        }
      }
    }

    return undefined;
  };

  if (!history || history.length === 0) {
    return (
      <Typography variant="body2" className='text-gray-400'>
        <FormattedMessage id="priceHistory.noHistory" defaultMessage="No price history available" />
      </Typography>
    );
  }

  // Sort history by timestamp (oldest first for counting)
  const sortedHistoryForCounting = [...history].sort((a, b) => a.ts - b.ts);

  // Calculate active SKU count after each entry
  const skuCountAfterEntry = new Map<number, number>();
  let activeSkuCount = 0;

  for (const entry of sortedHistoryForCounting) {
    if (entry.change === '+') {
      activeSkuCount++;
    } else if (entry.change === '-') {
      activeSkuCount = Math.max(0, activeSkuCount - 1);
    }
    // Store the count after processing this entry
    skuCountAfterEntry.set(entry.ts, activeSkuCount);
  }

  // Helper to check if ship is unavailable after a timestamp
  const isUnavailableAfter = (ts: number): boolean => {
    return (skuCountAfterEntry.get(ts) ?? 0) === 0;
  };

  // Sort history by timestamp (newest first)
  const sortedHistory = [...history].sort((a, b) => b.ts - a.ts);

  // Process entries to get effective prices and availability status
  const processedHistory = sortedHistory.map(entry => ({
    ...entry,
    effectiveMsrp: getEffectivePrice(entry, history),
    isUnavailable: isUnavailableAfter(entry.ts)
  }));

  return (
    <div>
      <div className='space-y-4'>
        {processedHistory.map((entry, index) => {
          type ProcessedEntry = PriceHistoryEntity['history'][0] & { effectiveMsrp?: number; isUnavailable?: boolean };
          const processedEntry = entry as ProcessedEntry;
          const displayPrice = processedEntry.effectiveMsrp ?? entry.msrp;
          const isUnavailable = processedEntry.isUnavailable ?? false;

          return (
            <div
              key={index}
              className={`border-l-2 pl-4 pb-4 text-left ${entry.change === '+' ? 'border-green-500' : 'border-red-500'
                }`}
            >
              <div className='flex items-center gap-2 mb-1'>
                <span
                  className={`${entry.change === '+' ? 'text-green-500' : 'text-red-500'} text-left text-md font-bold`}
                >{entry.change}</span>
                <div className='font-medium text-left text-md'>
                  {new Date(entry.ts).toLocaleDateString(intl.locale, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    // hour: '2-digit',
                    // minute: '2-digit'
                  })}
                </div>
                {/* {isUnavailable && (
                <span className='text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-left text-md'>
                  <FormattedMessage id="priceHistory.unavailable" defaultMessage="Unavailable" />
                </span>
              )} */}
              </div>
              {entry.edition && (
                <div className='text-gray-600 dark:text-gray-300 mb-1'>
                  {entry.edition}
                </div>
              )}
              {displayPrice !== undefined && !isUnavailable && (
                <div className='font-bold text-blue-400 text-left text-md'>
                  {(displayPrice / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                  {entry.baseMsrp && entry.baseMsrp !== displayPrice && (
                    <span className='text-gray-400 line-through ml-2'>
                      {(entry.baseMsrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                    </span>
                  )}
                </div>
              )}
              {isUnavailable && entry.change === '-' && (
                <div className='text-gray-500 dark:text-gray-400 italic text-left text-md'>
                  <FormattedMessage id="priceHistory.allSkusRemoved" defaultMessage="All SKUs removed" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

