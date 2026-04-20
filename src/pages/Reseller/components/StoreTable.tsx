import { useCallback, useEffect, useMemo, useState } from "react";
import { FormattedMessage, IntlShape, useIntl } from "react-intl";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { selectUsersHangarItems } from "@/store/upgradesStore";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  InputAdornment,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { ChevronsRight, PlusCircle, Search } from "lucide-react";
import Crawler from "@/components/Crawler";
import UserSelector from "@/components/UserSelector";
import { getMarketItemVisual, MARKET_ITEM_PLACEHOLDER } from "@/components/marketItemDisplay";
import {
  ListingItem,
  MarketItemType,
  MarketPackageKind,
  Ship,
} from "@/types";
import {
  buildInventoryItems,
  getInventorySearchText,
  getListingDisplayType,
  getListingSearchText,
  StoreInventoryItem,
  StoreListingDisplayType,
} from "./storeListingUtils";

const DEFAULT_MANUAL_ITEM_TYPE: MarketItemType = "ccu";
const DEFAULT_PACKAGE_KIND: MarketPackageKind = "standalone_ship";

function normalizeShipName(name?: string) {
  return (name || "").trim().toUpperCase();
}

function getDisplayTypeLabel(type: StoreListingDisplayType, intl: IntlShape) {
  if (type === "ccu") {
    return "CCU";
  }

  if (type === "standalone_ship") {
    return intl.formatMessage({ id: "market.filter.standaloneShip", defaultMessage: "Standalone Ship" });
  }

  if (type === "bundle") {
    return intl.formatMessage({ id: "market.filter.bundle", defaultMessage: "Bundle" });
  }

  if (type === "credit") {
    return intl.formatMessage({ id: "market.filter.credit", defaultMessage: "Credit" });
  }

  return intl.formatMessage({ id: "market.filter.misc", defaultMessage: "Misc" });
}

function getSourceKindLabel(sourceKind: string | null | undefined, intl: IntlShape) {
  if (sourceKind === "hangar") {
    return intl.formatMessage({ id: "hangar.prefilledFromHangar", defaultMessage: "Prefilled from hangar" });
  }

  if (sourceKind === "manual") {
    return intl.formatMessage({ id: "market.sourceKind.manual", defaultMessage: "Manual" });
  }

  return sourceKind || "";
}

function getInventoryOptionLabel(item: StoreInventoryItem, intl: IntlShape) {
  if (item.itemType === "ccu") {
    return `${item.name} | ${item.fromShipName || "-"} -> ${item.toShipName || "-"}`;
  }

  const subtitle = item.packageKind === "bundle"
    ? intl.formatMessage(
        { id: "market.detail.shipCount", defaultMessage: "{count, plural, one {# ship} other {# ships}}" },
        { count: item.packageShips?.length || 0 },
      )
    : (item.shipName || item.packageShips?.[0]?.shipName || "");

  return subtitle ? `${item.name} | ${subtitle}` : item.name;
}

function getInventoryOptionMeta(item: StoreInventoryItem) {
  const ownerText = item.ownerLabels.join(", ");
  return `x${item.stock}${ownerText ? ` | ${ownerText}` : ""}`;
}

export default function StoreTable({ ships }: { ships: Ship[] }) {
  const intl = useIntl();
  const { token, id } = useSelector((state: RootState) => state.user.user);
  const { users } = useSelector((state: RootState) => state.upgrades);
  const items = useSelector(selectUsersHangarItems);
  const allItemPrices = useSelector((state: RootState) => state.share?.allItemPrices || {});

  const [listingItems, setListingItems] = useState<ListingItem[]>([]);
  const [listingFetchError, setListingFetchError] = useState<string | null>(null);
  const [isListingLoading, setIsListingLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showCcus, setShowCcus] = useState(true);
  const [showStandaloneShips, setShowStandaloneShips] = useState(true);
  const [showBundles, setShowBundles] = useState(true);
  const [showMisc, setShowMisc] = useState(true);

  const [isCreateListingDialogOpen, setIsCreateListingDialogOpen] = useState(false);
  const [selectedSourceItem, setSelectedSourceItem] = useState<StoreInventoryItem | null>(null);
  const [manualItemType, setManualItemType] = useState<MarketItemType>(DEFAULT_MANUAL_ITEM_TYPE);
  const [manualPackageKind, setManualPackageKind] = useState<MarketPackageKind>(DEFAULT_PACKAGE_KIND);
  const [selectedFromShip, setSelectedFromShip] = useState<Ship | null>(null);
  const [selectedToShip, setSelectedToShip] = useState<Ship | null>(null);
  const [selectedPrimaryShip, setSelectedPrimaryShip] = useState<Ship | null>(null);
  const [selectedPackageShips, setSelectedPackageShips] = useState<Ship[]>([]);
  const [manualItemName, setManualItemName] = useState("");
  const [manualItemPrice, setManualItemPrice] = useState(0);
  const [manualItemCost, setManualItemCost] = useState(0);
  const [manualItemCostTouched, setManualItemCostTouched] = useState(false);
  const [manualItemQuantity, setManualItemQuantity] = useState(1);
  const [manualInsuranceType, setManualInsuranceType] = useState("");
  const [manualPackageItemsText, setManualPackageItemsText] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [manualExternalRef, setManualExternalRef] = useState("");

  const inventoryItems = useMemo(() => buildInventoryItems({
    ccus: items.ccus,
    ships: items.ships,
    bundles: items.bundles,
    marketShips: ships,
    users,
    allItemPrices,
  }), [allItemPrices, items.bundles, items.ccus, items.ships, ships, users]);

  const fetchListingItems = useCallback(async () => {
    if (!id) {
      setListingItems([]);
      setListingFetchError(null);
      return;
    }

    setIsListingLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/list`);
      if (!response.ok) {
        throw new Error(`Unexpected response: ${response.status}`);
      }

      const data = await response.json();
      setListingItems(data.filter((item: ListingItem) => item.belongsTo === id));
      setListingFetchError(null);
    } catch (error) {
      console.error("Failed to fetch listings:", error);
      setListingFetchError(intl.formatMessage({
        id: "hangar.fetchListingsFailed",
        defaultMessage: "Failed to fetch current listings",
      }));
    } finally {
      setIsListingLoading(false);
    }
  }, [id, intl]);

  useEffect(() => {
    void fetchListingItems();
  }, [fetchListingItems]);

  const resolveShip = useCallback((shipId?: number, shipName?: string) => {
    if (typeof shipId === "number") {
      const matchedById = ships.find((ship) => ship.id === shipId);
      if (matchedById) {
        return matchedById;
      }
    }

    if (!shipName) {
      return null;
    }

    return ships.find((ship) => normalizeShipName(ship.name) === normalizeShipName(shipName)) || null;
  }, [ships]);

  const resetManualFormFields = useCallback(() => {
    setSelectedSourceItem(null);
    setManualItemType(DEFAULT_MANUAL_ITEM_TYPE);
    setManualPackageKind(DEFAULT_PACKAGE_KIND);
    setSelectedFromShip(null);
    setSelectedToShip(null);
    setSelectedPrimaryShip(null);
    setSelectedPackageShips([]);
    setManualItemName("");
    setManualItemPrice(0);
    setManualItemCost(0);
    setManualItemCostTouched(false);
    setManualItemQuantity(1);
    setManualInsuranceType("");
    setManualPackageItemsText("");
    setManualDescription("");
    setManualImageUrl("");
    setManualExternalRef("");
  }, []);

  const applyInventoryItemToForm = useCallback((item: StoreInventoryItem) => {
    const resolvedPackageShips = (item.packageShips || [])
      .map((ship) => resolveShip(ship.shipId, ship.shipName))
      .filter((ship): ship is Ship => ship !== null);
    const resolvedPrimaryShip = resolveShip(item.shipId, item.shipName) || resolvedPackageShips[0] || null;

    setManualItemType(item.itemType === "ccu" ? "ccu" : "package");
    setManualPackageKind(item.itemType === "package" ? (item.packageKind || DEFAULT_PACKAGE_KIND) : DEFAULT_PACKAGE_KIND);
    setSelectedFromShip(resolveShip(item.fromShipId, item.fromShipName));
    setSelectedToShip(resolveShip(item.toShipId, item.toShipName));
    setSelectedPrimaryShip(resolvedPrimaryShip);
    setSelectedPackageShips(
      item.packageKind === "bundle"
        ? resolvedPackageShips
        : (resolvedPrimaryShip ? [resolvedPrimaryShip] : resolvedPackageShips)
    );
    setManualItemName(item.name);
    setManualItemPrice(item.price);
    setManualItemCost(item.cost ?? item.price);
    setManualItemCostTouched(false);
    setManualItemQuantity(Math.max(item.stock, 1));
    setManualInsuranceType(item.insuranceType || "");
    setManualPackageItemsText((item.packageItems || []).map((entry) => entry.itemName).join("\n"));
    setManualDescription(item.description || "");
    setManualImageUrl(item.imageUrl || "");
    setManualExternalRef("");
  }, [resolveShip]);

  const filteredListings = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return listingItems.filter((item) => {
      const displayType = getListingDisplayType(item);

      if (!showCcus && displayType === "ccu") return false;
      if (!showStandaloneShips && displayType === "standalone_ship") return false;
      if (!showBundles && displayType === "bundle") return false;
      if (!showMisc && (displayType === "misc" || displayType === "credit")) return false;
      if (!search) return true;

      return getListingSearchText(item).includes(search);
    });
  }, [listingItems, searchTerm, showBundles, showCcus, showMisc, showStandaloneShips]);

  useEffect(() => {
    const maxPage = Math.max(Math.ceil(filteredListings.length / rowsPerPage) - 1, 0);
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [filteredListings.length, page, rowsPerPage]);

  const paginatedListings = filteredListings.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const parseManualPackageItems = useCallback(() => {
    return manualPackageItemsText
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry, index) => ({
        itemName: entry,
        withImage: false,
        sortOrder: index + 1,
      }));
  }, [manualPackageItemsText]);

  const handleOpenCreateListingDialog = () => {
    resetManualFormFields();
    setIsCreateListingDialogOpen(true);
  };

  const handleCloseCreateListingDialog = () => {
    setIsCreateListingDialogOpen(false);
    resetManualFormFields();
  };

  const handleSourceItemChange = (_event: unknown, newValue: StoreInventoryItem | null) => {
    setSelectedSourceItem(newValue);

    if (newValue) {
      applyInventoryItemToForm(newValue);
    }
  };

  const handleRemoveItem = async (skuId?: string) => {
    if (!skuId || !token) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
        method: "DELETE",
        body: JSON.stringify({ skuId }),
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Unexpected response: ${response.status}`);
      }

      setListingFetchError(null);
      await fetchListingItems();
    } catch (error) {
      console.error("Failed to remove listing:", error);
      setListingFetchError(intl.formatMessage({
        id: "hangar.removeListingFailed",
        defaultMessage: "Failed to remove listing",
      }));
    }
  };

  const canSubmitManualItem = useMemo(() => {
    if (!manualItemName.trim() || manualItemPrice <= 0 || manualItemQuantity <= 0) return false;

    if (manualItemType === "ccu") {
      return Boolean(selectedFromShip && selectedToShip && selectedFromShip.id !== selectedToShip.id);
    }

    if (manualItemType === "package") {
      if (manualPackageKind === "standalone_ship") {
        return Boolean(selectedPrimaryShip);
      }

      return selectedPackageShips.length > 0 && Boolean(selectedPrimaryShip || selectedPackageShips[0]);
    }

    return true;
  }, [
    manualItemName,
    manualItemPrice,
    manualItemQuantity,
    manualItemType,
    manualPackageKind,
    selectedFromShip,
    selectedPrimaryShip,
    selectedPackageShips,
    selectedToShip,
  ]);

  const handleCreateListing = async () => {
    if (!token || !canSubmitManualItem) {
      return;
    }

    const basePayload = {
      name: manualItemName.trim(),
      price: manualItemPrice,
      cost: manualItemCostTouched || selectedSourceItem ? manualItemCost : manualItemPrice,
      stock: manualItemQuantity,
      sourceKind: selectedSourceItem ? "hangar" : "manual",
    };

    try {
      if (manualItemType === "ccu") {
        if (!selectedFromShip || !selectedToShip || selectedFromShip.id === selectedToShip.id) {
          return;
        }

        const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
          method: "POST",
          body: JSON.stringify({
            ...basePayload,
            itemType: "ccu",
            fromShipId: selectedFromShip.id,
            toShipId: selectedToShip.id,
            fromShipName: selectedFromShip.name,
            toShipName: selectedToShip.name,
            rsiName: basePayload.name,
          }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Unexpected response: ${response.status}`);
        }
      } else if (manualItemType === "package") {
        const packageShips = manualPackageKind === "standalone_ship"
          ? (selectedPrimaryShip ? [{
              shipId: selectedPrimaryShip.id,
              shipName: selectedPrimaryShip.name,
              sortOrder: 1,
            }] : [])
          : selectedPackageShips.map((ship, index) => ({
              shipId: ship.id,
              shipName: ship.name,
              sortOrder: index + 1,
            }));

        const primaryShip = manualPackageKind === "standalone_ship"
          ? selectedPrimaryShip
          : (selectedPrimaryShip || selectedPackageShips[0] || null);

        if (!packageShips.length || !primaryShip) {
          return;
        }

        const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
          method: "POST",
          body: JSON.stringify({
            ...basePayload,
            itemType: "package",
            shipId: primaryShip.id,
            primaryShipId: primaryShip.id,
            primaryShipName: primaryShip.name,
            packageKind: manualPackageKind,
            insuranceType: manualInsuranceType || undefined,
            packageShips,
            packageItems: manualPackageKind === "bundle" ? parseManualPackageItems() : [],
            imageUrl: manualImageUrl || undefined,
            description: manualDescription || undefined,
          }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Unexpected response: ${response.status}`);
        }
      } else {
        const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
          method: "POST",
          body: JSON.stringify({
            ...basePayload,
            itemType: "misc",
            imageUrl: manualImageUrl || undefined,
            description: manualDescription || undefined,
            externalRef: manualExternalRef || undefined,
          }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Unexpected response: ${response.status}`);
        }
      }

      setListingFetchError(null);
      await fetchListingItems();
      handleCloseCreateListingDialog();
    } catch (error) {
      console.error("Failed to create listing:", error);
      setListingFetchError(intl.formatMessage({
        id: "hangar.createListingFailed",
        defaultMessage: "Failed to create listing",
      }));
    }
  };

  return (
    <>
      <div className="absolute top-0 right-0 m-[15px] gap-2 hidden sm:flex">
        <div className="flex flex-col gap-2 items-center justify-center">
          <Crawler ships={ships} />
        </div>
        <UserSelector />
      </div>

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, gap: 2, flexWrap: "wrap" }}>
        <TextField
          sx={{ flexGrow: 1, minWidth: 320 }}
          variant="outlined"
          placeholder={intl.formatMessage({ id: "market.searchListings", defaultMessage: "Search current listings..." })}
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setPage(0);
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            },
          }}
          size="small"
        />
        <Button
          variant="contained"
          startIcon={<PlusCircle />}
          onClick={handleOpenCreateListingDialog}
        >
          <FormattedMessage id="hangar.addListing" defaultMessage="Add Listing" />
        </Button>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, px: 2, py: 1, mb: 2 }}>
        <FormGroup row sx={{ gap: 2 }}>
          <FormControlLabel
            control={<Checkbox checked={showCcus} onChange={(event) => setShowCcus(event.target.checked)} size="small" />}
            label={intl.formatMessage({ id: "market.filter.ccu", defaultMessage: "CCU" })}
          />
          <FormControlLabel
            control={<Checkbox checked={showStandaloneShips} onChange={(event) => setShowStandaloneShips(event.target.checked)} size="small" />}
            label={intl.formatMessage({ id: "market.filter.standaloneShip", defaultMessage: "Standalone Ship" })}
          />
          <FormControlLabel
            control={<Checkbox checked={showBundles} onChange={(event) => setShowBundles(event.target.checked)} size="small" />}
            label={intl.formatMessage({ id: "market.filter.bundle", defaultMessage: "Bundle" })}
          />
          <FormControlLabel
            control={<Checkbox checked={showMisc} onChange={(event) => setShowMisc(event.target.checked)} size="small" />}
            label={intl.formatMessage({ id: "market.filter.misc", defaultMessage: "Misc" })}
          />
        </FormGroup>
      </Box>

      {listingFetchError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {listingFetchError}
        </Alert>
      )}

      {isListingLoading && listingItems.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="h6">
            <FormattedMessage id="loading" defaultMessage="Loading..." />
          </Typography>
        </Box>
      ) : filteredListings.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="h6">
            <FormattedMessage id="hangar.noListings" defaultMessage="No items currently listed" />
          </Typography>
        </Box>
      ) : (
        <Box sx={{ width: "100%", overflow: "auto" }}>
          <TableContainer sx={{ mb: 2 }}>
            <Table aria-label="store listings table">
              <TableHead>
                <TableRow>
                  <TableCell width="360px">
                    <FormattedMessage id="hangar.image" defaultMessage="Image" />
                  </TableCell>
                  <TableCell>
                    <FormattedMessage id="hangar.details" defaultMessage="Details" />
                  </TableCell>
                  <TableCell width="180px">
                    <FormattedMessage id="hangar.type" defaultMessage="Type" />
                  </TableCell>
                  <TableCell width="160px">
                    <FormattedMessage id="hangar.price" defaultMessage="Price" />
                  </TableCell>
                  <TableCell width="160px">
                    <FormattedMessage id="market.cost" defaultMessage="Cost" />
                  </TableCell>
                  <TableCell width="180px">
                    <FormattedMessage id="hangar.quantity" defaultMessage="Quantity" />
                  </TableCell>
                  <TableCell width="140px">
                    <FormattedMessage id="hangar.action" defaultMessage="Action" />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedListings.map((item) => {
                  const visual = getMarketItemVisual(item, ships);
                  const displayType = getListingDisplayType(item);
                  const availableStock = Math.max(item.stock - item.lockedStock, 0);

                  return (
                    <TableRow key={item.skuId} hover>
                      <TableCell>
                        {item.itemType === "ccu" ? (
                          <Box sx={{ position: "relative", width: 320, height: 180, overflow: "hidden" }}>
                            <Box
                              component="img"
                              sx={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                width: "35%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                              src={visual.fromImage || MARKET_ITEM_PLACEHOLDER}
                              alt={visual.fromShipName || item.name}
                            />
                            <Box
                              component="img"
                              sx={{
                                position: "absolute",
                                right: 0,
                                top: 0,
                                width: "65%",
                                height: "100%",
                                objectFit: "cover",
                                boxShadow: "0 0 20px 0 rgba(0, 0, 0, 0.2)",
                              }}
                              src={visual.toImage || MARKET_ITEM_PLACEHOLDER}
                              alt={visual.toShipName || item.name}
                            />
                            <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center justify-center">
                              <span className="text-white text-sm">{item.name}</span>
                            </div>
                            <div className="absolute top-[50%] left-[35%] -translate-y-[50%] -translate-x-[50%] text-white text-2xl font-bold">
                              <ChevronsRight className="w-8 h-8" />
                            </div>
                          </Box>
                        ) : (
                          <Box
                            component="img"
                            sx={{ width: 280, height: 160, objectFit: "cover" }}
                            src={visual.thumbnail || MARKET_ITEM_PLACEHOLDER}
                            alt={item.name}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Typography variant="h6">{item.name}</Typography>

                          {item.itemType === "ccu" && (
                            <Typography variant="body2" color="text.secondary">
                              {item.fromShipName || visual.fromShipName || "-"} {"->"} {item.toShipName || visual.toShipName || "-"}
                            </Typography>
                          )}

                          {item.itemType === "package" && (
                            <>
                              {(item.shipName || item.packageShips?.length) && (
                                <Typography variant="body2" color="text.secondary">
                                  {item.packageKind === "bundle"
                                    ? intl.formatMessage(
                                      { id: "market.detail.shipCount", defaultMessage: "{count, plural, one {# ship} other {# ships}}" },
                                      { count: item.packageShips?.length || 0 },
                                    )
                                    : (item.shipName || item.packageShips?.[0]?.shipName || "-")}
                                </Typography>
                              )}
                              {(item.packageKind || item.insuranceType) && (
                                <Typography variant="body2" color="text.secondary">
                                  {[item.packageKind, item.insuranceType].filter(Boolean).join(" · ")}
                                </Typography>
                              )}
                              {item.packageKind === "bundle" && (
                                <Typography variant="body2" color="text.secondary">
                                  {intl.formatMessage(
                                    { id: "market.detail.extraCount", defaultMessage: "{count, plural, one {# extra} other {# extras}}" },
                                    { count: item.packageItems?.length || 0 },
                                  )}
                                </Typography>
                              )}
                            </>
                          )}

                          {item.description && (
                            <Typography variant="body2" color="text.secondary">
                              {item.description}
                            </Typography>
                          )}

                          {item.externalRef && (
                            <Typography variant="body2" color="text.secondary">
                              {item.externalRef}
                            </Typography>
                          )}

                          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                            {item.sourceKind && (
                              <Chip size="small" variant="outlined" label={getSourceKindLabel(item.sourceKind, intl)} />
                            )}
                          </Box>
                        </div>
                      </TableCell>
                      <TableCell sx={{ textWrap: "nowrap" }}>
                        <Chip
                          size="small"
                          label={getDisplayTypeLabel(displayType, intl)}
                        />
                      </TableCell>
                      <TableCell sx={{ textWrap: "nowrap" }}>
                        <Typography variant="body2" color="primary" fontWeight={700}>
                          {item.price.toLocaleString(intl.locale, { style: "currency", currency: "USD" })}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textWrap: "nowrap" }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={600}>
                          {typeof item.cost === "number"
                            ? item.cost.toLocaleString(intl.locale, { style: "currency", currency: "USD" })
                            : "-"}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textWrap: "nowrap" }}>
                        <div className="flex flex-col gap-1">
                          <Typography variant="body2" fontWeight={700}>
                            {availableStock}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            <FormattedMessage
                              id="market.listingStockBreakdown"
                              defaultMessage="Total {stock} / Locked {lockedStock}"
                              values={{ stock: item.stock, lockedStock: item.lockedStock }}
                            />
                          </Typography>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outlined"
                          color="error"
                          onClick={() => handleRemoveItem(item.skuId)}
                        >
                          <FormattedMessage id="hangar.remove" defaultMessage="Remove" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={filteredListings.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
            labelRowsPerPage={intl.formatMessage({ id: "pagination.rowsPerPage", defaultMessage: "Rows per page:" })}
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: "pagination.total", defaultMessage: "Total" })} ${count}`}
          />
        </Box>
      )}

      <Dialog
        open={isCreateListingDialogOpen}
        onClose={handleCloseCreateListingDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          <FormattedMessage id="hangar.addListing" defaultMessage="Add Listing" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 3 }}>
            <FormattedMessage
              id="market.prefillFromHangarDescription"
              defaultMessage="Choose a giftable hangar item to prefill the form, or leave it empty and fill the listing manually."
            />
          </DialogContentText>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Autocomplete
              options={inventoryItems}
              value={selectedSourceItem}
              isOptionEqualToValue={(option, value) => option.sourceKey === value.sourceKey}
              getOptionLabel={(option) => getInventoryOptionLabel(option, intl)}
              noOptionsText={intl.formatMessage({ id: "hangar.noEquipment", defaultMessage: "No sharable content in your hangar" })}
              onChange={handleSourceItemChange}
              renderOption={(props, option) => (
                <li {...props}>
                  <div className="flex flex-col py-1">
                    <span className="font-medium">{getInventoryOptionLabel(option, intl)}</span>
                    <span className="text-sm text-gray-500">
                      {getInventoryOptionMeta(option)}
                      {option.isBuyBack ? ` | ${intl.formatMessage({ id: "market.prefillBuybackShort", defaultMessage: "Buyback" })}` : ""}
                    </span>
                  </div>
                </li>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={intl.formatMessage({ id: "market.prefillFromHangar", defaultMessage: "Prefill from Hangar" })}
                  placeholder={intl.formatMessage({ id: "market.prefillFromHangarPlaceholder", defaultMessage: "Search giftable hangar items" })}
                />
              )}
              filterOptions={(options, state) => {
                const search = state.inputValue.trim().toLowerCase();
                if (!search) {
                  return options;
                }

                return options.filter((option) => getInventorySearchText(option).includes(search));
              }}
              sx={{ gridColumn: { md: "1 / span 2" } }}
            />

            {selectedSourceItem && (
              <Alert severity={selectedSourceItem.isBuyBack ? "warning" : "info"} sx={{ gridColumn: { md: "1 / span 2" } }}>
                <FormattedMessage
                  id="market.prefillDetachedHint"
                  defaultMessage="{buybackNotice} The selected hangar item only fills the form. After you create the listing, it will remain independent from that hangar entry."
                  values={{
                    buybackNotice: selectedSourceItem.isBuyBack
                      ? intl.formatMessage({ id: "market.prefillBuybackNotice", defaultMessage: "This selected hangar item is a buyback item." })
                      : intl.formatMessage({ id: "market.prefillNonBuybackNotice", defaultMessage: "This selected hangar item is not a buyback item." }),
                  }}
                />
              </Alert>
            )}

            <TextField
              select
              label={intl.formatMessage({ id: "market.filter.type", defaultMessage: "Item Type" })}
              value={manualItemType}
              onChange={(event) => setManualItemType(event.target.value as MarketItemType)}
            >
              <MenuItem value="ccu">CCU</MenuItem>
              <MenuItem value="package">
                {intl.formatMessage({ id: "market.filter.package", defaultMessage: "Package" })}
              </MenuItem>
              <MenuItem value="misc">
                {intl.formatMessage({ id: "market.filter.misc", defaultMessage: "Misc" })}
              </MenuItem>
            </TextField>

            {manualItemType === "package" ? (
              <TextField
                select
                label={intl.formatMessage({ id: "market.packageKind", defaultMessage: "Package Kind" })}
                value={manualPackageKind}
                onChange={(event) => setManualPackageKind(event.target.value as MarketPackageKind)}
              >
                <MenuItem value="standalone_ship">
                  {intl.formatMessage({ id: "market.filter.standaloneShip", defaultMessage: "Standalone Ship" })}
                </MenuItem>
                <MenuItem value="bundle">
                  {intl.formatMessage({ id: "market.filter.bundle", defaultMessage: "Bundle" })}
                </MenuItem>
              </TextField>
            ) : (
              <Box />
            )}

            {manualItemType === "ccu" && (
              <>
                <Autocomplete
                  options={ships}
                  getOptionLabel={(option) => option.name}
                  value={selectedFromShip}
                  onChange={(_, newValue) => setSelectedFromShip(newValue)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={intl.formatMessage({ id: "hangar.fromShip", defaultMessage: "From Ship" })}
                    />
                  )}
                />
                <Autocomplete
                  options={ships}
                  getOptionLabel={(option) => option.name}
                  value={selectedToShip}
                  onChange={(_, newValue) => setSelectedToShip(newValue)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={intl.formatMessage({ id: "hangar.toShip", defaultMessage: "To Ship" })}
                    />
                  )}
                />
              </>
            )}

            {manualItemType === "package" && manualPackageKind === "standalone_ship" && (
              <Autocomplete
                options={ships}
                getOptionLabel={(option) => option.name}
                value={selectedPrimaryShip}
                onChange={(_, newValue) => setSelectedPrimaryShip(newValue)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={intl.formatMessage({ id: "market.primaryShip", defaultMessage: "Primary Ship" })}
                  />
                )}
              />
            )}

            {manualItemType === "package" && manualPackageKind === "bundle" && (
              <>
                <Autocomplete
                  multiple
                  options={ships}
                  getOptionLabel={(option) => option.name}
                  value={selectedPackageShips}
                  onChange={(_, newValue) => setSelectedPackageShips(newValue)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={intl.formatMessage({ id: "market.packageShips", defaultMessage: "Bundle Ships" })}
                    />
                  )}
                />
                <Autocomplete
                  options={selectedPackageShips}
                  getOptionLabel={(option) => option.name}
                  value={selectedPrimaryShip}
                  onChange={(_, newValue) => setSelectedPrimaryShip(newValue)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={intl.formatMessage({ id: "market.primaryShip", defaultMessage: "Primary Ship" })}
                    />
                  )}
                />
              </>
            )}

            <TextField
              label={intl.formatMessage({ id: "hangar.itemName", defaultMessage: "Item Name" })}
              value={manualItemName}
              onChange={(event) => setManualItemName(event.target.value)}
            />

            <TextField
              label={intl.formatMessage({ id: "hangar.price", defaultMessage: "Price" })}
              type="number"
              value={manualItemPrice}
              onChange={(event) => {
                const nextPrice = Number(event.target.value);
                setManualItemPrice(nextPrice);
                if (!selectedSourceItem && !manualItemCostTouched) {
                  setManualItemCost(nextPrice);
                }
              }}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
            />

            <TextField
              label={intl.formatMessage({ id: "market.cost", defaultMessage: "Cost" })}
              type="number"
              value={manualItemCost}
              onChange={(event) => {
                setManualItemCost(Number(event.target.value));
                setManualItemCostTouched(true);
              }}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
            />

            <TextField
              label={intl.formatMessage({ id: "hangar.quantity", defaultMessage: "Quantity" })}
              type="number"
              value={manualItemQuantity}
              onChange={(event) => setManualItemQuantity(Number(event.target.value))}
              InputProps={{
                inputProps: { min: 1 },
              }}
            />

            {manualItemType === "package" && (
              <TextField
                label={intl.formatMessage({ id: "market.insurance", defaultMessage: "Insurance" })}
                value={manualInsuranceType}
                onChange={(event) => setManualInsuranceType(event.target.value)}
              />
            )}

            {(manualItemType === "package" || manualItemType === "misc") && (
              <TextField
                label={intl.formatMessage({ id: "market.imageUrl", defaultMessage: "Image URL" })}
                value={manualImageUrl}
                onChange={(event) => setManualImageUrl(event.target.value)}
              />
            )}

            {manualItemType === "package" && manualPackageKind === "bundle" && (
              <TextField
                multiline
                minRows={4}
                label={intl.formatMessage({ id: "market.packageItems", defaultMessage: "Bundle Extra Items (one per line)" })}
                value={manualPackageItemsText}
                onChange={(event) => setManualPackageItemsText(event.target.value)}
                sx={{ gridColumn: { md: "1 / span 2" } }}
              />
            )}

            {(manualItemType === "package" || manualItemType === "misc") && (
              <TextField
                multiline
                minRows={3}
                label={intl.formatMessage({ id: "market.description", defaultMessage: "Description" })}
                value={manualDescription}
                onChange={(event) => setManualDescription(event.target.value)}
                sx={{ gridColumn: { md: "1 / span 2" } }}
              />
            )}

            {manualItemType === "misc" && (
              <TextField
                label={intl.formatMessage({ id: "market.externalRef", defaultMessage: "External Ref" })}
                value={manualExternalRef}
                onChange={(event) => setManualExternalRef(event.target.value)}
              />
            )}

          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateListingDialog}>
            <FormattedMessage id="cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleCreateListing} disabled={!canSubmitManualItem} variant="contained">
            <FormattedMessage id="hangar.addItem" defaultMessage="Add Item" />
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
