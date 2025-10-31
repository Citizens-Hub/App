import { useState, useMemo, useEffect } from 'react';
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
                className={`p-3 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-700 ${
                  selectedShipId === ship.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
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
                <PriceHistoryChart history={selectedPriceHistory?.history || null} currentMsrp={selectedShip.msrp} />
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
function PriceHistoryChart({ history, currentMsrp }: { history: PriceHistoryEntity['history'] | null; currentMsrp: number }) {
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

  // Filter and sort history entries that have price data
  const chartData = useMemo(() => {
    if (!history) return null;

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
    const getEffectivePrice = (entry: PriceHistoryEntity['history'][0], allHistory: PriceHistoryEntity['history']): number | undefined => {
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
    
    type ProcessedEntry = PriceHistoryEntity['history'][0] & { effectiveMsrp?: number };
    
    // Process entries to include discount removal entries with recovered prices
    const processedEntries: ProcessedEntry[] = history.map(entry => {
      const effectivePrice = getEffectivePrice(entry, history);
      return {
        ...entry,
        effectiveMsrp: effectivePrice
      };
    });
    
    // Filter entries with effective price, sort by timestamp (oldest first for chart)
    const entriesWithPrice = processedEntries
      .filter(entry => entry.effectiveMsrp !== undefined)
      .sort((a, b) => a.ts - b.ts);

    // If no history entries with price, create a single horizontal line with current price
    if (entriesWithPrice.length === 0 && currentMsrp > 0) {
      const now = Date.now();
      const labels = [
        new Date(now - 86400000).toLocaleDateString(intl.locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        new Date(now).toLocaleDateString(intl.locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      ];
      
      return {
        labels,
        datasets: [
          {
            label: intl.formatMessage({ id: 'priceHistory.chart.price', defaultMessage: 'Price' }),
            data: [currentMsrp / 100, currentMsrp / 100],
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: 'rgb(59, 130, 246)',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
          }
        ]
      };
    }

    // If only one history entry with price, add current price as second point
    if (entriesWithPrice.length === 1 && currentMsrp > 0) {
      const firstEntry = entriesWithPrice[0];
      const now = Date.now();
      const labels = [
        new Date(firstEntry.ts).toLocaleDateString(intl.locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        new Date(now).toLocaleDateString(intl.locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      ];
      
      const firstPrice = (firstEntry.effectiveMsrp ?? firstEntry.msrp ?? 0) / 100;
      const currentPrice = currentMsrp / 100;
      
      const baseMsrpData = firstEntry.baseMsrp && firstEntry.baseMsrp !== firstEntry.msrp
        ? [(firstEntry.baseMsrp / 100), null]
        : [];
      
      const hasBaseMsrp = baseMsrpData.length > 0;

      return {
        labels,
        datasets: [
          {
            label: intl.formatMessage({ id: 'priceHistory.chart.price', defaultMessage: 'Price' }),
            data: [firstPrice, currentPrice],
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: 'rgb(59, 130, 246)',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
          },
          ...(hasBaseMsrp ? [{
            label: intl.formatMessage({ id: 'priceHistory.chart.basePrice', defaultMessage: 'Base Price' }),
            data: [firstEntry.baseMsrp ? firstEntry.baseMsrp / 100 : null, null],
            borderColor: 'rgb(156, 163, 175)',
            backgroundColor: 'rgba(156, 163, 175, 0.1)',
            borderDash: [5, 5],
            fill: false,
            tension: 0,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: 'rgb(156, 163, 175)',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
          }] : [])
        ]
      };
    }

    if (entriesWithPrice.length === 0) return null;

    // Calculate active SKU count at each timestamp to identify unavailable periods
    // Sort all history entries by timestamp (oldest first)
    const sortedHistory = [...history].sort((a, b) => a.ts - b.ts);
    
    // Track active SKU count over time
    // Map: timestamp -> active SKU count
    const skuCountMap = new Map<number, number>();
    let activeSkuCount = 0;
    
    // Initialize with first timestamp if it exists
    if (sortedHistory.length > 0) {
      // Check if we start with SKUs already available (if first entry is removal, start from 0)
      // Otherwise, we need to count from the beginning
      for (const entry of sortedHistory) {
        if (entry.change === '+') {
          activeSkuCount++;
        } else if (entry.change === '-') {
          activeSkuCount = Math.max(0, activeSkuCount - 1);
        }
        // Store the count after processing this entry
        skuCountMap.set(entry.ts, activeSkuCount);
      }
    }
    
    // Get unavailable periods: [startTs, endTs][]
    const unavailablePeriods: Array<[number, number]> = [];
    let unavailableStart: number | null = null;
    
    for (let i = 0; i < sortedHistory.length; i++) {
      const entry = sortedHistory[i];
      const countBefore = i > 0 ? (skuCountMap.get(sortedHistory[i - 1].ts) ?? 0) : 0;
      const countAfter = skuCountMap.get(entry.ts) ?? 0;
      
      // If count drops to 0, start unavailable period
      if (countBefore > 0 && countAfter === 0 && unavailableStart === null) {
        unavailableStart = entry.ts;
      }
      // If count goes from 0 to >0, end unavailable period
      if (countBefore === 0 && countAfter > 0 && unavailableStart !== null) {
        unavailablePeriods.push([unavailableStart, entry.ts]);
        unavailableStart = null;
      }
    }
    
    // If we end in an unavailable state, extend to current time
    if (unavailableStart !== null) {
      unavailablePeriods.push([unavailableStart, Date.now()]);
    }

    // Prepare chart data - add current time point at the end
    const now = Date.now();
    
    // Helper to check if a timestamp is unavailable (has 0 active SKUs at that time)
    const checkUnavailableAtTime = (ts: number): boolean => {
      // Find the most recent history entry at or before this timestamp
      const relevantEntries = sortedHistory.filter(e => e.ts <= ts);
      let count = 0;
      for (const entry of relevantEntries) {
        if (entry.change === '+') {
          count++;
        } else if (entry.change === '-') {
          count = Math.max(0, count - 1);
        }
      }
      return count === 0;
    };
    
    // Check availability for each entry and mark unavailable periods with null to break line
    // Also break line if there's an unavailable period between consecutive price points
    const historicalMsrpData: Array<number | null> = [];
    const historicalBaseMsrpData: Array<number | null> = [];
    const historicalLabelsWithGaps: string[] = [];
    
    // Check if any entry has baseMsrp different from msrp
    const hasBaseMsrp = entriesWithPrice.some(entry => 
      entry.baseMsrp && entry.baseMsrp !== entry.msrp
    );
    
    for (let i = 0; i < entriesWithPrice.length; i++) {
      const entry = entriesWithPrice[i];
      const price = (entry.effectiveMsrp ?? entry.msrp ?? 0) / 100;
      const basePrice = hasBaseMsrp && entry.baseMsrp && entry.baseMsrp !== entry.msrp
        ? entry.baseMsrp / 100
        : null;
      
      // Check if this timestamp has 0 active SKUs (unavailable)
      const isUnavailable = checkUnavailableAtTime(entry.ts);
      
      // Before processing current entry, check if there's an unavailable period starting between previous and current entry
      if (i > 0) {
        const prevEntry = entriesWithPrice[i - 1];
        const prevIsUnavailable = checkUnavailableAtTime(prevEntry.ts);
        
        // If previous point was available, check if there's an unavailable period starting between them
        if (!prevIsUnavailable) {
          // Find the unavailable period that starts between prevEntry and entry
          const unavailablePeriodBetween = unavailablePeriods.find(([startTs]) => {
            return startTs > prevEntry.ts && startTs < entry.ts;
          });
          
          if (unavailablePeriodBetween) {
            const [unavailableStartTs] = unavailablePeriodBetween;
            // Get the last price from previous entry (the price at the moment SKU was removed)
            const prevPrice = (prevEntry.effectiveMsrp ?? prevEntry.msrp ?? 0) / 100;
            const prevBasePrice = hasBaseMsrp && prevEntry.baseMsrp && prevEntry.baseMsrp !== prevEntry.msrp
              ? prevEntry.baseMsrp / 100
              : null;
            
            // Add a point at the unavailable period start time with the previous price
            // This point will be connected to the previous point (same price)
            historicalMsrpData.push(prevPrice);
            historicalBaseMsrpData.push(prevBasePrice);
            historicalLabelsWithGaps.push(
              new Date(unavailableStartTs).toLocaleDateString(intl.locale, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })
            );
            
            // Insert null to break the line connection to the next point
            historicalMsrpData.push(null);
            historicalBaseMsrpData.push(null);
            historicalLabelsWithGaps.push(
              new Date(unavailableStartTs + (entry.ts - unavailableStartTs) / 2).toLocaleDateString(intl.locale, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })
            );
          }
        }
      }
      
      // Process current entry
      if (isUnavailable) {
        // If current point is unavailable, add null to break the line
        historicalMsrpData.push(null);
        historicalBaseMsrpData.push(null);
        historicalLabelsWithGaps.push(
          new Date(entry.ts).toLocaleDateString(intl.locale, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        );
      } else {
        // Normal available point with price
        historicalMsrpData.push(price);
        historicalBaseMsrpData.push(basePrice);
        historicalLabelsWithGaps.push(
          new Date(entry.ts).toLocaleDateString(intl.locale, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        );
      }
    }

    // Add current time point if currentMsrp is available
    // Also check if there's an unavailable period between last historical point and current time
    const labels = [...historicalLabelsWithGaps];
    const msrpData = [...historicalMsrpData];
    const baseMsrpData = hasBaseMsrp ? [...historicalBaseMsrpData] : [];
    
    if (currentMsrp > 0) {
      // Check if there's an unavailable period between last entry and current time
      if (entriesWithPrice.length > 0) {
        const lastEntry = entriesWithPrice[entriesWithPrice.length - 1];
        const lastIsUnavailable = checkUnavailableAtTime(lastEntry.ts);
        
        if (!lastIsUnavailable) {
          // Find the unavailable period that starts between lastEntry and now
          const unavailablePeriodBetween = unavailablePeriods.find(([startTs]) => {
            return startTs > lastEntry.ts && startTs < now;
          });
          
          if (unavailablePeriodBetween) {
            const [unavailableStartTs] = unavailablePeriodBetween;
            // Get the last price from last entry (the price at the moment SKU was removed)
            const lastPrice = (lastEntry.effectiveMsrp ?? lastEntry.msrp ?? 0) / 100;
            const lastBasePrice = hasBaseMsrp && lastEntry.baseMsrp && lastEntry.baseMsrp !== lastEntry.msrp
              ? lastEntry.baseMsrp / 100
              : null;
            
            // Add a point at the unavailable period start time with the last price
            // This point will be connected to the last point (same price)
            msrpData.push(lastPrice);
            if (hasBaseMsrp) {
              baseMsrpData.push(lastBasePrice);
            }
            labels.push(
              new Date(unavailableStartTs).toLocaleDateString(intl.locale, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })
            );
            
            // Insert null to break the line connection to the next point
            msrpData.push(null);
            if (hasBaseMsrp) {
              baseMsrpData.push(null);
            }
            labels.push(
              new Date(unavailableStartTs + (now - unavailableStartTs) / 2).toLocaleDateString(intl.locale, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })
            );
          }
        }
      }
      
      // Check if current point is unavailable
      const currentIsUnavailable = checkUnavailableAtTime(now);
      msrpData.push(currentIsUnavailable ? null : currentMsrp / 100);
      
      // Add current baseMsrp if applicable
      if (hasBaseMsrp) {
        const lastEntry = entriesWithPrice[entriesWithPrice.length - 1];
        const currentBaseMsrp = lastEntry?.baseMsrp && lastEntry.baseMsrp !== lastEntry.msrp
          ? lastEntry.baseMsrp / 100
          : null;
        baseMsrpData.push(currentBaseMsrp);
      }
      
      labels.push(
        new Date(now).toLocaleDateString(intl.locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      );
    }


    // Point colors: gray for unavailable periods (though they'll be null, this is for consistency)
    const pointBackgroundColors = msrpData.map((price) => {
      // If price is null (unavailable), use gray color (though point won't be shown)
      if (price === null) return 'rgb(156, 163, 175)';
      return 'rgb(59, 130, 246)';
    });

    return {
      labels,
      datasets: [
        {
          label: intl.formatMessage({ id: 'priceHistory.chart.price', defaultMessage: 'Price' }),
          data: msrpData,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: pointBackgroundColors,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          spanGaps: false, // Don't connect across null values (unavailable periods)
        },
        ...(hasBaseMsrp ? [{
          label: intl.formatMessage({ id: 'priceHistory.chart.basePrice', defaultMessage: 'Base Price' }),
          data: baseMsrpData,
          borderColor: 'rgb(156, 163, 175)',
          backgroundColor: 'rgba(156, 163, 175, 0.1)',
          borderDash: [5, 5],
          fill: false,
          tension: 0,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: 'rgb(156, 163, 175)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
        }] : [])
      ]
    };
  }, [history, currentMsrp, intl]);

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
          label: function(context: { dataset: { label?: string }; parsed: { y: number | null } }) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += (context.parsed.y).toLocaleString(intl.locale, {
                style: 'currency',
                currency: 'USD'
              });
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
          callback: function(value: string | number) {
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
        grace: '10%'
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    }
  }), [intl, isDarkMode]);

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
            className={`border-l-2 pl-4 pb-4 text-left ${
              entry.change === '+' ? 'border-green-500' : 'border-red-500'
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

