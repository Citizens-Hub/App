import { memo, useMemo, useState } from "react";
import { IconButton, TextField, InputAdornment, Button, Pagination, FormControlLabel, Switch, Tooltip } from "@mui/material";
import { Ccu, CcuSourceType, Ship } from "@/types";
import { useSelector } from "react-redux";
import { selectUsersHangarItems } from "@/store/upgradesStore";
import { RootState } from "@/store";
import { ExpandLess, ExpandMore, Search } from "@mui/icons-material";
import ExtensionModal from "./ExtensionModal";
import { FormattedMessage, useIntl } from "react-intl";
import Crawler from "@/components/Crawler";
import { Boxes, Gift, PackageOpen } from "lucide-react";
import { selectImportItems } from "@/store/importStore";
import { findShipByIdOrName, getShipDisplayName, matchesShipNameQuery, normalizeShipNameMatch } from "@/utils/shipDisplay";
import { getShipThumbSmall } from "@/utils/shipImage";
import { readStoredCompletedPathsForActiveTab } from "../services/completedPathsStorage";

function preventImageNativeDrag(event: React.DragEvent<HTMLImageElement>) {
  event.preventDefault();
}

interface ShipSelectorProps {
  ships: Ship[];
  ccus: Ccu[];
  onDragStart: (event: React.DragEvent<HTMLDivElement>, ship: Ship) => void;
  activeTabId?: string | null;
  completedPathsRevision?: number;
}

interface HangarUpgradeItem {
  name: string;
  parsed: {
    from: string;
    to: string;
  };
  value: number;
  belongsTo: string;
  canGift: boolean;
  isBuyBack: boolean;
  isSubscription: boolean;
  quantity: number;
}

interface HangarDisplayUpgradeItem extends HangarUpgradeItem {
  fromShip: Ship;
  toShip: Ship;
  remainingQuantity: number;
}

interface HangarStartShipItem {
  key: string;
  ship: Ship;
  quantity: number;
  sourceLabels: string[];
  insuranceLabels: string[];
}

function getCcuPairKey(fromShipId: number, toShipId: number, sourceType = CcuSourceType.HANGER) {
  return `${sourceType}:${fromShipId}->${toShipId}`;
}

function Hangar({ ships, onDragStart, activeTabId, completedPathsRevision = 0 }: ShipSelectorProps) {
  const [hangarExpanded, setHangarExpanded] = useState(true);
  const [startShipsExpanded, setStartShipsExpanded] = useState(false);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [startShipsPage, setStartShipsPage] = useState(1);
  const itemsPerPage = 10;
  const startShipsPerPage = 5;

  // Add filter option states
  const [showNormalCCU, setShowNormalCCU] = useState(true);
  const [showBuybackCCU, setShowBuybackCCU] = useState(true);
  const [showSubscriptionCCU, setShowSubscriptionCCU] = useState(true);

  const intl = useIntl();
  const upgrades = useSelector(selectUsersHangarItems);
  const importItems = useSelector(selectImportItems);
  const users = useSelector((state: RootState) => state.upgrades.users);
  const completedPathsStorageRevisionKey = `${activeTabId || ''}:${completedPathsRevision}`;

  const handleExtensionLinkClick = () => {
    setExtensionModalOpen(true);
  };

  const findShipByName = (name: string) => findShipByIdOrName(ships, name);

  // Merge local upgrades and imported upgrade data
  const rawUpgrades = [
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
          isSubscription: true,
          quantity: 1
        }
      })
  ];

  const allUpgrades: HangarUpgradeItem[] = rawUpgrades.map(upgrade => ({
    ...upgrade,
    quantity: upgrade.quantity || 1,
    belongsTo: upgrade.belongsTo?.toString() || "import",
    isSubscription: Boolean(upgrade.isSubscription),
  }));

  const ccuUsageMap = useMemo(() => {
    void completedPathsStorageRevisionKey;
    const usage = new Map<string, number>();
    const completedPaths = readStoredCompletedPathsForActiveTab();

    completedPaths.forEach(path => {
      path.path.edges?.forEach(edge => {
        if (
          edge.sourceType !== CcuSourceType.HANGER ||
          !edge.sourceShipId ||
          !edge.targetShipId
        ) {
          return;
        }

        const key = getCcuPairKey(edge.sourceShipId, edge.targetShipId, edge.sourceType);
        usage.set(key, (usage.get(key) || 0) + 1);
      });
    });

    return usage;
  }, [completedPathsStorageRevisionKey]);

  const startShips = useMemo<HangarStartShipItem[]>(() => {
    const grouped = new Map<number, HangarStartShipItem>();

    const ensureEntry = (ship: Ship): HangarStartShipItem => {
      const existing = grouped.get(ship.id);
      if (existing) {
        return existing;
      }

      const entry: HangarStartShipItem = {
        key: `start-ship-${ship.id}`,
        ship,
        quantity: 0,
        sourceLabels: [],
        insuranceLabels: [],
      };
      grouped.set(ship.id, entry);
      return entry;
    };

    const addSource = (entry: HangarStartShipItem, quantity: number, sourceLabel?: string, insuranceLabel?: string) => {
      entry.quantity += quantity;

      if (sourceLabel?.trim() && !entry.sourceLabels.includes(sourceLabel.trim())) {
        entry.sourceLabels.push(sourceLabel.trim());
      }

      if (insuranceLabel?.trim() && !entry.insuranceLabels.includes(insuranceLabel.trim())) {
        entry.insuranceLabels.push(insuranceLabel.trim());
      }
    };

    upgrades.ships
      .filter(ship => !ship.isBuyBack)
      .forEach(hangarShip => {
        const ship = findShipByIdOrName(ships, { id: hangarShip.id, name: hangarShip.name });
        if (!ship) {
          return;
        }

        const entry = ensureEntry(ship);
        addSource(
          entry,
          hangarShip.quantity || 1,
          intl.formatMessage({ id: "ccuPlanner.standaloneShip", defaultMessage: "Standalone" }),
          hangarShip.insurance,
        );
      });

    upgrades.bundles
      .filter(bundle => !bundle.isBuyBack)
      .forEach(bundle => {
        const bundleQuantity = bundle.quantity || 1;

        (bundle.ships || []).forEach(bundleShip => {
          const ship = findShipByIdOrName(ships, { id: bundleShip.id, name: bundleShip.name });
          if (!ship) {
            return;
          }

          const entry = ensureEntry(ship);
          addSource(
            entry,
            (bundleShip.quantity || 1) * bundleQuantity,
            bundle.name,
            bundleShip.insurance || bundle.insurance,
          );
        });
      });

    const query = searchQuery.trim().toLowerCase();

    return Array.from(grouped.values())
      .filter(item => {
        if (!query) {
          return true;
        }

        return (
          matchesShipNameQuery(item.ship, query) ||
          item.ship.manufacturer.name.toLowerCase().includes(query) ||
          item.sourceLabels.some(label => label.toLowerCase().includes(query)) ||
          item.insuranceLabels.some(label => label.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => {
        if (a.ship.msrp !== b.ship.msrp) {
          return a.ship.msrp - b.ship.msrp;
        }
        return getShipDisplayName(a.ship).localeCompare(getShipDisplayName(b.ship));
      });
  }, [intl, searchQuery, ships, upgrades.bundles, upgrades.ships]);

  const startShipsTotalPages = Math.ceil(startShips.length / startShipsPerPage);
  const visibleStartShips = startShips.slice(
    (startShipsPage - 1) * startShipsPerPage,
    startShipsPage * startShipsPerPage,
  );

  const filteredUpgrades = allUpgrades.filter(upgrade => {
    const query = searchQuery.toLowerCase();
    const fromShip = findShipByName(upgrade.parsed.from);
    const toShip = findShipByName(upgrade.parsed.to);

    // Apply text search filtering
    const matchesSearch =
      upgrade.parsed.from.toLowerCase().includes(query)
      || upgrade.parsed.to.toLowerCase().includes(query)
      || upgrade.name.toLowerCase().includes(query)
      || matchesShipNameQuery(fromShip, query)
      || matchesShipNameQuery(toShip, query);

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

  // Sort by upgrade-to ship value from low to high, then assign completed-route usage.
  const sortedUpgrades = filteredUpgrades
    .sort((a, b) => {
      // First sort by whether it's a buyback
      if (a.isBuyBack !== b.isBuyBack) {
        return a.isBuyBack ? 1 : -1;
      }

      // Then sort by upgrade to ship value from low to high
      const toShipA = findShipByName(a.parsed.to);
      const toShipB = findShipByName(b.parsed.to);

      if (toShipA && toShipB) {
        return toShipA.msrp - toShipB.msrp;
      }

      return 0;
    });

  const remainingUsageByCcu = new Map(ccuUsageMap);
  const displayUpgrades = sortedUpgrades.reduce<HangarDisplayUpgradeItem[]>((items, upgrade) => {
    const fromShip = findShipByName(upgrade.parsed.from);
    const toShip = findShipByName(upgrade.parsed.to);

    if (!fromShip || !toShip) {
      console.warn("ship not found", upgrade);
      return items;
    }

    const totalQuantity = upgrade.quantity || 1;
    const usageKey = getCcuPairKey(fromShip.id, toShip.id, CcuSourceType.HANGER);
    const availableUsage = upgrade.isSubscription || upgrade.isBuyBack ? 0 : remainingUsageByCcu.get(usageKey) || 0;
    const usedQuantity = Math.min(totalQuantity, availableUsage);

    if (!upgrade.isSubscription && !upgrade.isBuyBack && usedQuantity > 0) {
      remainingUsageByCcu.set(usageKey, availableUsage - usedQuantity);
    }

    items.push({
      ...upgrade,
      fromShip,
      toShip,
      remainingQuantity: upgrade.isSubscription || upgrade.isBuyBack
        ? totalQuantity
        : Math.max(totalQuantity - usedQuantity, 0),
    });

    return items;
  }, []);

  // Calculate total pages
  const totalPages = Math.ceil(displayUpgrades.length / itemsPerPage);

  // Get current page data.
  const currentItems = displayUpgrades
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Handle page change
  const handlePageChange = (_event: React.ChangeEvent<unknown>, page: number) => {
    setCurrentPage(page);
  };

  const handleStartShipsPageChange = (_event: React.ChangeEvent<unknown>, page: number) => {
    setStartShipsPage(page);
  };

  // Reset page number to first page when filter conditions change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
    setStartShipsPage(1);
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
    <div className={`${hangarExpanded ? "h-[calc(100vh-115px)] max-h-[calc(100vh-155px)]" : "h-auto max-h-none"} flex flex-col min-h-0 overflow-hidden`}>
      <div className="shrink-0 flex items-center justify-left gap-2 px-1">
        <FormattedMessage id="ccuPlanner.myHangar" defaultMessage="Hangar" />
        <IconButton color="primary" size="small" onClick={() => setHangarExpanded(!hangarExpanded)} aria-label={hangarExpanded ? intl.formatMessage({ id: 'ccuPlanner.collapseHangar', defaultMessage: 'Collapse Hangar' }) : intl.formatMessage({ id: 'ccuPlanner.expandHangar', defaultMessage: 'Expand Hangar' })}>
          {hangarExpanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
        <Crawler ships={ships} />
      </div>

      {hangarExpanded && (
        <div className="shrink-0">
          <div className="flex items-center justify-left gap-2 px-1">
            <Button onClick={() => setExtensionModalOpen(true)}>
              <FormattedMessage id="ccuPlanner.downloadBrowserExtension" defaultMessage="Download Extension" />
            </Button>
          </div>

          <div className="px-2 pb-2 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
              <PackageOpen className="w-4 h-4" />
              <FormattedMessage id="ccuPlanner.availableStartShips" defaultMessage="Available Start Ships" />
              <span className="ml-auto text-gray-400">{startShips.length}</span>
              <IconButton
                color="primary"
                size="small"
                onClick={() => setStartShipsExpanded(!startShipsExpanded)}
                aria-label={startShipsExpanded
                  ? intl.formatMessage({ id: 'ccuPlanner.collapseStartShips', defaultMessage: 'Collapse start ships' })
                  : intl.formatMessage({ id: 'ccuPlanner.expandStartShips', defaultMessage: 'Expand start ships' })}
              >
                {startShipsExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </IconButton>
            </div>

            {startShipsExpanded && (visibleStartShips.length > 0 ? (
              <div className="flex flex-col gap-1">
                {visibleStartShips.map(item => (
                  <div
                    key={item.key}
                    draggable
                    onDragStart={(event) => onDragStart(event, item.ship)}
                    className="flex items-center gap-2 p-1.5 cursor-move transition-colors hover:bg-amber-100 dark:hover:bg-gray-900"
                  >
                    <img
                      src={getShipThumbSmall(item.ship)}
                      alt={getShipDisplayName(item.ship) || item.ship.name}
                      draggable={false}
                      onDragStart={preventImageNativeDrag}
                      className="w-10 h-10 object-cover pointer-events-none select-none"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{getShipDisplayName(item.ship)}</span>
                        <span className="shrink-0 text-xs font-bold text-blue-400">x{item.quantity}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {[
                          item.ship.manufacturer.name,
                          ...item.insuranceLabels.slice(0, 2),
                          ...item.sourceLabels.slice(0, 1),
                        ].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                ))}
                {startShipsTotalPages > 1 && (
                  <div className="flex justify-center pt-1">
                    <Pagination
                      count={startShipsTotalPages}
                      page={Math.min(startShipsPage, startShipsTotalPages)}
                      onChange={handleStartShipsPageChange}
                      color="primary"
                      size="small"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-400 px-1.5">
                <FormattedMessage id="ccuPlanner.noStartShips" defaultMessage="No available start ships" />
              </div>
            ))}
          </div>

          <div className="my-2 px-1">
            <TextField
              size="small"
              fullWidth
              placeholder={intl.formatMessage({ id: 'ccuPlanner.searchHangar', defaultMessage: 'Search Hangar' })}
              value={searchQuery}
              onChange={handleSearchChange}
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
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {hangarExpanded && (
          currentItems.length > 0 ?
            currentItems.map(upgrade => {
              const fromShip = upgrade.fromShip;
              const toShip = upgrade.toShip;
              const totalQuantity = upgrade.quantity || 1;
              const remainingQuantity = upgrade.remainingQuantity;
              const sourceLabel = upgrade.isBuyBack
                ? intl.formatMessage({ id: "ccuPlanner.buyback", defaultMessage: "Buyback" })
                : upgrade.isSubscription
                  ? intl.formatMessage({ id: "ccuPlanner.subscription", defaultMessage: "Subscription" })
                  : intl.formatMessage({ id: "ccuPlanner.hangar", defaultMessage: "Hangar" });

              return <div
                key={fromShip.id + "-" + toShip.id + "-" + upgrade.belongsTo + "-" + upgrade.value + "-" + (upgrade.canGift ? "giftable" : "") + "-" + (upgrade.isBuyBack ? "buyback" : "") + "-" + (upgrade.isSubscription ? "subscription" : "") + "-" + normalizeShipNameMatch(upgrade.name)}
                className={`flex flex-col w-full items-center justify-center pt-2 pb-1 gap-2 border-b border-gray-200 dark:border-gray-800 last:border-b-0 ${upgrade.isBuyBack ? "bg-gray-100 dark:bg-gray-900" : upgrade.isSubscription ? "bg-gray-100 dark:bg-gray-800" : ""}`}
              >
                <div className="text-xs text-gray-400 text-left px-2 w-full flex items-start gap-2">
                  <span className="shrink-0">{sourceLabel}:&nbsp;</span>
                  <span className="min-w-0 flex-1 truncate">{upgrade.name}</span>
                  <span className="shrink-0 inline-flex items-center gap-1 text-gray-500 dark:text-gray-300">
                    <Boxes className="w-3.5 h-3.5" />
                    <FormattedMessage
                      id="ccuPlanner.ccuQuantityShort"
                      defaultMessage="{remaining}/{total}"
                      values={{ remaining: remainingQuantity, total: totalQuantity }}
                    />
                  </span>
                </div>

                <div
                  draggable
                  onDragStart={(event) => onDragStart(event, fromShip)}
                  className="p-2 cursor-move transition-colors hover:bg-amber-100 dark:hover:bg-gray-900 w-full"
                >
                  <div className="flex items-center text-left">
                    <img
                      src={getShipThumbSmall(fromShip)}
                      alt={getShipDisplayName(fromShip) || fromShip.name}
                      draggable={false}
                      onDragStart={preventImageNativeDrag}
                      className="w-16 h-16 object-cover mr-2 pointer-events-none select-none"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{getShipDisplayName(fromShip)}</h3>
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
                        {users.find(user => user.id.toString() === upgrade.belongsTo)?.nickname}
                      </span>
                    }
                  </span>
                  <span>
                    <span>↓ </span>
                    <span><FormattedMessage id="ccuPlanner.upgradeTo" defaultMessage="upgrade to" /></span>
                  </span>
                  <span className="flex items-center gap-1">
                    <FormattedMessage id="ccuPlanner.cost" defaultMessage="花费" />
                    <span className="text-blue-400 font-bold">{upgrade.value.toLocaleString('en-US', { style: 'currency', currency: upgrade.isSubscription ? importItems[0]?.currency || "USD" : "USD" })}</span>
                    {((toShip.msrp - fromShip.msrp) / 100) !== upgrade.value &&
                      <span className="text-xs text-gray-400 line-through">{((toShip.msrp - fromShip.msrp) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                    }
                  </span>
                </div>

                <div
                  draggable
                  onDragStart={(event) => onDragStart(event, toShip)}
                  className="p-2 cursor-move transition-colors hover:bg-amber-100 dark:hover:bg-gray-900 w-full"
                >
                  <div className="flex items-center text-left">
                    <img
                      src={getShipThumbSmall(toShip)}
                      alt={getShipDisplayName(toShip) || toShip.name}
                      draggable={false}
                      onDragStart={preventImageNativeDrag}
                      className="w-16 h-16 object-cover mr-2 pointer-events-none select-none"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{getShipDisplayName(toShip)}</h3>
                      </div>
                      <div className="text-xs text-gray-400">{toShip.manufacturer.name}</div>
                      <div className="text-sm text-blue-400 font-bold flex items-center gap-2">
                        <span>{(toShip.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full px-3 text-[11px] text-gray-400 flex items-center justify-between">
                  <span>
                    <FormattedMessage
                      id="ccuPlanner.ccuQuantity"
                      defaultMessage="Quantity: {count}"
                      values={{ count: totalQuantity }}
                    />
                  </span>
                  <span className={remainingQuantity > 0 ? "text-emerald-500" : "text-red-500"}>
                    <FormattedMessage
                      id="ccuPlanner.ccuRemaining"
                      defaultMessage="Remaining: {count}"
                      values={{ count: remainingQuantity }}
                    />
                  </span>
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
        <div className="shrink-0 flex justify-center mt-2 mb-1">
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
    </div>
  )
}

export default memo(Hangar);
