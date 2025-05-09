import { useState, useEffect } from 'react';
import { Ccu, Ship, WbHistoryData } from '../../../types';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, Switch, Tooltip, useMediaQuery } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';

interface ShipSelectorProps {
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  onDragStart: (event: React.DragEvent<HTMLDivElement>, ship: Ship) => void;
  onMobileAdd: (ship: Ship) => void;
}

export default function ShipSelector({ ships, ccus, wbHistory, onDragStart, onMobileAdd }: ShipSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredShips, setFilteredShips] = useState<Ship[]>(ships);
  const [showHistoryWB, setShowHistoryWB] = useState(false);
  const [onlyShowAvailable, setOnlyShowAvailable] = useState(false);
  const intl = useIntl();

  const isMobile = useMediaQuery('(max-width: 644px)');

  // When the search term or ship list changes, filter the ships, and sort the ships with WB first
  useEffect(() => {
    let filtered = ships;

    if (searchTerm) {
      filtered = ships.filter(ship =>
        ship.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.manufacturer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    filtered = [...filtered].sort((a, b) => {
      const aHasWB = ccus.find(c => c.id === a.id)?.skus.find(s => s.price < a.msrp) ? 1 : 0;
      const bHasWB = ccus.find(c => c.id === b.id)?.skus.find(s => s.price < b.msrp) ? 1 : 0;

      if (a.msrp === 0) {
        return 1;
      }

      if (b.msrp === 0) {
        return -1;
      }

      return bHasWB - aHasWB;
    });

    if (showHistoryWB) {
      filtered = filtered.sort((a, b) => {
        const aHasHistoryWB = wbHistory.find(h => h.name === a.name && h.price !== '') ? 1 : 0;
        const bHasHistoryWB = wbHistory.find(h => h.name === b.name && h.price !== '') ? 1 : 0;
        return bHasHistoryWB - aHasHistoryWB;
      });
    }

    if (onlyShowAvailable) {
      filtered = filtered.filter(ship => {
        const ccu = ccus.find(c => c.id === ship.id);
        return ccu;
      });
    }

    setFilteredShips(filtered);
  }, [searchTerm, ships, ccus, showHistoryWB, wbHistory, onlyShowAvailable]);

  //sets selected ship for mobile, and clears out search as to hide the ship list
  const handleMobileShipSelection = (ship: Ship) => {
    onMobileAdd(ship);
    setSearchTerm('');
  }

  return (
    <div className="md:h-full h-auto overflow-y-auto w-full mx-1 sm:m-0">
      <div className="sticky top-0 bg-white dark:bg-[#121212] border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-xl font-bold px-2 pt-2">
          <FormattedMessage id="ccuPlanner.availableShips" defaultMessage="Available Ships" />
        </h2>

        <div className="p-2 pb-4">
          <input
            type="text"
            placeholder={intl.formatMessage({ id: 'ccuPlanner.searchPlaceholder', defaultMessage: 'Search ships...' })}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-gray-700 rounded-md px-3 py-2 w-full"
          />
        </div>

        <div className='flex items-center gap-2 px-2 pb-2 justify-between'>
          <label className='flex items-center gap-2'>
            <FormattedMessage id="ccuPlanner.showHistoryWB" defaultMessage="Show History WB" />
            <Tooltip title={
              <span style={{ fontSize: '14px' }}>
                <FormattedMessage id="ccuPlanner.showHistoryWBTooltip" defaultMessage="This is a test function, the data may not be accurate" />
              </span>
            }>
              <InfoOutlined sx={{ fontSize: 16 }} />
            </Tooltip>
          </label>
          <Switch checked={showHistoryWB} onChange={(e) => setShowHistoryWB(e.target.checked)} />
        </div>

        <div className='flex items-center gap-2 px-2 pb-2 justify-between'>
          <label className='flex items-center gap-2'>
            <FormattedMessage id="ccuPlanner.onlyShowAvailable" defaultMessage="Only show available ships" />u
          </label>
          <Switch checked={onlyShowAvailable} onChange={(e) => setOnlyShowAvailable(e.target.checked)} />
        </div>
      </div>

      {(!isMobile || searchTerm !== '') &&
        <div className="grid grid-cols-1 items-start border-b md:border-b-0 border-gray-200 dark:border-gray-800 overflow-auto absolute w-full z-10 bg-white dark:bg-[#121212] xl:h-[calc(100vh-308px)] sm:h-[calc(100vh-368px)] sm:max-h-full max-h-[calc(100vh-425px)]">
          {filteredShips.map((ship) => (
            <div
              key={ship.id}
              draggable
              onDragStart={(event) => onDragStart(event, ship)}
              className="p-2 cursor-move transition-colors hover:bg-amber-100 dark:hover:bg-gray-900 flex justify-between items-center"
            >
              <div className="flex items-center text-left">
                <img
                  src={ship.medias.productThumbMediumAndSmall}
                  alt={ship.name}
                  className="w-17 h-17 object-cover mr-2"
                />
                <div>
                  <div className="flex items-center gap-2">
                    {
                      ccus.find(c => c.id === ship.id)?.skus.find(s => s.price < ship.msrp) ? <div className="text-xs text-white bg-orange-400 rounded-sm px-1">WB</div> :
                        wbHistory.find(h => h.name === ship.name && h.price !== '') && showHistoryWB && <div className="text-xs text-white bg-orange-300 rounded-sm px-1">WB</div>
                    }
                    {ship.flyableStatus !== 'Flyable' && <div className="text-xs text-white bg-sky-400 dark:bg-sky-600 rounded-sm px-1">{ship.flyableStatus}</div>}
                    <h3 className="font-medium">{ship.name}</h3>
                  </div>
                  {
                    !ccus.find(c => c.id === ship.id) && <div className="text-xs text-white bg-red-300 dark:bg-pink-700 rounded-sm w-fit px-1">
                      <FormattedMessage id="ccuPlanner.noStock" defaultMessage="No stock" />
                    </div>
                  }
                  <div className="text-xs text-gray-400 flex items-center gap-1">
                    {ship.manufacturer.name}
                  </div>
                  <div className="text-sm text-blue-400 font-bold flex items-center gap-2">
                    <span className={ccus.find(c => c.id === ship.id)?.skus.find(s => s.price < ship.msrp) || (wbHistory.find(h => h.name === ship.name && h.price !== '') && showHistoryWB) ? 'text-xs text-gray-400 line-through' : ''}>{(ship.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                    {
                      ccus.find(c => c.id === ship.id)?.skus.find(s => s.price < ship.msrp) ?
                        <span>{(Number(ccus.find(c => c.id === ship.id)?.skus.find(s => s.price < ship.msrp)?.price) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                        :
                        wbHistory.find(h => h.name === ship.name && h.price !== '') && showHistoryWB &&
                        <span>{(Number(wbHistory.find(h => h.name === ship.name && h.price !== '')?.price)).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                    }
                  </div>
                </div>
              </div>
              {isMobile && <Button variant="outlined" onClick={() => { handleMobileShipSelection(ship) }}>+</Button>}
            </div>
          ))}
        </div>
      }

    </div>
  );
} 
