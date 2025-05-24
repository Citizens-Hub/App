import { IconButton, TextField, InputAdornment, Button, Pagination, FormControlLabel, Switch, Tooltip } from "@mui/material";
import { Ccu, Ship } from "../../../types";
import { useState } from "react";
import { useSelector } from "react-redux";
import { selectHangarItems } from "../../../store/upgradesStore";
import { RootState } from "../../../store";
import { ExpandLess, ExpandMore, Search } from "@mui/icons-material";
import ExtensionModal from "./ExtensionModal";
import { FormattedMessage, useIntl } from "react-intl";
import Crawler from "../../../components/Crawler";
import { Gift } from "lucide-react";
import { selectImportItems } from "../../../store/importStore";

interface ShipSelectorProps {
  ships: Ship[];
  ccus: Ccu[];
  onDragStart: (event: React.DragEvent<HTMLDivElement>, ship: Ship) => void;
}

export default function Hangar({ ships, onDragStart }: ShipSelectorProps) {
  const [hangarExpanded, setHangarExpanded] = useState(true);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Add filter option states
  const [showNormalCCU, setShowNormalCCU] = useState(true);
  const [showBuybackCCU, setShowBuybackCCU] = useState(true);
  const [showSubscriptionCCU, setShowSubscriptionCCU] = useState(true);

  const intl = useIntl();
  const upgrades = useSelector(selectHangarItems);
  const importItems = useSelector(selectImportItems);
  const users = useSelector((state: RootState) => state.upgrades.users);

  const handleExtensionLinkClick = () => {
    setExtensionModalOpen(true);
  };


  // Merge local upgrades and imported upgrade data
  const allUpgrades = [
    ...upgrades.ccus,
    ...importItems
      // .filter(item => item.selected)
      .map(item => {
        const from = ships.find(ship => ship.id === item.from)
        const to = ships.find(ship => ship.id === item.to)

        return {
          name: item.name,
          parsed: {
            from: from?.name || "",
            to: to?.name || ""
          },
          value: item.price,
          belongsTo: item.owners[0]?.toString() || "import",
          canGift: false,
          isBuyBack: false,
          isSubscription: true
        }
      })
  ];

  const filteredUpgrades = allUpgrades.filter(upgrade => {
    const from = upgrade.parsed.from.toLowerCase();
    const to = upgrade.parsed.to.toLowerCase();
    const query = searchQuery.toLowerCase();

    // Apply text search filtering
    const matchesSearch = from.includes(query) || to.includes(query) || upgrade.name.toLowerCase().includes(query);

    // Apply type filtering
    const isNormal = !upgrade.isBuyBack && !upgrade.isSubscription;
    const isBuyback = upgrade.isBuyBack;
    const isSubscription = upgrade.isSubscription;

    // Only show selected types
    const matchesType =
      (isNormal && showNormalCCU) ||
      (isBuyback && showBuybackCCU) ||
      (isSubscription && showSubscriptionCCU);

    return matchesSearch && matchesType;
  });

  // Calculate total pages
  const totalPages = Math.ceil(filteredUpgrades.length / itemsPerPage);

  // Get current page data and sort by upgrade to ship value from low to high
  const currentItems = filteredUpgrades
    .sort((a, b) => {
      // First sort by whether it's a buyback
      if (a.isBuyBack !== b.isBuyBack) {
        return a.isBuyBack ? 1 : -1;
      }

      // Then sort by upgrade to ship value from low to high
      const toShipA = ships.find(ship => ship.name.toUpperCase().trim() === a.parsed.to.toUpperCase().trim());
      const toShipB = ships.find(ship => ship.name.toUpperCase().trim() === b.parsed.to.toUpperCase().trim());

      if (toShipA && toShipB) {
        return toShipA.msrp - toShipB.msrp;
      }

      return 0;
    })
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Handle page change
  const handlePageChange = (_event: React.ChangeEvent<unknown>, page: number) => {
    setCurrentPage(page);
  };

  // Reset page number to first page when filter conditions change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  // Handle filter option changes
  const handleFilterChange = (
    setter: React.Dispatch<React.SetStateAction<boolean>>,
    checked: boolean
  ) => {
    setter(checked);
    setCurrentPage(1);
  };

  return (
    <>
      <div className="flex items-center justify-left gap-2 px-1">
        <FormattedMessage id="ccuPlanner.myHangar" defaultMessage="My Hangar" />
        <IconButton color="primary" size="small" onClick={() => setHangarExpanded(!hangarExpanded)}>
          {hangarExpanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
        <Crawler ships={ships} />
      </div>

      {hangarExpanded && (
        <>
          <div className="my-2 px-1">
            <TextField
              size="small"
              fullWidth
              placeholder={intl.formatMessage({ id: 'ccuPlanner.searchHangar', defaultMessage: 'Search Hangar' })}
              value={searchQuery}
              onChange={handleSearchChange}
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

          <div className="flex items-start justify-start gap-1 px-3 mb-2">
            <Tooltip title={intl.formatMessage({ id: 'ccuPlanner.normalCCU', defaultMessage: 'Hangar' })}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showNormalCCU}
                    onChange={(e) => handleFilterChange(setShowNormalCCU, e.target.checked)}
                  />
                }
                label={<span className="text-xs"><FormattedMessage id="ccuPlanner.normalCCU" defaultMessage="Hangar" /></span>}
              />
            </Tooltip>
            <Tooltip title={intl.formatMessage({ id: 'ccuPlanner.buybackCCU', defaultMessage: 'Buyback' })}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showBuybackCCU}
                    onChange={(e) => handleFilterChange(setShowBuybackCCU, e.target.checked)}
                  />
                }
                label={<span className="text-xs"><FormattedMessage id="ccuPlanner.buybackCCU" defaultMessage="Buyback" /></span>}
              />
            </Tooltip>
            <Tooltip title={intl.formatMessage({ id: 'ccuPlanner.subscriptionCCU', defaultMessage: 'Subscription' })}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showSubscriptionCCU}
                    onChange={(e) => handleFilterChange(setShowSubscriptionCCU, e.target.checked)}
                  />
                }
                label={<span className="text-xs"><FormattedMessage id="ccuPlanner.subscriptionCCU" defaultMessage="Subscription" /></span>}
              />
            </Tooltip>
          </div>
        </>
      )}

      <div className="max-h-[calc(100vh-285px)] overflow-y-auto">
        {hangarExpanded && (
          currentItems.length > 0 ?
            currentItems.map(upgrade => {
              const from = upgrade.parsed.from
              const to = upgrade.parsed.to

              const fromShip = ships.find(ship => ship.name.toUpperCase().trim() === from.toUpperCase().trim())
              const toShip = ships.find(ship => ship.name.toUpperCase().trim() === to.toUpperCase().trim())

              if (!fromShip || !toShip) {
                console.warn("ship not found", upgrade)
                return <div key={upgrade.name}></div>
              }

              return <div
                key={fromShip.id + "-" + toShip.id + "-" + upgrade.belongsTo + "-" + upgrade.value + "-" + (upgrade.canGift ? "giftable" : "") + "-" + (upgrade.isBuyBack ? "buyback" : "") + "-" + (upgrade.isSubscription ? "subscription" : "")}
                className={`flex flex-col w-full items-center justify-center pt-2 pb-1 gap-2 border-b border-gray-200 dark:border-gray-800 last:border-b-0 ${upgrade.isBuyBack ? "bg-gray-100 dark:bg-gray-900" : upgrade.isSubscription ? "bg-gray-100 dark:bg-gray-800" : ""}`}
              >
                <div className="text-xs text-gray-400 text-left px-2 w-full">
                  {upgrade.isBuyBack && <FormattedMessage id="ccuPlanner.buyback" defaultMessage="Buyback" />}
                  {upgrade.isSubscription &&
                    <span className="text-xs text-gray-400">
                      <FormattedMessage id="ccuPlanner.subscription" defaultMessage="Subscription" />
                    </span>
                  }
                  {!upgrade.isSubscription && !upgrade.isBuyBack &&
                    <span className="text-xs text-gray-400">
                      <FormattedMessage id="ccuPlanner.hangar" defaultMessage="Hangar" />
                    </span>
                  }:&nbsp;
                  <span className="text-xs text-gray-400">
                    {upgrade.name}
                  </span>
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
                    {upgrade.isSubscription ?
                      <span className="text-xs text-gray-400">
                        <FormattedMessage id="ccuPlanner.subscription" defaultMessage="Subscription" />
                      </span> :
                      <span className="text-xs text-gray-400">
                        {users.find(user => user.id === upgrade.belongsTo)?.nickname}
                      </span>
                    }
                  </span>
                  <span>↓ <FormattedMessage id="ccuPlanner.upgradeTo" defaultMessage="upgrade to" /></span>
                  <span className="flex items-center gap-1">
                    <FormattedMessage id="ccuPlanner.cost" defaultMessage="花费" />
                    <span className="text-blue-400 font-bold">{upgrade.value.toLocaleString('en-US', { style: 'currency', currency: upgrade.isSubscription ? importItems[0].currency : "USD" })}</span>
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
                  <Button onClick={handleExtensionLinkClick}>{intl.formatMessage({ id: 'ccuPlanner.downloadBrowserExtension', defaultMessage: '下载浏览器扩展程序' })}</Button>
                </>
              )}
            </div>
        )}
      </div>

      {hangarExpanded && filteredUpgrades.length > 0 && (
        <div className="flex justify-center mt-4 mb-2">
          <Pagination
            count={totalPages}
            page={currentPage}
            onChange={handlePageChange}
            color="primary"
            size="small"
            showFirstButton
            showLastButton
          />
        </div>
      )}

      <ExtensionModal
        open={extensionModalOpen}
        onClose={() => setExtensionModalOpen(false)}
      />
    </>
  )
}