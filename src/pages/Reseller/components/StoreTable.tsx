import { useCallback, useEffect, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
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
import { Search, ChevronsRight, PlusCircle, List } from "lucide-react";
import Crawler from "@/components/Crawler";
import UserSelector from "@/components/UserSelector";
import { ListingItem, MarketItemType, Ship } from "@/types";
import { getMarketItemVisual, MARKET_ITEM_PLACEHOLDER } from "@/components/marketItemDisplay";
import {
  buildInventoryItems,
  buildListingPayload,
  findMatchingListing,
  getInventorySearchText,
  StoreInventoryItem,
} from "./storeListingUtils";

const DEFAULT_MANUAL_ITEM_TYPE: MarketItemType = "ccu";

export default function StoreTable({ ships }: { ships: Ship[] }) {
  const intl = useIntl();
  const { token, id } = useSelector((state: RootState) => state.user.user);
  const { users } = useSelector((state: RootState) => state.upgrades);
  const items = useSelector(selectUsersHangarItems);
  const allItemPrices = useSelector((state: RootState) => state.share?.allItemPrices || {});

  const [listingItems, setListingItems] = useState<ListingItem[]>([]);
  const [listingFetchError, setListingFetchError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showBuybacks, setShowBuybacks] = useState(true);
  const [showCcus, setShowCcus] = useState(true);
  const [showStandaloneShips, setShowStandaloneShips] = useState(true);
  const [showBundles, setShowBundles] = useState(true);

  const [isListingDialogOpen, setIsListingDialogOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<StoreInventoryItem | null>(null);
  const [listingPrice, setListingPrice] = useState(0);
  const [listingQuantity, setListingQuantity] = useState(1);

  const [isManageListingDialogOpen, setIsManageListingDialogOpen] = useState(false);
  const [manualItemType, setManualItemType] = useState<MarketItemType>(DEFAULT_MANUAL_ITEM_TYPE);
  const [manualPackageKind, setManualPackageKind] = useState<"standalone_ship" | "bundle">("standalone_ship");
  const [selectedFromShip, setSelectedFromShip] = useState<Ship | null>(null);
  const [selectedToShip, setSelectedToShip] = useState<Ship | null>(null);
  const [selectedPrimaryShip, setSelectedPrimaryShip] = useState<Ship | null>(null);
  const [selectedPackageShips, setSelectedPackageShips] = useState<Ship[]>([]);
  const [manualItemName, setManualItemName] = useState("");
  const [manualItemPrice, setManualItemPrice] = useState(0);
  const [manualItemQuantity, setManualItemQuantity] = useState(1);
  const [manualInsuranceType, setManualInsuranceType] = useState("");
  const [manualPackageItemsText, setManualPackageItemsText] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [manualExternalRef, setManualExternalRef] = useState("");
  const [manualCanGift, setManualCanGift] = useState(false);
  const [manualIsBuyBack, setManualIsBuyBack] = useState(false);

  const inventoryItems = useMemo(() => buildInventoryItems({
    ccus: items.ccus,
    ships: items.ships,
    bundles: items.bundles,
    marketShips: ships,
    users,
    allItemPrices,
  }), [allItemPrices, items.bundles, items.ccus, items.ships, ships, users]);

  const fetchListingItems = useCallback(() => {
    if (!id) return;

    fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/list`)
      .then((res) => res.json())
      .then((data) => {
        setListingItems(data.filter((item: ListingItem) => item.belongsTo === id));
        setListingFetchError(null);
      })
      .catch((error) => {
        console.error("Failed to fetch listings:", error);
        setListingFetchError(intl.formatMessage({
          id: "hangar.fetchListingsFailed",
          defaultMessage: "Failed to fetch current listings",
        }));
      });
  }, [id, intl]);

  useEffect(() => {
    fetchListingItems();
  }, [fetchListingItems]);

  const filteredInventory = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return inventoryItems.filter((item) => {
      if (!showBuybacks && item.isBuyBack) return false;
      if (!showCcus && item.displayType === "ccu") return false;
      if (!showStandaloneShips && item.displayType === "standalone_ship") return false;
      if (!showBundles && item.displayType === "bundle") return false;
      if (!search) return true;
      return getInventorySearchText(item).includes(search);
    });
  }, [inventoryItems, searchTerm, showBundles, showBuybacks, showCcus, showStandaloneShips]);

  const paginatedInventory = filteredInventory.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleOpenListingDialog = (item: StoreInventoryItem) => {
    setCurrentItem(item);
    setListingPrice(item.price);
    setListingQuantity(Math.min(item.stock, 1));
    setIsListingDialogOpen(true);
  };

  const handleCloseListingDialog = () => {
    setIsListingDialogOpen(false);
    setCurrentItem(null);
  };

  const handleListItem = async (item: StoreInventoryItem, price: number, stock: number) => {
    await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
      method: "POST",
      body: JSON.stringify(buildListingPayload(item, price, stock)),
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    fetchListingItems();
    handleCloseListingDialog();
  };

  const handleConfirmListing = () => {
    if (!currentItem || listingPrice <= 0 || listingQuantity <= 0) return;
    handleListItem(currentItem, listingPrice, listingQuantity);
  };

  const handleRemoveItem = async (skuId?: string) => {
    if (!skuId) return;

    await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
      method: "DELETE",
      body: JSON.stringify({ skuId }),
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    fetchListingItems();
  };

  const handleOpenManageListingDialog = () => {
    setIsManageListingDialogOpen(true);
  };

  const handleCloseManageListingDialog = () => {
    setIsManageListingDialogOpen(false);
    resetManualFormFields();
  };

  const resetManualFormFields = () => {
    setManualItemType(DEFAULT_MANUAL_ITEM_TYPE);
    setManualPackageKind("standalone_ship");
    setSelectedFromShip(null);
    setSelectedToShip(null);
    setSelectedPrimaryShip(null);
    setSelectedPackageShips([]);
    setManualItemName("");
    setManualItemPrice(0);
    setManualItemQuantity(1);
    setManualInsuranceType("");
    setManualPackageItemsText("");
    setManualDescription("");
    setManualImageUrl("");
    setManualExternalRef("");
    setManualCanGift(false);
    setManualIsBuyBack(false);
  };

  const parseManualPackageItems = () => {
    return manualPackageItemsText
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry, index) => ({
        itemName: entry,
        withImage: false,
        sortOrder: index + 1,
      }));
  };

  const handleManualAdd = async () => {
    const basePayload = {
      name: manualItemName.trim(),
      price: manualItemPrice,
      stock: manualItemQuantity,
      canGift: manualCanGift,
      isBuyBack: manualIsBuyBack,
      sourceKind: "manual",
    };

    if (!basePayload.name || basePayload.price <= 0 || basePayload.stock <= 0) {
      return;
    }

    if (manualItemType === "ccu") {
      if (!selectedFromShip || !selectedToShip) return;

      await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
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
          "Authorization": `Bearer ${token}`
        }
      });
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

      if (!packageShips.length || !primaryShip) return;

      await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
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
          "Authorization": `Bearer ${token}`
        }
      });
    } else {
      await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
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
          "Authorization": `Bearer ${token}`
        }
      });
    }

    fetchListingItems();
    resetManualFormFields();
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

  return (
    <>
      <div className='absolute top-0 right-0 m-[15px] gap-2 hidden sm:flex'>
        <div className='flex flex-col gap-2 items-center justify-center'>
          <Crawler ships={ships} />
        </div>
        <UserSelector />
      </div>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <TextField
          sx={{ flexGrow: 1, minWidth: 320 }}
          variant="outlined"
          placeholder={intl.formatMessage({ id: 'search.placeholder', defaultMessage: 'Search equipment...' })}
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
              )
            }
          }}
          size="small"
        />
        <Button
          variant="contained"
          startIcon={<List />}
          onClick={handleOpenManageListingDialog}
        >
          <FormattedMessage id="hangar.manageListings" defaultMessage="Manage Listings" />
        </Button>
      </Box>

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 2, py: 1, mb: 2 }}>
        <FormGroup row sx={{ gap: 2 }}>
          <FormControlLabel
            control={<Checkbox checked={showCcus} onChange={(event) => setShowCcus(event.target.checked)} size="small" />}
            label={intl.formatMessage({ id: 'market.filter.ccu', defaultMessage: 'CCU' })}
          />
          <FormControlLabel
            control={<Checkbox checked={showStandaloneShips} onChange={(event) => setShowStandaloneShips(event.target.checked)} size="small" />}
            label={intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' })}
          />
          <FormControlLabel
            control={<Checkbox checked={showBundles} onChange={(event) => setShowBundles(event.target.checked)} size="small" />}
            label={intl.formatMessage({ id: 'market.filter.bundle', defaultMessage: 'Bundle' })}
          />
          <FormControlLabel
            control={<Checkbox checked={showBuybacks} onChange={(event) => setShowBuybacks(event.target.checked)} size="small" />}
            label={intl.formatMessage({ id: 'market.filter.buyback', defaultMessage: 'Include buyback' })}
          />
        </FormGroup>
      </Box>

      {listingFetchError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {listingFetchError}
        </Alert>
      )}

      {filteredInventory.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6">
            <FormattedMessage id="hangar.noEquipment" defaultMessage="No sharable content in your hangar" />
          </Typography>
        </Box>
      ) : (
        <Box sx={{ width: '100%', overflow: 'auto' }}>
          <TableContainer sx={{ mb: 2 }}>
            <Table aria-label="store inventory table">
              <TableHead>
                <TableRow>
                  <TableCell width="360px">
                    <FormattedMessage id="hangar.image" defaultMessage="Image" />
                  </TableCell>
                  <TableCell>
                    <FormattedMessage id="hangar.details" defaultMessage="Details" />
                  </TableCell>
                  <TableCell width="160px">
                    <FormattedMessage id="hangar.type" defaultMessage="Type" />
                  </TableCell>
                  <TableCell width="180px">
                    <FormattedMessage id="hangar.operation" defaultMessage="Operation" />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedInventory.map((item) => {
                  const visual = getMarketItemVisual(item, ships);
                  const listing = findMatchingListing(item, listingItems);
                  const msrpDelta = item.itemType === "ccu" && item.fromMsrp !== undefined && item.toMsrp !== undefined
                    ? (item.toMsrp - item.fromMsrp) / 100
                    : null;
                  const discount = msrpDelta && msrpDelta > 0
                    ? ((msrpDelta - item.price) / msrpDelta * 100).toFixed(2)
                    : null;

                  return (
                    <TableRow key={item.sourceKey} hover>
                      <TableCell>
                        {item.itemType === "ccu" ? (
                          <Box sx={{ position: 'relative', width: 320, height: 180, overflow: 'hidden' }}>
                            <Box
                              component="img"
                              sx={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                width: '35%',
                                height: '100%',
                                objectFit: 'cover',
                              }}
                              src={visual.fromImage || MARKET_ITEM_PLACEHOLDER}
                              alt={visual.fromShipName || item.name}
                            />
                            <Box
                              component="img"
                              sx={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                width: '65%',
                                height: '100%',
                                objectFit: 'cover',
                                boxShadow: '0 0 20px 0 rgba(0, 0, 0, 0.2)'
                              }}
                              src={visual.toImage || MARKET_ITEM_PLACEHOLDER}
                              alt={visual.toShipName || item.name}
                            />
                            <div className='absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center justify-center'>
                              <span className='text-white text-sm'>{item.name}</span>
                            </div>
                            <div className='absolute top-[50%] left-[35%] -translate-y-[50%] -translate-x-[50%] text-white text-2xl font-bold'>
                              <ChevronsRight className='w-8 h-8' />
                            </div>
                          </Box>
                        ) : (
                          <Box
                            component="img"
                            sx={{ width: 280, height: 160, objectFit: 'cover' }}
                            src={visual.thumbnail || MARKET_ITEM_PLACEHOLDER}
                            alt={item.name}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-col gap-2'>
                          <Typography variant="h6">{item.name}</Typography>

                          {item.itemType === "ccu" && (
                            <>
                              <Typography variant="body2" color="text.secondary">
                                {item.fromShipName} → {item.toShipName}
                              </Typography>
                              {msrpDelta !== null && (
                                <Typography variant="body2" color="text.secondary">
                                  <FormattedMessage id="hangar.msrp" defaultMessage="MSRP" />:
                                  <span className='text-blue-500 ml-1'>
                                    US${((item.fromMsrp || 0) / 100).toFixed(2)} - US${((item.toMsrp || 0) / 100).toFixed(2)}
                                  </span>
                                </Typography>
                              )}
                            </>
                          )}

                          {item.itemType === "package" && (
                            <>
                              {item.shipName && (
                                <Typography variant="body2" color="text.secondary">
                                  {item.shipName}
                                </Typography>
                              )}
                              {(item.packageKind || item.insuranceType) && (
                                <Typography variant="body2" color="text.secondary">
                                  {[item.packageKind, item.insuranceType].filter(Boolean).join(' · ')}
                                </Typography>
                              )}
                              {item.packageKind === "bundle" && (
                                <Typography variant="body2" color="text.secondary">
                                  {(item.packageShips?.length || 0)} ships / {(item.packageItems?.length || 0)} extras
                                </Typography>
                              )}
                            </>
                          )}

                          <Typography variant="body2" color="text.secondary">
                            <FormattedMessage id="hangar.quantity" defaultMessage="Quantity" />: {item.stock}
                          </Typography>

                          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {item.ownerLabels.map((owner) => (
                              <Chip key={`${item.sourceKey}-${owner}`} label={owner} size="small" variant="outlined" color="primary" />
                            ))}
                            {item.canGift && (
                              <Chip size="small" color="success" label={intl.formatMessage({ id: 'hangar.giftable', defaultMessage: 'Giftable' })} />
                            )}
                            {item.isBuyBack && (
                              <Chip size="small" color="warning" label={intl.formatMessage({ id: 'hangar.buyBack', defaultMessage: 'Buy Back' })} />
                            )}
                          </Box>
                        </div>
                      </TableCell>
                      <TableCell sx={{ textWrap: 'nowrap' }}>
                        <div className='flex flex-col gap-2'>
                          <Chip
                            size="small"
                            label={item.displayType === "ccu"
                              ? "CCU"
                              : item.displayType === "standalone_ship"
                                ? intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' })
                                : intl.formatMessage({ id: 'market.filter.bundle', defaultMessage: 'Bundle' })}
                          />
                          <Typography variant="body2" color="primary" fontWeight={700}>
                            US${item.price.toFixed(2)}
                          </Typography>
                          {discount && Number(discount) > 0 && (
                            <Typography variant="body2" color="text.secondary">
                              {discount}% off
                            </Typography>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {listing ? (
                          <div className='flex flex-col gap-2'>
                            <Button variant="outlined" color="error" onClick={() => handleRemoveItem(listing.skuId)}>
                              <FormattedMessage id="hangar.remove" defaultMessage="Remove" />
                            </Button>
                            <Typography variant="caption" color="text.secondary">
                              {listing.stock} in listing
                            </Typography>
                          </div>
                        ) : (
                          <Button variant="outlined" onClick={() => handleOpenListingDialog(item)}>
                            <FormattedMessage id="hangar.edit" defaultMessage="List Item" />
                          </Button>
                        )}
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
            count={filteredInventory.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
            labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: 'Rows per page:' })}
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'Total' })} ${count}`}
          />
        </Box>
      )}

      <Dialog open={isListingDialogOpen} onClose={handleCloseListingDialog}>
        <DialogTitle>
          <FormattedMessage id="hangar.listItem" defaultMessage="List Item" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            <FormattedMessage
              id="hangar.listItemConfirm"
              defaultMessage="Please confirm the price and quantity for {itemName}"
              values={{ itemName: currentItem?.name || "" }}
            />
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label={intl.formatMessage({ id: 'hangar.price', defaultMessage: 'Price' })}
            type="number"
            fullWidth
            variant="standard"
            value={listingPrice}
            onChange={(event) => setListingPrice(Number(event.target.value))}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
          />
          <TextField
            margin="dense"
            label={intl.formatMessage({ id: 'hangar.quantity', defaultMessage: 'Quantity' })}
            type="number"
            fullWidth
            variant="standard"
            value={listingQuantity}
            onChange={(event) => setListingQuantity(Number(event.target.value))}
            InputProps={{
              inputProps: {
                min: 1,
                max: currentItem?.stock || 1
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseListingDialog}>
            <FormattedMessage id="cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleConfirmListing} disabled={!currentItem || listingPrice <= 0 || listingQuantity <= 0}>
            <FormattedMessage id="confirm" defaultMessage="Confirm" />
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isManageListingDialogOpen}
        onClose={handleCloseManageListingDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          <FormattedMessage id="hangar.manageListings" defaultMessage="Manage Listings" />
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              <FormattedMessage id="hangar.currentListings" defaultMessage="Current Listings" />
            </Typography>
            {listingItems.length === 0 ? (
              <Typography>
                <FormattedMessage id="hangar.noListings" defaultMessage="No items currently listed" />
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><FormattedMessage id="hangar.name" defaultMessage="Name" /></TableCell>
                      <TableCell><FormattedMessage id="hangar.type" defaultMessage="Type" /></TableCell>
                      <TableCell><FormattedMessage id="hangar.price" defaultMessage="Price" /></TableCell>
                      <TableCell><FormattedMessage id="hangar.quantity" defaultMessage="Quantity" /></TableCell>
                      <TableCell><FormattedMessage id="hangar.action" defaultMessage="Action" /></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {listingItems.map((item) => (
                      <TableRow key={item.skuId}>
                        <TableCell>
                          <div className='flex flex-col'>
                            <span>{item.name}</span>
                            {(item.itemType === "ccu" && item.fromShipName && item.toShipName) && (
                              <Typography variant="caption" color="text.secondary">
                                {item.fromShipName} → {item.toShipName}
                              </Typography>
                            )}
                            {(item.itemType === "package" && (item.shipName || item.packageKind || item.insuranceType)) && (
                              <Typography variant="caption" color="text.secondary">
                                {[item.shipName, item.packageKind, item.insuranceType].filter(Boolean).join(" · ")}
                              </Typography>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={item.itemType} />
                        </TableCell>
                        <TableCell>{item.price.toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}</TableCell>
                        <TableCell>{item.stock}</TableCell>
                        <TableCell>
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            onClick={() => handleRemoveItem(item.skuId)}
                          >
                            <FormattedMessage id="hangar.remove" defaultMessage="Remove" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>

          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              <FormattedMessage id="hangar.addListing" defaultMessage="Add New Listing" />
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField
                select
                label={intl.formatMessage({ id: 'market.filter.type', defaultMessage: 'Item Type' })}
                value={manualItemType}
                onChange={(event) => setManualItemType(event.target.value as MarketItemType)}
              >
                <MenuItem value="ccu">CCU</MenuItem>
                <MenuItem value="package">Package</MenuItem>
                <MenuItem value="misc">Misc</MenuItem>
              </TextField>

              {manualItemType === "package" && (
                <TextField
                  select
                  label={intl.formatMessage({ id: 'market.packageKind', defaultMessage: 'Package Kind' })}
                  value={manualPackageKind}
                  onChange={(event) => setManualPackageKind(event.target.value as "standalone_ship" | "bundle")}
                >
                  <MenuItem value="standalone_ship">
                    {intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' })}
                  </MenuItem>
                  <MenuItem value="bundle">
                    {intl.formatMessage({ id: 'market.filter.bundle', defaultMessage: 'Bundle' })}
                  </MenuItem>
                </TextField>
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
                        label={intl.formatMessage({ id: 'hangar.fromShip', defaultMessage: 'From Ship' })}
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
                        label={intl.formatMessage({ id: 'hangar.toShip', defaultMessage: 'To Ship' })}
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
                      label={intl.formatMessage({ id: 'market.primaryShip', defaultMessage: 'Primary Ship' })}
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
                        label={intl.formatMessage({ id: 'market.packageShips', defaultMessage: 'Bundle Ships' })}
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
                        label={intl.formatMessage({ id: 'market.primaryShip', defaultMessage: 'Primary Ship' })}
                      />
                    )}
                  />
                </>
              )}

              <TextField
                label={intl.formatMessage({ id: 'hangar.itemName', defaultMessage: 'Item Name' })}
                value={manualItemName}
                onChange={(event) => setManualItemName(event.target.value)}
              />

              <TextField
                label={intl.formatMessage({ id: 'hangar.price', defaultMessage: 'Price' })}
                type="number"
                value={manualItemPrice}
                onChange={(event) => setManualItemPrice(Number(event.target.value))}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />

              <TextField
                label={intl.formatMessage({ id: 'hangar.quantity', defaultMessage: 'Quantity' })}
                type="number"
                value={manualItemQuantity}
                onChange={(event) => setManualItemQuantity(Number(event.target.value))}
                InputProps={{
                  inputProps: { min: 1 }
                }}
              />

              {manualItemType === "package" && (
                <TextField
                  label={intl.formatMessage({ id: 'market.insurance', defaultMessage: 'Insurance' })}
                  value={manualInsuranceType}
                  onChange={(event) => setManualInsuranceType(event.target.value)}
                />
              )}

              {(manualItemType === "package" || manualItemType === "misc") && (
                <TextField
                  label={intl.formatMessage({ id: 'market.imageUrl', defaultMessage: 'Image URL' })}
                  value={manualImageUrl}
                  onChange={(event) => setManualImageUrl(event.target.value)}
                />
              )}

              {(manualItemType === "package" && manualPackageKind === "bundle") && (
                <TextField
                  multiline
                  minRows={4}
                  label={intl.formatMessage({ id: 'market.packageItems', defaultMessage: 'Bundle Extra Items (one per line)' })}
                  value={manualPackageItemsText}
                  onChange={(event) => setManualPackageItemsText(event.target.value)}
                  sx={{ gridColumn: { md: '1 / span 2' } }}
                />
              )}

              {(manualItemType === "package" || manualItemType === "misc") && (
                <TextField
                  multiline
                  minRows={3}
                  label={intl.formatMessage({ id: 'market.description', defaultMessage: 'Description' })}
                  value={manualDescription}
                  onChange={(event) => setManualDescription(event.target.value)}
                  sx={{ gridColumn: { md: '1 / span 2' } }}
                />
              )}

              {manualItemType === "misc" && (
                <TextField
                  label={intl.formatMessage({ id: 'market.externalRef', defaultMessage: 'External Ref' })}
                  value={manualExternalRef}
                  onChange={(event) => setManualExternalRef(event.target.value)}
                />
              )}

              <FormGroup row sx={{ gridColumn: { md: '1 / span 2' }, gap: 2 }}>
                <FormControlLabel
                  control={<Checkbox checked={manualCanGift} onChange={(event) => setManualCanGift(event.target.checked)} />}
                  label={intl.formatMessage({ id: 'market.canGift', defaultMessage: 'Giftable' })}
                />
                <FormControlLabel
                  control={<Checkbox checked={manualIsBuyBack} onChange={(event) => setManualIsBuyBack(event.target.checked)} />}
                  label={intl.formatMessage({ id: 'market.filter.buyback', defaultMessage: 'Buyback' })}
                />
              </FormGroup>
            </Box>

            <Button
              variant="contained"
              startIcon={<PlusCircle />}
              onClick={handleManualAdd}
              disabled={!canSubmitManualItem}
              sx={{ mt: 2 }}
            >
              <FormattedMessage id="hangar.addItem" defaultMessage="Add Item" />
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseManageListingDialog}>
            <FormattedMessage id="close" defaultMessage="Close" />
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
