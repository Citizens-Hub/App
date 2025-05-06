import { useState, useEffect } from 'react';
import { Ccu, Ship } from '../../../types';
import { FormattedMessage, useIntl } from 'react-intl';

interface ShipSelectorProps {
  ships: Ship[];
  ccus: Ccu[];
  onDragStart: (event: React.DragEvent<HTMLDivElement>, ship: Ship) => void;
}

export default function ShipSelector({ ships, ccus, onDragStart }: ShipSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredShips, setFilteredShips] = useState<Ship[]>(ships);
  const intl = useIntl();

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
      return bHasWB - aHasWB;
    });

    setFilteredShips(filtered);
  }, [searchTerm, ships, ccus]);

  return (
    <div className="h-[calc(100vh-113px)] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
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
      </div>

      <div className="grid grid-cols-1">
        {filteredShips.map((ship) => (
          <div
            key={ship.id}
            draggable
            onDragStart={(event) => onDragStart(event, ship)}
            className="p-2 cursor-move transition-colors hover:bg-amber-100"
          >
            <div className="flex items-center text-left">
              <img
                src={ship.medias.productThumbMediumAndSmall}
                alt={ship.name}
                className="w-16 h-16 object-cover mr-2"
              />
              <div>
                <div className="flex items-center gap-2">
                  {
                    ccus.find(c => c.id === ship.id)?.skus.find(s => s.price < ship.msrp) && <div className="text-xs text-white bg-orange-400 rounded-sm px-1">WB</div>
                  }
                  <h3 className="font-medium">{ship.name}</h3>
                </div>
                <div className="text-xs text-gray-400">{ship.manufacturer.name}</div>
                <div className="text-sm text-blue-400 font-bold flex items-center gap-2">
                  <span className={ccus.find(c => c.id === ship.id)?.skus.find(s => s.price < ship.msrp) ? 'text-xs text-gray-400 line-through' : ''}>{(ship.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                  {
                    ccus.find(c => c.id === ship.id)?.skus.find(s => s.price < ship.msrp) &&
                    <span>{(Number(ccus.find(c => c.id === ship.id)?.skus.find(s => s.price < ship.msrp)?.price) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                  }
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 