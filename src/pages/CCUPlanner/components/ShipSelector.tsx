import { useState, useEffect } from 'react';
import { Ship } from '../../../types';

interface ShipSelectorProps {
  ships: Ship[];
  onDragStart: (event: React.DragEvent<HTMLDivElement>, ship: Ship) => void;
}

export default function ShipSelector({ ships, onDragStart }: ShipSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredShips, setFilteredShips] = useState<Ship[]>(ships);
  
  // 当搜索词或船舶列表变化时过滤船舶
  useEffect(() => {
    if (!searchTerm) {
      setFilteredShips(ships);
      return;
    }
    
    const filtered = ships.filter(ship => 
      ship.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ship.manufacturer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ship.type.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    setFilteredShips(filtered);
  }, [searchTerm, ships]);
  
  return (
    <div className="h-[calc(100vh-113px)] overflow-y-auto hide-scrollbar">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <h2 className="text-xl font-bold p-2">可用船舶</h2>
        
        <div className="mb-4 p-2">
          <input
            type="text"
            placeholder="搜索船舶..."
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
                <h3 className="font-medium">{ship.name}</h3>
                <div className="text-xs text-gray-400">{ship.manufacturer.name}</div>
                <div className="text-sm text-blue-400 font-bold">{(ship.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 