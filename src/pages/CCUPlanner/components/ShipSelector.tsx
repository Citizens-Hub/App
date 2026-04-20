import { memo, useMemo, useState } from 'react';
import { Ccu, Ship } from '@/types';
import { FormattedMessage, useIntl } from 'react-intl';
// import { Link } from 'react-router';
import { Button, IconButton, InputAdornment, Switch, TextField, Tooltip, useMediaQuery } from '@mui/material';
import { InfoOutlined, Search } from '@mui/icons-material';
import { useLocale } from '@/contexts/LocaleContext';
import { localizeShipFocus, localizeShipStatus, localizeShipType } from '@/data/shipMetadataI18n';
import { useCcuPlanner } from '../context/useCcuPlanner';

interface ShipSelectorProps {
  ships: Ship[];
  ccus: Ccu[];
  onDragStart: (event: React.DragEvent<HTMLDivElement>, ship: Ship) => void;
  onMobileAdd: (ship: Ship) => void;
  onOpenShipInfo?: (ship: Ship) => void;
  onOpenShipContextMenu?: (event: React.MouseEvent<HTMLElement>, ship: Ship) => void;
}

function ShipSelector({
  ships,
  ccus,
  onDragStart,
  onMobileAdd,
  onOpenShipInfo,
  onOpenShipContextMenu
}: ShipSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showHistoryWB, setShowHistoryWB] = useState(false);
  const [onlyShowAvailable, setOnlyShowAvailable] = useState(false);
  const intl = useIntl();
  const { locale } = useLocale();
  const { priceHistoryMap } = useCcuPlanner();
  const isMobile = useMediaQuery('(max-width: 644px)');

  const shipMsrpById = useMemo(() => {
    return new Map(ships.map(ship => [ship.id, ship.msrp]));
  }, [ships]);

  const availableWbPriceByShipId = useMemo(() => {
    const result = new Map<number, number>();

    ccus.forEach(ccu => {
      const shipMsrp = shipMsrpById.get(ccu.id);
      if (shipMsrp === undefined) {
        return;
      }

      let bestPrice: number | null = null;

      ccu.skus.forEach(sku => {
        if (sku.price < shipMsrp && (bestPrice === null || sku.price < bestPrice)) {
          bestPrice = sku.price;
        }
      });

      if (bestPrice !== null) {
        result.set(ccu.id, bestPrice);
      }
    });

    return result;
  }, [ccus, shipMsrpById]);

  const availableShipIds = useMemo(() => {
    return new Set(ccus.map(ccu => ccu.id));
  }, [ccus]);

  const historicalWbPriceByShipId = useMemo(() => {
    const result = new Map<number, number>();

    Object.entries(priceHistoryMap).forEach(([shipId, entity]) => {
      let latestHistoricalPrice: number | null = null;
      let latestHistoricalTs = -Infinity;

      entity.history.forEach(entry => {
        if (
          entry.msrp !== undefined &&
          entry.baseMsrp !== undefined &&
          entry.msrp !== entry.baseMsrp &&
          entry.ts > latestHistoricalTs
        ) {
          latestHistoricalTs = entry.ts;
          latestHistoricalPrice = entry.msrp;
        }
      });

      if (latestHistoricalPrice !== null) {
        result.set(Number(shipId), latestHistoricalPrice);
      }
    });

    return result;
  }, [priceHistoryMap]);

  const filteredShips = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    const filtered = ships.filter(ship => {
      const isInPlannerRange = (ship.msrp >= 2000 && ship.msrp < 100000) || ship.msrp === 0;
      if (!isInPlannerRange) {
        return false;
      }

      if (onlyShowAvailable && !availableShipIds.has(ship.id)) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      return (
        ship.name.toLowerCase().includes(normalizedSearchTerm) ||
        ship.localizedName?.toLowerCase().includes(normalizedSearchTerm) ||
        ship.manufacturer.name.toLowerCase().includes(normalizedSearchTerm) ||
        ship.type.toLowerCase().includes(normalizedSearchTerm) ||
        localizeShipType(locale, ship.type).toLowerCase().includes(normalizedSearchTerm) ||
        localizeShipFocus(locale, ship.focus).toLowerCase().includes(normalizedSearchTerm) ||
        localizeShipStatus(locale, ship).toLowerCase().includes(normalizedSearchTerm)
      );
    });

    filtered.sort((a, b) => {
      const aHasAvailableWb = availableWbPriceByShipId.has(a.id) ? 1 : 0;
      const bHasAvailableWb = availableWbPriceByShipId.has(b.id) ? 1 : 0;

      if (showHistoryWB) {
        const aHasHistoricalWb = historicalWbPriceByShipId.has(a.id) ? 1 : 0;
        const bHasHistoricalWb = historicalWbPriceByShipId.has(b.id) ? 1 : 0;
        if (aHasHistoricalWb !== bHasHistoricalWb) {
          return bHasHistoricalWb - aHasHistoricalWb;
        }
      }

      if (a.msrp === 0) {
        return 1;
      }

      if (b.msrp === 0) {
        return -1;
      }

      if (aHasAvailableWb !== bHasAvailableWb) {
        return bHasAvailableWb - aHasAvailableWb;
      }

      return a.msrp - b.msrp;
    });

    return filtered;
  }, [
    availableShipIds,
    availableWbPriceByShipId,
    historicalWbPriceByShipId,
    locale,
    onlyShowAvailable,
    searchTerm,
    ships,
    showHistoryWB
  ]);

  const handleMobileShipSelection = (ship: Ship) => {
    onMobileAdd(ship);
    setSearchTerm('');
  };

  const handleOpenShipInfo = (event: React.MouseEvent<HTMLButtonElement>, ship: Ship) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenShipInfo?.(ship);
  };

  return (
    <div className="md:h-full h-auto overflow-y-auto w-full mx-1 sm:m-0">
      <div className="sticky top-0 bg-white dark:bg-[#121212] border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-xl font-bold px-2 pt-2">
          <FormattedMessage id="ccuPlanner.availableShips" defaultMessage="Available Ships" />
        </h2>

        <div className="p-2 pb-4">
          <TextField
            size="small"
            fullWidth
            placeholder={intl.formatMessage({ id: 'ccuPlanner.searchPlaceholder', defaultMessage: 'Search ships...' })}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 0 }
            }}
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

        <div className="flex items-center gap-2 px-2 pb-2 justify-between">
          <label className="flex items-center gap-2" htmlFor="showHistoryWB">
            <FormattedMessage id="ccuPlanner.showHistoryWB" defaultMessage="Show History WB" />
            {/* <Tooltip title={
              <span style={{ fontSize: '14px' }}>
                <FormattedMessage id="ccuPlanner.showHistoryWBTooltip" defaultMessage="This is a test function, the data may not be accurate" />
              </span>
            }>
              <InfoOutlined sx={{ fontSize: 16 }} />
            </Tooltip> */}
          </label>
          <Switch checked={showHistoryWB} onChange={(event) => setShowHistoryWB(event.target.checked)} id="showHistoryWB" />
        </div>
        {/* <div className="px-2 pb-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <FormattedMessage
              id="ccuPlanner.historyWBHint"
              defaultMessage="You can check detailed WB historical records on the {link} page"
              values={{
                link: (
                  <Link to="/price-history" className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline">
                    <FormattedMessage id="navigation.priceHistory" defaultMessage="Price History" />
                  </Link>
                )
              }}
            />
          </p>
        </div> */}

        <div className="flex items-center gap-2 px-2 pb-2 justify-between">
          <label className="flex items-center gap-2" htmlFor="onlyShowAvailable">
            <FormattedMessage id="ccuPlanner.onlyShowAvailable" defaultMessage="Only show available ships" />
          </label>
          <Switch checked={onlyShowAvailable} onChange={(event) => setOnlyShowAvailable(event.target.checked)} id="onlyShowAvailable" />
        </div>
      </div>

      {(!isMobile || searchTerm !== '') && (
        <div className="flex flex-col items-start border-b md:border-b-0 border-gray-200 dark:border-gray-800 overflow-auto absolute w-full z-10 bg-white dark:bg-[#121212] h-[calc(100vh-258px)] sm:max-h-full max-h-[calc(100vh-425px)]">
          {filteredShips.map((ship) => {
            const availableWbPriceCents = availableWbPriceByShipId.get(ship.id);
            const historicalWbPriceCents = historicalWbPriceByShipId.get(ship.id);
            const hasAvailableWb = availableWbPriceCents !== undefined;
            const hasHistoricalWb = showHistoryWB && historicalWbPriceCents !== undefined;

            return (
              <div
                key={ship.id}
                draggable
                onDragStart={(event) => onDragStart(event, ship)}
                onContextMenu={(event) => onOpenShipContextMenu?.(event, ship)}
                className="p-2 cursor-move transition-colors hover:bg-amber-100 dark:hover:bg-gray-900 flex justify-between items-center w-full"
              >
                <div className="flex items-center text-left">
                  <img
                    src={ship.medias.productThumbMediumAndSmall}
                    alt={ship.name}
                    className="w-17 h-17 object-cover mr-2"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      {hasAvailableWb ? (
                        <div className="text-xs text-white bg-orange-400 rounded-sm px-1">WB</div>
                      ) : hasHistoricalWb ? (
                        <div className="text-xs text-white bg-orange-300 rounded-sm px-1">WB</div>
                      ) : null}
                      {ship.flyableStatus !== 'Flyable' && <div className="text-xs text-white bg-sky-400 dark:bg-sky-600 rounded-sm px-1">{localizeShipStatus(locale, ship)}</div>}
                      <h3 className="font-medium">{ship.localizedName || ship.name}</h3>
                    </div>
                    {!availableShipIds.has(ship.id) && (
                      <div className="text-xs text-white bg-red-300 dark:bg-pink-700 rounded-sm w-fit px-1">
                        <FormattedMessage id="ccuPlanner.noStock" defaultMessage="No stock" />
                      </div>
                    )}
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      {ship.manufacturer.name}
                    </div>
                    <div className="text-sm text-blue-400 font-bold flex items-center gap-2">
                      <span className={hasAvailableWb || hasHistoricalWb ? 'text-xs text-gray-400 line-through' : ''}>
                        {(ship.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </span>
                      {hasAvailableWb && (
                        <span>{(availableWbPriceCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      )}
                      {!hasAvailableWb && hasHistoricalWb && (
                        <span>{(historicalWbPriceCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {onOpenShipInfo && (
                    <Tooltip title={intl.formatMessage({ id: 'ccuPlanner.shipMenu.viewInfo', defaultMessage: 'Ship Information' })}>
                      <IconButton
                        size="small"
                        draggable={false}
                        aria-label={intl.formatMessage({ id: 'ccuPlanner.shipMenu.viewInfo', defaultMessage: 'Ship Information' })}
                        onMouseDown={(event) => event.stopPropagation()}
                        onDragStart={(event) => event.preventDefault()}
                        onClick={(event) => handleOpenShipInfo(event, ship)}
                      >
                        <InfoOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {isMobile && <Button variant="outlined" onClick={() => handleMobileShipSelection(ship)}>+</Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(ShipSelector);
