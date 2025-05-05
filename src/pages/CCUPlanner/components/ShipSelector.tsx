import { useState, useEffect } from 'react';
import { Ccu, Ship } from '../../../types';
import { IconButton, Link } from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { clearUpgrades, RootState } from '../../../store';
import { ExpandLess, ExpandMore, Refresh } from '@mui/icons-material';
import ExtensionModal from './ExtensionModal';

interface ShipSelectorProps {
  ships: Ship[];
  ccus: Ccu[];
  onDragStart: (event: React.DragEvent<HTMLDivElement>, ship: Ship) => void;
}

export default function ShipSelector({ ships, ccus, onDragStart }: ShipSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredShips, setFilteredShips] = useState<Ship[]>(ships);
  const [hangarExpanded, setHangarExpanded] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);

  const upgrades = useSelector((state: RootState) => state.upgrades.items);
  const dispatch = useDispatch();

  // 当搜索词或舰船列表变化时过滤舰船，并将有WB的船排在前面
  useEffect(() => {
    let filtered = ships;

    if (searchTerm) {
      filtered = ships.filter(ship =>
        ship.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.manufacturer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // 排序：将有WB标记的船只排在前面
    filtered = [...filtered].sort((a, b) => {
      const aHasWB = ccus.find(c => c.id === a.id)?.skus.find(s => s.price < a.msrp) ? 1 : 0;
      const bHasWB = ccus.find(c => c.id === b.id)?.skus.find(s => s.price < b.msrp) ? 1 : 0;
      return bHasWB - aHasWB; // 有WB的排在前面
    });

    setFilteredShips(filtered);
  }, [searchTerm, ships, ccus]);

  // 处理刷新动画结束
  useEffect(() => {
    if (isRefreshing) {
      const timer = setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isRefreshing]);

  const handleExtensionLinkClick = () => {
    // 不阻止默认行为，允许实际下载
    setExtensionModalOpen(true);
  };

  return (
    <div className="h-[calc(100vh-113px)] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <h2 className="text-xl font-bold p-2">可用舰船</h2>

        <div className="mb-4 p-2">
          <input
            type="text"
            placeholder="搜索舰船..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-gray-700 rounded-md px-3 py-2 w-full"
          />
        </div>

        <div className="flex items-center justify-left pb-2 gap-2 px-2">
          我的机库
          <IconButton color="primary" size="small" onClick={() => setHangarExpanded(!hangarExpanded)}>
            {hangarExpanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
          <IconButton 
            color="primary" 
            size="small" 
            onClick={() => {
              setIsRefreshing(true);
              dispatch(clearUpgrades());

              window.postMessage({
                type: 'ccuPlannerAppIntegrationRequest',
                message: {
                  type: "connect",
                  requestId: 1
                }
              }, '*');

              window.postMessage({
                type: 'ccuPlannerAppIntegrationRequest',
                message: {
                  type: "httpRequest",
                  request: {
                    "url": "https://robertsspaceindustries.com/en/account/pledges?page=1&product-type=upgrade",
                    "responseType": "text",
                    "method": "get",
                    "data": null
                  },
                  requestId: 2
                }
              }, '*');
            }}
          >
            <Refresh className={isRefreshing ? 'animate-spin' : ''} />
          </IconButton>
        </div>
        {hangarExpanded && (
          upgrades.length > 0 ?
          upgrades.map(upgrade => {
            const from = upgrade.name.split("to")[0].split("-")[1].trim().toUpperCase()
            const to = (upgrade.name.split("to")[1]).trim().split(" ").slice(0, -2).join(" ").toUpperCase()

            const fromShip = ships.find(ship => ship.name.toUpperCase() === from)
            const toShip = ships.find(ship => ship.name.toUpperCase() === to)

            if (!fromShip || !toShip) {
              return <></>
            }

            return <div
              key={fromShip.id + toShip.id}
              className="flex flex-col w-full items-center justify-center pt-2 pb-1 gap-2 border-b border-gray-200 last:border-b-0"
            >
              <div className="text-xs text-gray-400">
                {upgrade.name}
              </div>

              <div
                draggable
                onDragStart={(event) => onDragStart(event, fromShip)}
                className="p-2 cursor-move transition-colors hover:bg-amber-100 w-full"
              >
                <div className="flex items-center text-left">
                  <img
                    src={fromShip.medias.productThumbMediumAndSmall}
                    alt={fromShip.name}
                    className="w-16 h-16 object-cover mr-2"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{fromShip.name}</h3>
                    </div>
                    <div className="text-xs text-gray-400">{fromShip.manufacturer.name}</div>
                    <div className="text-sm text-blue-400 font-bold flex items-center gap-2">
                      <span>{(fromShip.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-400 flex items-center justify-between w-full px-3">
                <span>↓ 升级到</span>
                <span className="flex items-center gap-1">
                  花费
                  <span className="text-blue-400 font-bold">{upgrade.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                  {((toShip.msrp - fromShip.msrp) / 100) !== upgrade.value &&
                    <span className="text-xs text-gray-400 line-through">{((toShip.msrp - fromShip.msrp) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                  }
                </span>
              </div>

              <div
                draggable
                onDragStart={(event) => onDragStart(event, toShip)}
                className="p-2 cursor-move transition-colors hover:bg-amber-100 w-full"
              >
                <div className="flex items-center text-left">
                  <img
                    src={toShip.medias.productThumbMediumAndSmall}
                    alt={toShip.name}
                    className="w-16 h-16 object-cover mr-2"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{toShip.name}</h3>
                    </div>
                    <div className="text-xs text-gray-400">{toShip.manufacturer.name}</div>
                    <div className="text-sm text-blue-400 font-bold flex items-center gap-2">
                      <span>{(toShip.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          })
          :
          <div className="text-center text-gray-400 mb-2">
            暂无数据 <Link href="/extension.zip" onClick={handleExtensionLinkClick}>下载浏览器扩展程序</Link>
          </div>
        )}
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
      
      {/* 扩展程序安装说明弹窗 */}
      <ExtensionModal 
        open={extensionModalOpen} 
        onClose={() => setExtensionModalOpen(false)} 
      />
    </div>
  );
} 