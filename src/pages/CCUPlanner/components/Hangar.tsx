import { IconButton, Link, TextField, InputAdornment } from "@mui/material";
import { Ccu, Ship } from "../../../types";
import { useState } from "react";
import { useSelector } from "react-redux";
import { RootState, selectHangarItems } from "../../../store";
import { ExpandLess, ExpandMore, Search } from "@mui/icons-material";
import ExtensionModal from "./ExtensionModal";
import { FormattedMessage, useIntl } from "react-intl";
import Crawler from "../../../components/Crawler";
import { Gift } from "lucide-react";

interface ShipSelectorProps {
  ships: Ship[];
  ccus: Ccu[];
  onDragStart: (event: React.DragEvent<HTMLDivElement>, ship: Ship) => void;
}

export default function Hangar({ ships, onDragStart }: ShipSelectorProps) {
  const [hangarExpanded, setHangarExpanded] = useState(true);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const intl = useIntl();
  const upgrades = useSelector(selectHangarItems);
  const users = useSelector((state: RootState) => state.upgrades.users);

  const handleExtensionLinkClick = () => {
    setExtensionModalOpen(true);
  };

  const filteredUpgrades = upgrades.filter(upgrade => {
    const from = upgrade.parsed.from.toLowerCase();
    const to = upgrade.parsed.to.toLowerCase();
    const query = searchQuery.toLowerCase();

    // if (selectedUser !== -1) {
    //   if (upgrade.belongsTo !== selectedUser && !upgrade.canGift) {
    //     return false;
    //   }
    // }

    return from.includes(query) || to.includes(query) || upgrade.name.toLowerCase().includes(query);
  });

  return (
    <>
      <div className="flex items-center justify-left gap-2 px-1">
        <FormattedMessage id="ccuPlanner.myHangar" defaultMessage="My Hangar" />
        <IconButton color="primary" size="small" onClick={() => setHangarExpanded(!hangarExpanded)}>
          {hangarExpanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
        <Crawler />
      </div>

      {hangarExpanded && (
        <div className="my-2 px-1">
          <TextField
            size="small"
            fullWidth
            placeholder={intl.formatMessage({ id: 'ccuPlanner.searchHangar', defaultMessage: 'Search Hangar' })}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
      )}

      <div className="max-h-[calc(100vh-500px)] overflow-y-auto">
        {hangarExpanded && (
          filteredUpgrades.length > 0 ?
            filteredUpgrades.map(upgrade => {
              const from = upgrade.parsed.from
              const to = upgrade.parsed.to

              const fromShip = ships.find(ship => ship.name.toUpperCase().trim() === from.toUpperCase().trim())
              const toShip = ships.find(ship => ship.name.toUpperCase().trim() === to.toUpperCase().trim())

              if (!fromShip || !toShip) {
                return <div key={upgrade.name}></div>
              }

              return <div
                key={fromShip.id + toShip.id + upgrade.belongsTo + (upgrade.canGift ? "giftable" : "") + (upgrade.isBuyBack ? "buyback" : "")}
                className="flex flex-col w-full items-center justify-center pt-2 pb-1 gap-2 border-b border-gray-200 dark:border-gray-800 last:border-b-0"
              >
                <div className="text-xs text-gray-400">
                  {upgrade.name}
                </div>

                <div
                  draggable
                  onDragStart={(event) => onDragStart(event, fromShip)}
                  className="p-2 cursor-move transition-colors hover:bg-amber-100 dark:hover:bg-gray-900 w-full"
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
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    {upgrade.canGift &&
                      <span className="text-xs text-gray-400">
                        <Gift className="w-4 h-4" />
                      </span>
                    }
                    {users.find(user => user.id === upgrade.belongsTo)?.nickname}
                  </span>
                  <span>↓ <FormattedMessage id="ccuPlanner.upgradeTo" defaultMessage="upgrade to" /></span>
                  <span className="flex items-center gap-1">
                    <FormattedMessage id="ccuPlanner.cost" defaultMessage="花费" />
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
            <div className="text-center text-gray-400 mb-2 flex flex-col items-center justify-center gap-2">
              {searchQuery ? (
                <FormattedMessage id="ccuPlanner.noSearchResults" defaultMessage="没有找到匹配的结果" />
              ) : (
                <>
                  <FormattedMessage id="ccuPlanner.noData" defaultMessage="暂无数据" />
                  <Link href="/extension.zip" onClick={handleExtensionLinkClick}>{intl.formatMessage({ id: 'ccuPlanner.downloadBrowserExtension', defaultMessage: '下载浏览器扩展程序' })}</Link>
                </>
              )}
            </div>
        )}
      </div>
      <ExtensionModal
        open={extensionModalOpen}
        onClose={() => setExtensionModalOpen(false)}
      />
    </>
  )
}