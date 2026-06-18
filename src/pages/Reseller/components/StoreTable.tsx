import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { ChevronsRight, Copy, PlusCircle, Search } from "lucide-react";
import Crawler from "@/components/Crawler";
import UserSelector from "@/components/UserSelector";
import { getMarketItemVisual, MARKET_ITEM_PLACEHOLDER } from "@/components/marketItemDisplay";
import {
  ListingItem,
  MarketBrowseCategory,
  MarketListPagination,
  MarketListResponse,
  MarketItemType,
  MarketPackageKind,
  Ship,
} from "@/types";
import {
  buildInventoryItems,
  getInventorySearchText,
  getListingDisplayType,
  StoreInventoryItem,
  StoreListingDisplayType,
} from "./storeListingUtils";
import { getMarketBrowseCategoryLabel, getMarketTagLabel } from "@/pages/Market/marketI18n";
import { resolveMarketImageUrls } from "@/utils/marketImages";
import { getMarketDetailUrl } from "@/utils/marketLinks";
import ResellerImagePicker from "./ResellerImagePicker";

const DEFAULT_MANUAL_ITEM_TYPE: MarketItemType = "ccu";
const DEFAULT_PACKAGE_KIND: MarketPackageKind = "standalone_ship";

function createEmptyListingPagination(limit: number): MarketListPagination {
  return {
    total: 0,
    page: 0,
    limit,
    totalPages: 0,
  };
}

type ManualPackageItemDraft = {
  id: string;
  itemName: string;
  itemKind: string;
  imageUrl: string;
};

type DisplayableMarketItem = StoreInventoryItem | ListingItem;
type ListingNotice = {
  severity: "success" | "error";
  message: string;
};

const twoLineClampSx = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
} as const;

function createManualPackageItemDraft(values?: Partial<Omit<ManualPackageItemDraft, "id">>): ManualPackageItemDraft {
  return {
    id: `manual-package-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    itemName: values?.itemName || "",
    itemKind: values?.itemKind || "",
    imageUrl: values?.imageUrl || "",
  };
}

function normalizeManualPackageItemImageUrl(value?: string) {
  const normalized = value?.trim() || "";
  return normalized === "https://robertsspaceindustries.com/undefined" ? "" : normalized;
}

function normalizeShipName(name?: string) {
  return (name || "").trim().toUpperCase();
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
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

  if (type === "ship_package") {
    return intl.formatMessage({ id: "market.filter.shipPackage", defaultMessage: "Ship Package" });
  }

  if (type === "paint") {
    return intl.formatMessage({ id: "market.filter.paint", defaultMessage: "Paint" });
  }

  if (type === "subscriber_store") {
    return intl.formatMessage({ id: "market.filter.subscriberStore", defaultMessage: "Subscriber Store" });
  }

  if (type === "other") {
    return intl.formatMessage({ id: "market.filter.other", defaultMessage: "Other" });
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

  if (sourceKind === "rsi-concierge-paint-sync") {
    return intl.formatMessage({ id: "market.sourceKind.conciergePaintSync", defaultMessage: "Concierge paint sync" });
  }

  if (sourceKind === "rsi-subscriber-store-sync") {
    return intl.formatMessage({ id: "market.sourceKind.subscriberStoreSync", defaultMessage: "Subscriber store sync" });
  }

  return sourceKind || "";
}

function getInventoryOptionMeta(item: StoreInventoryItem) {
  const ownerText = item.ownerLabels.join(", ");
  return `x${item.stock}${ownerText ? ` | ${ownerText}` : ""}`;
}

function getInventorySubtitle(item: DisplayableMarketItem, intl: IntlShape) {
  if (item.itemType === "ccu") {
    return `${item.fromShipName || "-"} -> ${item.toShipName || "-"}`;
  }

  if (item.packageKind === "bundle") {
    const shipCount = item.packageShips?.length || 0;
    const extraCount = item.packageItems?.length || 0;

    return [
      intl.formatMessage(
        { id: "market.detail.shipCount", defaultMessage: "{count, plural, one {# ship} other {# ships}}" },
        { count: shipCount },
      ),
      intl.formatMessage(
        { id: "market.detail.extraCount", defaultMessage: "{count, plural, one {# extra} other {# extras}}" },
        { count: extraCount },
      ),
    ].join(" · ");
  }

  return item.shipName || item.packageShips?.[0]?.shipName || item.name;
}

function MarketItemMedia({
  item,
  ships,
  compact = false,
  height = compact ? 88 : 180,
  showNameOverlay = false,
}: {
  item: DisplayableMarketItem;
  ships: Ship[];
  compact?: boolean;
  height?: number;
  showNameOverlay?: boolean;
}) {
  const visual = getMarketItemVisual(item, ships, { imageVariant: compact ? "thumbLarge" : "slideshow" });

  if (item.itemType === "ccu") {
    return (
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height,
          overflow: "hidden",
          bgcolor: "action.hover",
        }}
      >
        <Box
          component="img"
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            width: compact ? "38%" : "35%",
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
            width: compact ? "62%" : "65%",
            height: "100%",
            objectFit: "cover",
            boxShadow: "0 0 20px 0 rgba(0, 0, 0, 0.2)",
          }}
          src={visual.toImage || MARKET_ITEM_PLACEHOLDER}
          alt={visual.toShipName || item.name}
        />
        {showNameOverlay && (
          <Box sx={{ position: "absolute", inset: "auto 0 0 0", p: compact ? 0.75 : 1, bgcolor: "rgba(0,0,0,0.55)", textAlign: "center" }}>
            <Typography variant={compact ? "caption" : "body2"} sx={{ color: "#fff", fontWeight: 600 }}>
              {item.name}
            </Typography>
          </Box>
        )}
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: compact ? "38%" : "35%",
            transform: "translate(-50%, -50%)",
            color: "#fff",
            display: "flex",
          }}
        >
          <ChevronsRight size={compact ? 22 : 30} />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      sx={{ width: "100%", height, objectFit: "cover", display: "block" }}
      src={visual.thumbnail || MARKET_ITEM_PLACEHOLDER}
      alt={item.name}
    />
  );
}

type SelectedPrefillItemCardProps = {
  item: StoreInventoryItem | null;
  ships: Ship[];
  intl: IntlShape;
};

const SelectedPrefillItemCard = memo(function SelectedPrefillItemCard({
  item,
  ships,
  intl,
}: SelectedPrefillItemCardProps) {
  if (!item) {
    return (
      <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 1, p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          <FormattedMessage
            id="market.prefillSelectionHint"
            defaultMessage="Select a hangar item below if you want to prefill this listing."
          />
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
        <FormattedMessage id="market.prefillSelectedItem" defaultMessage="Selected Hangar Item" />
      </Typography>
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 2 }}>
        <Box sx={{ width: { xs: "100%", md: 240 }, flexShrink: 0 }}>
          <MarketItemMedia item={item} ships={ships} compact height={132} />
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={twoLineClampSx}>
                {item.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={twoLineClampSx}>
                {getInventorySubtitle(item, intl)}
              </Typography>
            </Box>
            <Typography variant="body2" color="primary" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
              {item.price.toLocaleString(intl.locale, { style: "currency", currency: "USD" })}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Chip size="small" label={getDisplayTypeLabel(item.displayType, intl)} />
            <Chip
              size="small"
              color={item.canGift ? "success" : "warning"}
              label={item.canGift
                ? intl.formatMessage({ id: "ccuPlanner.canGift", defaultMessage: "Giftable" })
                : intl.formatMessage({ id: "market.notGiftable", defaultMessage: "Not giftable" })}
            />
            {item.isBuyBack && (
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                label={intl.formatMessage({ id: "market.prefillBuybackShort", defaultMessage: "Buyback" })}
              />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {getInventoryOptionMeta(item)}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
});

type PrefillInventoryCardProps = {
  item: StoreInventoryItem;
  isSelected: boolean;
  ships: Ship[];
  intl: IntlShape;
  onSelect: (item: StoreInventoryItem) => void;
};

const PrefillInventoryCard = memo(function PrefillInventoryCard({
  item,
  isSelected,
  ships,
  intl,
  onSelect,
}: PrefillInventoryCardProps) {
  const handleSelect = useCallback(() => {
    onSelect(item);
  }, [item, onSelect]);

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleSelect();
        }
      }}
      sx={{
        border: "1px solid",
        borderColor: isSelected ? "primary.main" : "divider",
        bgcolor: isSelected ? "action.selected" : "background.paper",
        borderRadius: 1,
        p: 1.25,
        cursor: "pointer",
        transition: "border-color 0.2s ease, background-color 0.2s ease",
      }}
    >
      <Box sx={{ display: "flex", gap: 1.25, alignItems: "flex-start" }}>
        <Box sx={{ width: { xs: 120, sm: 136 }, flexShrink: 0 }}>
          <MarketItemMedia item={item} ships={ships} compact height={84} />
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ ...twoLineClampSx, flex: 1, minWidth: 0 }}>
              {item.name}
            </Typography>
            <Typography variant="body2" color="primary" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
              {item.price.toLocaleString(intl.locale, { style: "currency", currency: "USD" })}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={twoLineClampSx}>
            {getInventorySubtitle(item, intl)}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Chip size="small" label={getDisplayTypeLabel(item.displayType, intl)} />
            <Chip
              size="small"
              color={item.canGift ? "success" : "warning"}
              label={item.canGift
                ? intl.formatMessage({ id: "ccuPlanner.canGift", defaultMessage: "Giftable" })
                : intl.formatMessage({ id: "market.notGiftable", defaultMessage: "Not giftable" })}
            />
            {item.isBuyBack && (
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                label={intl.formatMessage({ id: "market.prefillBuybackShort", defaultMessage: "Buyback" })}
              />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {getInventoryOptionMeta(item)}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
});

type PrefillInventoryGridProps = {
  items: StoreInventoryItem[];
  selectedSourceKey?: string;
  ships: Ship[];
  intl: IntlShape;
  onSelect: (item: StoreInventoryItem) => void;
};

const PrefillInventoryGrid = memo(function PrefillInventoryGrid({
  items,
  selectedSourceKey,
  ships,
  intl,
  onSelect,
}: PrefillInventoryGridProps) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2, maxHeight: 420, overflowY: "auto" }}>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          <FormattedMessage id="hangar.noEquipment" defaultMessage="No sharable content in your hangar" />
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, minmax(0, 1fr))",
              xl: "repeat(3, minmax(0, 1fr))",
            },
            gap: 1.25,
          }}
        >
          {items.map((item) => (
            <PrefillInventoryCard
              key={item.sourceKey}
              item={item}
              isSelected={selectedSourceKey === item.sourceKey}
              ships={ships}
              intl={intl}
              onSelect={onSelect}
            />
          ))}
        </Box>
      )}
    </Box>
  );
});

export default function StoreTable({ ships }: { ships: Ship[] }) {
  const intl = useIntl();
  const { token, id } = useSelector((state: RootState) => state.user.user);
  const { users } = useSelector((state: RootState) => state.upgrades);
  const items = useSelector(selectUsersHangarItems);
  const allItemPrices = useSelector((state: RootState) => state.share?.allItemPrices || {});

  const [listingItems, setListingItems] = useState<ListingItem[]>([]);
  const [listingPagination, setListingPagination] = useState<MarketListPagination>(() => createEmptyListingPagination(10));
  const [listingFetchError, setListingFetchError] = useState<string | null>(null);
  const [listingNotice, setListingNotice] = useState<ListingNotice | null>(null);
  const [isListingLoading, setIsListingLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showCcus, setShowCcus] = useState(true);
  const [showStandaloneShips, setShowStandaloneShips] = useState(true);
  const [showShipPackages, setShowShipPackages] = useState(true);
  const [showPaints, setShowPaints] = useState(true);
  const [showSubscriberStore, setShowSubscriberStore] = useState(true);
  const [showOthers, setShowOthers] = useState(true);
  const [showCredits, setShowCredits] = useState(true);
  const [isAdjustStockDialogOpen, setIsAdjustStockDialogOpen] = useState(false);
  const [adjustStockTarget, setAdjustStockTarget] = useState<ListingItem | null>(null);
  const [adjustStockDeltaInput, setAdjustStockDeltaInput] = useState("0");
  const [isAdjustStockSubmitting, setIsAdjustStockSubmitting] = useState(false);

  const [isCreateListingDialogOpen, setIsCreateListingDialogOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<ListingItem | null>(null);
  const [selectedSourceItem, setSelectedSourceItem] = useState<StoreInventoryItem | null>(null);
  const [prefillSearchTerm, setPrefillSearchTerm] = useState("");
  const [prefillGiftableOnly, setPrefillGiftableOnly] = useState(true);
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
  const [manualVisibleInMarket, setManualVisibleInMarket] = useState(true);
  const [manualInsuranceType, setManualInsuranceType] = useState("");
  const [manualOcTag, setManualOcTag] = useState(false);
  const [manualPackageItems, setManualPackageItems] = useState<ManualPackageItemDraft[]>([]);
  const [manualDescription, setManualDescription] = useState("");
  const [manualImageUrls, setManualImageUrls] = useState<string[]>([]);
  const [manualExternalRef, setManualExternalRef] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const inventoryItems = useMemo(() => buildInventoryItems({
    ccus: items.ccus,
    ships: items.ships,
    bundles: items.bundles,
    marketShips: ships,
    users,
    allItemPrices,
  }), [allItemPrices, items.bundles, items.ccus, items.ships, ships, users]);

  const listingFilters = useMemo(() => {
    const itemTypes: MarketItemType[] = [];
    const browseCategories: MarketBrowseCategory[] = [];

    if (showCcus) {
      itemTypes.push("ccu");
    }

    if (showCredits) {
      itemTypes.push("credit");
    }

    if (showStandaloneShips) {
      browseCategories.push("standalone_ship");
    }

    if (showShipPackages) {
      browseCategories.push("ship_package");
    }

    if (showPaints) {
      browseCategories.push("paint");
    }

    if (showSubscriberStore) {
      browseCategories.push("subscriber_store");
    }

    if (showOthers) {
      browseCategories.push("other");
    }

    return {
      itemTypes,
      browseCategories,
      hasSelectedFilters: itemTypes.length > 0 || browseCategories.length > 0,
      shouldCombineTypeFiltersWithOr: itemTypes.length > 0 && browseCategories.length > 0,
    };
  }, [showCcus, showCredits, showOthers, showPaints, showShipPackages, showStandaloneShips, showSubscriberStore]);

  const fetchListingItems = useCallback(async (signal?: AbortSignal) => {
    if (!id || !listingFilters.hasSelectedFilters) {
      setListingItems([]);
      setListingPagination(createEmptyListingPagination(rowsPerPage));
      setListingFetchError(null);
      setIsListingLoading(false);
      return;
    }

    setIsListingLoading(true);

    try {
      const searchParams = new URLSearchParams({
        groupCcus: "false",
        page: String(page),
        limit: String(rowsPerPage),
      });
      const trimmedSearch = deferredSearchTerm.trim();

      if (trimmedSearch) {
        searchParams.set("search", trimmedSearch);
      }

      listingFilters.itemTypes.forEach((itemType) => {
        searchParams.append("itemType", itemType);
      });
      listingFilters.browseCategories.forEach((browseCategory) => {
        searchParams.append("browseCategory", browseCategory);
      });

      if (listingFilters.shouldCombineTypeFiltersWithOr) {
        searchParams.set("combineTypeFiltersWithOr", "true");
      }

      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/my/search?${searchParams.toString()}`, {
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Unexpected response: ${response.status}`);
      }

      const data = await response.json() as MarketListResponse;
      if (signal?.aborted) {
        return;
      }

      setListingItems(((data.items || []) as ListingItem[]).map((listingItem) => ({
        ...listingItem,
        belongsTo: listingItem.belongsTo || id,
      })));
      setListingPagination(data.pagination || createEmptyListingPagination(rowsPerPage));
      setListingFetchError(null);
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }

      console.error("Failed to fetch listings:", error);
      setListingFetchError(intl.formatMessage({
        id: "hangar.fetchListingsFailed",
        defaultMessage: "Failed to fetch current listings",
      }));
    } finally {
      if (!signal?.aborted) {
        setIsListingLoading(false);
      }
    }
  }, [deferredSearchTerm, id, intl, listingFilters, page, rowsPerPage, token]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchListingItems(controller.signal);

    return () => controller.abort();
  }, [fetchListingItems]);

  useEffect(() => {
    if (listingPagination.totalPages > 0 && page > listingPagination.totalPages - 1) {
      setPage(listingPagination.totalPages - 1);
    }
  }, [listingPagination.totalPages, page]);

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
    setEditingListing(null);
    setSelectedSourceItem(null);
    setPrefillSearchTerm("");
    setPrefillGiftableOnly(true);
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
    setManualVisibleInMarket(true);
    setManualInsuranceType("");
    setManualOcTag(false);
    setManualPackageItems([]);
    setManualDescription("");
    setManualImageUrls([]);
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
    setManualVisibleInMarket(true);
    setManualInsuranceType(item.insuranceType || "");
    setManualOcTag(Boolean(item.tags?.includes('oc')));
    setManualPackageItems((item.packageItems || []).map((entry) => createManualPackageItemDraft({
      itemName: entry.itemName,
      itemKind: entry.itemKind || "",
      imageUrl: normalizeManualPackageItemImageUrl(entry.imageUrl),
    })));
    setManualDescription("");
    setManualImageUrls(resolveMarketImageUrls(item.imageUrl, item.imageUrls));
    setManualExternalRef("");
  }, [resolveShip]);

  const applyListingItemToForm = useCallback((item: ListingItem) => {
    const resolvedPackageShips = (item.packageShips || [])
      .map((ship) => resolveShip(ship.shipId, ship.shipName))
      .filter((ship): ship is Ship => ship !== null);
    const resolvedPrimaryShip = resolveShip(item.shipId, item.shipName) || resolvedPackageShips[0] || null;

    setSelectedSourceItem(null);
    setPrefillSearchTerm("");
    setPrefillGiftableOnly(true);
    setManualItemType(item.itemType === "credit" ? DEFAULT_MANUAL_ITEM_TYPE : item.itemType);
    setManualPackageKind(
      item.itemType === "package"
        ? ((item.packageKind as MarketPackageKind | undefined) || DEFAULT_PACKAGE_KIND)
        : DEFAULT_PACKAGE_KIND,
    );
    setSelectedFromShip(resolveShip(item.fromShipId, item.fromShipName));
    setSelectedToShip(resolveShip(item.toShipId, item.toShipName));
    setSelectedPrimaryShip(resolvedPrimaryShip);
    setSelectedPackageShips(
      item.itemType === "package" && item.packageKind === "bundle"
        ? resolvedPackageShips
        : (resolvedPrimaryShip ? [resolvedPrimaryShip] : resolvedPackageShips)
    );
    setManualItemName(item.name);
    setManualItemPrice(item.price);
    setManualItemCost(item.cost ?? item.price);
    setManualItemCostTouched(false);
    setManualItemQuantity(Math.max(item.stock - item.lockedStock, 0));
    setManualVisibleInMarket(item.visibleInMarket !== false);
    setManualInsuranceType(item.insuranceType || "");
    setManualOcTag(Boolean(item.tags?.includes("oc")));
    setManualPackageItems((item.packageItems || []).map((entry) => createManualPackageItemDraft({
      itemName: entry.itemName,
      itemKind: entry.itemKind || "",
      imageUrl: normalizeManualPackageItemImageUrl(entry.imageUrl),
    })));
    setManualDescription(item.description || "");
    setManualImageUrls(resolveMarketImageUrls(item.imageUrl, item.imageUrls));
    setManualExternalRef(item.externalRef || "");
  }, [resolveShip]);

  const filteredInventoryItems = useMemo(() => {
    const search = prefillSearchTerm.trim().toLowerCase();

    return inventoryItems.filter((item) => {
      if (prefillGiftableOnly && !item.canGift) {
        return false;
      }

      if (!search) {
        return true;
      }

      return getInventorySearchText(item).includes(search);
    });
  }, [inventoryItems, prefillGiftableOnly, prefillSearchTerm]);

  const parseManualPackageItems = useCallback(() => {
    return manualPackageItems
      .map((entry, index) => {
        const itemName = entry.itemName.trim();
        const itemKind = entry.itemKind.trim();
        const imageUrl = normalizeManualPackageItemImageUrl(entry.imageUrl);

        if (!itemName) {
          return null;
        }

        return {
          itemName,
          itemKind: itemKind || undefined as string | undefined,
          imageUrl: imageUrl || undefined as string | undefined,
          withImage: Boolean(imageUrl),
          sortOrder: index + 1,
        };
      })
      .filter((entry) => entry !== null);
  }, [manualPackageItems]);

  const canAssignOcTag = useMemo(() => {
    if (manualItemType !== 'package') {
      return false;
    }

    const browseCategory: MarketBrowseCategory | null = manualPackageKind === 'standalone_ship'
      ? 'standalone_ship'
      : selectedPackageShips.length > 0
        ? 'ship_package'
        : manualPackageItems.length > 0
          ? null
          : 'ship_package';

    return browseCategory === 'standalone_ship' || browseCategory === 'ship_package';
  }, [manualItemType, manualPackageItems.length, manualPackageKind, selectedPackageShips.length]);

  const handleAddManualPackageItem = useCallback(() => {
    setManualPackageItems((current) => [...current, createManualPackageItemDraft()]);
  }, []);

  const handleUpdateManualPackageItem = useCallback((
    itemId: string,
    field: keyof Omit<ManualPackageItemDraft, "id">,
    value: string,
  ) => {
    setManualPackageItems((current) => current.map((entry) => (
      entry.id === itemId
        ? { ...entry, [field]: value }
        : entry
    )));
  }, []);

  const handleRemoveManualPackageItem = useCallback((itemId: string) => {
    setManualPackageItems((current) => current.filter((entry) => entry.id !== itemId));
  }, []);

  const handleOpenCreateListingDialog = () => {
    resetManualFormFields();
    setIsCreateListingDialogOpen(true);
  };

  const handleOpenEditListingDialog = useCallback((item: ListingItem) => {
    resetManualFormFields();
    setEditingListing(item);
    applyListingItemToForm(item);
    setIsCreateListingDialogOpen(true);
  }, [applyListingItemToForm, resetManualFormFields]);

  const handleCloseCreateListingDialog = () => {
    setIsCreateListingDialogOpen(false);
    resetManualFormFields();
  };

  const handleSelectSourceItem = useCallback((item: StoreInventoryItem | null) => {
    setSelectedSourceItem(item);

    if (item) {
      applyInventoryItemToForm(item);
    }
  }, [applyInventoryItemToForm]);

  const handleClearSourceItem = useCallback(() => {
    handleSelectSourceItem(null);
  }, [handleSelectSourceItem]);

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

  const handleCopyListingUrl = useCallback(async (skuId: string) => {
    try {
      await copyTextToClipboard(getMarketDetailUrl(skuId));
      setListingNotice({
        severity: "success",
        message: intl.formatMessage({
          id: "market.copyListingUrlSuccess",
          defaultMessage: "Product URL copied to clipboard.",
        }),
      });
    } catch (error) {
      console.error("Failed to copy listing URL:", error);
      setListingNotice({
        severity: "error",
        message: intl.formatMessage({
          id: "market.copyListingUrlFailed",
          defaultMessage: "Failed to copy product URL.",
        }),
      });
    }
  }, [intl]);

  const handleOpenAdjustStockDialog = useCallback((item: ListingItem) => {
    setAdjustStockTarget(item);
    setAdjustStockDeltaInput("0");
    setIsAdjustStockDialogOpen(true);
  }, []);

  const handleCloseAdjustStockDialog = useCallback(() => {
    if (isAdjustStockSubmitting) {
      return;
    }

    setIsAdjustStockDialogOpen(false);
    setAdjustStockTarget(null);
    setAdjustStockDeltaInput("0");
  }, [isAdjustStockSubmitting]);

  const adjustStockDelta = Number(adjustStockDeltaInput);
  const projectedStock = adjustStockTarget ? adjustStockTarget.stock + adjustStockDelta : null;
  const canSubmitStockAdjustment = Boolean(
    token
    && adjustStockTarget
    && Number.isInteger(adjustStockDelta)
    && adjustStockDelta !== 0
    && projectedStock !== null
    && projectedStock >= 0
    && projectedStock >= adjustStockTarget.lockedStock,
  );

  const handleAdjustStock = useCallback(async () => {
    if (!token || !adjustStockTarget) {
      return;
    }

    const delta = Number(adjustStockDeltaInput);

    if (!Number.isInteger(delta) || delta === 0) {
      return;
    }

    setIsAdjustStockSubmitting(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
        method: "PUT",
        body: JSON.stringify({
          skuId: adjustStockTarget.skuId,
          delta,
        }),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : intl.formatMessage({
              id: "market.adjustStockFailed",
              defaultMessage: "Failed to adjust stock",
            }),
        );
      }

      setListingFetchError(null);
      await fetchListingItems();
      handleCloseAdjustStockDialog();
    } catch (error) {
      console.error("Failed to adjust stock:", error);
      setListingFetchError(
        error instanceof Error
          ? error.message
          : intl.formatMessage({
            id: "market.adjustStockFailed",
            defaultMessage: "Failed to adjust stock",
          }),
      );
    } finally {
      setIsAdjustStockSubmitting(false);
    }
  }, [adjustStockDeltaInput, adjustStockTarget, fetchListingItems, handleCloseAdjustStockDialog, intl, token]);

  const canSubmitManualItem = useMemo(() => {
    if (!manualItemName.trim() || manualItemPrice <= 0 || manualItemQuantity <= 0) return false;

    if (manualItemType === "ccu") {
      return Boolean(selectedFromShip && selectedToShip && selectedFromShip.id !== selectedToShip.id);
    }

    if (manualItemType === "package") {
      if (manualPackageKind === "standalone_ship") {
        return Boolean(selectedPrimaryShip);
      }

      return true;
    }

    return true;
  }, [manualItemName, manualItemPrice, manualItemQuantity, manualItemType, manualPackageKind, selectedFromShip, selectedPrimaryShip, selectedToShip]);

  const editingRequiresReplacement = Boolean(editingListing);
  const editingLockedStock = editingListing?.lockedStock || 0;
  const editingAvailableStock = editingListing ? Math.max(editingListing.stock - editingLockedStock, 0) : null;

  const buildManualListingPayload = useCallback(() => {
    const basePayload = {
      name: manualItemName.trim(),
      price: manualItemPrice,
      cost: manualItemCostTouched || selectedSourceItem ? manualItemCost : manualItemPrice,
      stock: manualItemQuantity,
      sourceKind: selectedSourceItem ? "hangar" : "manual",
      visibleInMarket: manualVisibleInMarket,
      tags: canAssignOcTag && manualOcTag ? ["oc"] : [],
      ...(editingListing ? { replaceSkuId: editingListing.skuId } : {}),
    };

    if (manualItemType === "ccu") {
      if (!selectedFromShip || !selectedToShip || selectedFromShip.id === selectedToShip.id) {
        return null;
      }

      return {
        ...basePayload,
        itemType: "ccu" as const,
        fromShipId: selectedFromShip.id,
        toShipId: selectedToShip.id,
        fromShipName: selectedFromShip.name,
        toShipName: selectedToShip.name,
        rsiName: basePayload.name,
      };
    }

    if (manualItemType === "package") {
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

      if (manualPackageKind === "standalone_ship" && (!packageShips.length || !primaryShip)) {
        return null;
      }

      return {
        ...basePayload,
        itemType: "package" as const,
        shipId: primaryShip?.id,
        primaryShipId: primaryShip?.id,
        primaryShipName: primaryShip?.name,
        packageKind: manualPackageKind,
        insuranceType: manualInsuranceType || undefined,
        packageShips,
        packageItems: manualPackageKind === "bundle" ? parseManualPackageItems() : [],
        imageUrl: manualImageUrls[0] || undefined,
        imageUrls: manualImageUrls,
        description: manualDescription || undefined,
      };
    }

    return {
      ...basePayload,
      itemType: "misc" as const,
      imageUrl: manualImageUrls[0] || undefined,
      imageUrls: manualImageUrls,
      description: manualDescription || undefined,
      externalRef: manualExternalRef || undefined,
    };
  }, [
    canAssignOcTag,
    editingListing,
    manualDescription,
    manualExternalRef,
    manualImageUrls,
    manualInsuranceType,
    manualItemCost,
    manualItemCostTouched,
    manualItemName,
    manualItemPrice,
    manualItemQuantity,
    manualItemType,
    manualOcTag,
    manualPackageKind,
    manualVisibleInMarket,
    parseManualPackageItems,
    selectedFromShip,
    selectedPackageShips,
    selectedPrimaryShip,
    selectedSourceItem,
    selectedToShip,
  ]);

  const handleCreateListing = useCallback(async () => {
    if (!token || !canSubmitManualItem) {
      return;
    }

    const payload = buildManualListingPayload();
    if (!payload) {
      return;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const responsePayload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof responsePayload?.error === "string"
            ? responsePayload.error
            : `Unexpected response: ${response.status}`,
        );
      }

      setListingFetchError(null);
      await fetchListingItems();
      handleCloseCreateListingDialog();
    } catch (error) {
      console.error(`Failed to ${editingListing ? "replace" : "create"} listing:`, error);
      setListingFetchError(
        error instanceof Error
          ? error.message
          : intl.formatMessage({
            id: editingListing ? "market.replaceListingFailed" : "hangar.createListingFailed",
            defaultMessage: editingListing ? "Failed to replace listing" : "Failed to create listing",
          }),
      );
    }
  }, [buildManualListingPayload, canSubmitManualItem, editingListing, fetchListingItems, handleCloseCreateListingDialog, intl, token]);

  return (
    <div className="relative sm:pt-24">
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
            control={<Checkbox checked={showCcus} onChange={(event) => {
              setShowCcus(event.target.checked);
              setPage(0);
            }} size="small" />}
            label={intl.formatMessage({ id: "market.filter.ccu", defaultMessage: "CCU" })}
          />
          <FormControlLabel
            control={<Checkbox checked={showStandaloneShips} onChange={(event) => {
              setShowStandaloneShips(event.target.checked);
              setPage(0);
            }} size="small" />}
            label={intl.formatMessage({ id: "market.filter.standaloneShip", defaultMessage: "Standalone Ship" })}
          />
          <FormControlLabel
            control={<Checkbox checked={showShipPackages} onChange={(event) => {
              setShowShipPackages(event.target.checked);
              setPage(0);
            }} size="small" />}
            label={intl.formatMessage({ id: "market.filter.shipPackage", defaultMessage: "Ship Package" })}
          />
          <FormControlLabel
            control={<Checkbox checked={showPaints} onChange={(event) => {
              setShowPaints(event.target.checked);
              setPage(0);
            }} size="small" />}
            label={intl.formatMessage({ id: "market.filter.paint", defaultMessage: "Paint" })}
          />
          <FormControlLabel
            control={<Checkbox checked={showSubscriberStore} onChange={(event) => {
              setShowSubscriberStore(event.target.checked);
              setPage(0);
            }} size="small" />}
            label={intl.formatMessage({ id: "market.filter.subscriberStore", defaultMessage: "Subscriber Store" })}
          />
          <FormControlLabel
            control={<Checkbox checked={showOthers} onChange={(event) => {
              setShowOthers(event.target.checked);
              setPage(0);
            }} size="small" />}
            label={intl.formatMessage({ id: "market.filter.other", defaultMessage: "Other" })}
          />
          <FormControlLabel
            control={<Checkbox checked={showCredits} onChange={(event) => {
              setShowCredits(event.target.checked);
              setPage(0);
            }} size="small" />}
            label={intl.formatMessage({ id: "market.filter.credit", defaultMessage: "Credit" })}
          />
        </FormGroup>
      </Box>

      {listingFetchError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {listingFetchError}
        </Alert>
      )}

      {listingNotice && (
        <Alert severity={listingNotice.severity} sx={{ mb: 2 }} onClose={() => setListingNotice(null)}>
          {listingNotice.message}
        </Alert>
      )}

      {isListingLoading && listingItems.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="h6">
            <FormattedMessage id="loading" defaultMessage="Loading..." />
          </Typography>
        </Box>
      ) : listingItems.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="h6">
            <FormattedMessage id="hangar.noListings" defaultMessage="No items currently listed" />
          </Typography>
        </Box>
      ) : (
        <Box sx={{ width: "100%", overflow: "auto" }}>
          <TableContainer sx={{ mb: 2 }}>
            <Table
              size="small"
              aria-label={intl.formatMessage({ id: 'reseller.store.table.ariaLabel', defaultMessage: 'Store listings table' })}
              sx={{
                minWidth: 1080,
                "& .MuiTableCell-root": {
                  px: 1.5,
                  py: 1.25,
                  verticalAlign: "top",
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell width="220px">
                    <FormattedMessage id="hangar.image" defaultMessage="Image" />
                  </TableCell>
                  <TableCell>
                    <FormattedMessage id="hangar.details" defaultMessage="Details" />
                  </TableCell>
                  <TableCell width="140px">
                    <FormattedMessage id="hangar.type" defaultMessage="Type" />
                  </TableCell>
                  <TableCell width="120px">
                    <FormattedMessage id="hangar.price" defaultMessage="Price" />
                  </TableCell>
                  <TableCell width="120px">
                    <FormattedMessage id="market.cost" defaultMessage="Cost" />
                  </TableCell>
                  <TableCell width="150px">
                    <FormattedMessage id="hangar.quantity" defaultMessage="Quantity" />
                  </TableCell>
                  <TableCell width="280px">
                    <FormattedMessage id="hangar.action" defaultMessage="Action" />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {listingItems.map((item) => {
                  const displayType = getListingDisplayType(item);
                  const availableStock = Math.max(item.stock - item.lockedStock, 0);
                  const subtitle = getInventorySubtitle(item, intl);
                  const showSubtitle = subtitle !== item.name;
                  const packageMeta = item.itemType === "package"
                    ? [item.packageKind, item.insuranceType].filter(Boolean).join(" · ")
                    : "";
                  const supplementalText = [item.description, item.externalRef].filter(Boolean).join(" · ");

                  return (
                    <TableRow key={item.skuId} hover>
                      <TableCell>
                        <Box sx={{ width: 196 }}>
                          <MarketItemMedia item={item} ships={ships} compact height={104} />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight={700} sx={twoLineClampSx}>
                            {item.name}
                          </Typography>
                          {showSubtitle && (
                            <Typography variant="body2" color="text.secondary" sx={twoLineClampSx}>
                              {subtitle}
                            </Typography>
                          )}
                          {packageMeta && (
                            <Typography variant="caption" color="text.secondary" sx={twoLineClampSx}>
                              {packageMeta}
                            </Typography>
                          )}
                          {supplementalText && (
                            <Typography variant="caption" color="text.secondary" sx={twoLineClampSx}>
                              {supplementalText}
                            </Typography>
                          )}
                          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                            {item.sourceKind && (
                              <Chip size="small" variant="outlined" label={getSourceKindLabel(item.sourceKind, intl)} />
                            )}
                            {item.browseCategory && (
                              <Chip size="small" variant="outlined" label={getMarketBrowseCategoryLabel(intl, item.browseCategory)} />
                            )}
                            {item.visibleInMarket === false && (
                              <Chip
                                size="small"
                                variant="outlined"
                                label={intl.formatMessage({
                                  id: "market.listing.hiddenFromMarket",
                                  defaultMessage: "Hidden from market list",
                                })}
                              />
                            )}
                            {(item.tags || []).map((tag) => (
                              <Chip key={`${item.skuId}-${tag}`} size="small" color="warning" label={getMarketTagLabel(intl, tag)} />
                            ))}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Chip
                          size="small"
                          label={getDisplayTypeLabel(displayType, intl)}
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Typography variant="body2" color="primary" fontWeight={700}>
                          {item.price.toLocaleString(intl.locale, { style: "currency", currency: "USD" })}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={600}>
                          {typeof item.cost === "number"
                            ? item.cost.toLocaleString(intl.locale, { style: "currency", currency: "USD" })
                            : "-"}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
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
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", minWidth: 230 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleOpenEditListingDialog(item)}
                            disabled={item.itemType === "credit"}
                            sx={{ minWidth: 0 }}
                          >
                            <FormattedMessage id="common.edit" defaultMessage="Edit" />
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Copy size={14} />}
                            onClick={() => void handleCopyListingUrl(item.skuId)}
                            sx={{ minWidth: 0 }}
                          >
                            <FormattedMessage id="market.copyListingUrl" defaultMessage="Copy URL" />
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleOpenAdjustStockDialog(item)}
                            sx={{ minWidth: 0 }}
                          >
                            <FormattedMessage id="market.adjustStock" defaultMessage="Adjust Stock" />
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => handleRemoveItem(item.skuId)}
                            sx={{ minWidth: 0 }}
                          >
                            <FormattedMessage id="hangar.remove" defaultMessage="Remove" />
                          </Button>
                        </Box>
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
            count={listingPagination.total}
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
        fullScreen
      >
        <DialogTitle>
          {editingListing ? (
            <FormattedMessage id="market.editListing" defaultMessage="Edit Listing" />
          ) : (
            <FormattedMessage id="hangar.addListing" defaultMessage="Add Listing" />
          )}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 3 }}>
            {editingListing ? (
              <FormattedMessage
                id="market.replaceListingDescription"
                defaultMessage="Editing a listing will first take down the original SKU, then publish a new SKU with the updated information."
              />
            ) : (
              <FormattedMessage
                id="market.prefillFromHangarDescription"
                defaultMessage="Choose a hangar item to prefill the form, or leave it empty and fill the listing manually."
              />
            )}
          </DialogContentText>

          {editingRequiresReplacement && (
            <Alert
              severity="info"
              sx={{ mb: 3 }}
            >
              {editingLockedStock > 0
                ? intl.formatMessage({
                  id: "market.replaceListingLockedStockNotice",
                  defaultMessage: "Submitting this form will delist the original SKU and create a new SKU. Locked stock stays on the original SKU for existing orders, and the new SKU quantity defaults to the currently available stock ({stock}).",
                }, {
                  stock: editingAvailableStock ?? 0,
                })
                : intl.formatMessage({
                  id: "market.replaceListingNotice",
                  defaultMessage: "Submitting this form will delist the original SKU and create a new SKU with the updated product information.",
                })}
            </Alert>
          )}

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Box sx={{ gridColumn: { md: "1 / span 2" }, display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                <TextField
                  label={intl.formatMessage({ id: "market.prefillFromHangar", defaultMessage: "Prefill from Hangar" })}
                  placeholder={intl.formatMessage({ id: "market.prefillFromHangarPlaceholder", defaultMessage: "Search hangar items" })}
                  value={prefillSearchTerm}
                  onChange={(event) => setPrefillSearchTerm(event.target.value)}
                  sx={{ flexGrow: 1, minWidth: 260 }}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={prefillGiftableOnly}
                      onChange={(event) => setPrefillGiftableOnly(event.target.checked)}
                    />
                  )}
                  label={intl.formatMessage({ id: "market.prefillGiftableOnly", defaultMessage: "Giftable only" })}
                />
                {selectedSourceItem && (
                  <Button variant="outlined" onClick={handleClearSourceItem}>
                    <FormattedMessage id="market.prefillClearSelection" defaultMessage="Clear Selection" />
                  </Button>
                )}
              </Box>

              <SelectedPrefillItemCard
                item={selectedSourceItem}
                ships={ships}
                intl={intl}
              />

              <PrefillInventoryGrid
                items={filteredInventoryItems}
                selectedSourceKey={selectedSourceItem?.sourceKey}
                ships={ships}
                intl={intl}
                onSelect={handleSelectSourceItem}
              />
            </Box>

            {selectedSourceItem && (
              <Alert
                severity={!selectedSourceItem.canGift || selectedSourceItem.isBuyBack ? "warning" : "info"}
                sx={{ gridColumn: { md: "1 / span 2" } }}
              >
                {!selectedSourceItem.canGift
                  ? intl.formatMessage({
                    id: "market.prefillNotGiftableNotice",
                    defaultMessage: "This selected hangar item is not giftable. You can still list it, but it cannot be sent as a gift.",
                  })
                  : selectedSourceItem.isBuyBack
                    ? intl.formatMessage({
                      id: "market.prefillBuybackNotice",
                      defaultMessage: "This selected hangar item is a buyback item.",
                    })
                    : intl.formatMessage({
                      id: "market.prefillGiftableNotice",
                      defaultMessage: "This selected hangar item is giftable and can be used to prefill the listing.",
                    })}
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
                inputProps: { min: 0 },
              }}
            />

            <Box sx={{ display: "flex", alignItems: "center" }}>
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={manualVisibleInMarket}
                    onChange={(event) => setManualVisibleInMarket(event.target.checked)}
                  />
                )}
                label={intl.formatMessage({
                  id: "market.listing.visibleInMarket",
                  defaultMessage: "Show in market list",
                })}
              />
            </Box>

            {manualItemType === "package" && (
              <TextField
                label={intl.formatMessage({ id: "market.insurance", defaultMessage: "Insurance" })}
                value={manualInsuranceType}
                onChange={(event) => setManualInsuranceType(event.target.value)}
              />
            )}

            {manualItemType === "package" && (
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={manualOcTag}
                      disabled={!canAssignOcTag}
                      onChange={(event) => setManualOcTag(event.target.checked)}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: "market.tag.oc", defaultMessage: "OC" })}
                />
              </Box>
            )}

            {(manualItemType === "package" || manualItemType === "misc") && (
              <Box sx={{ gridColumn: { md: "1 / span 2" }, border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2 }}>
                <ResellerImagePicker
                  imageUrls={manualImageUrls}
                  onChange={setManualImageUrls}
                  ships={ships}
                  label={intl.formatMessage({ id: "reseller.imagePicker.label", defaultMessage: "Listing images" })}
                />
              </Box>
            )}

            {manualItemType === "package" && manualPackageKind === "bundle" && (
              <Box sx={{ gridColumn: { md: "1 / span 2" }, display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    <FormattedMessage id="market.packageItems" defaultMessage="Bundle Extra Items" />
                  </Typography>
                  <Button size="small" startIcon={<PlusCircle />} onClick={handleAddManualPackageItem}>
                    <FormattedMessage id="market.addPackageItem" defaultMessage="Add Extra Item" />
                  </Button>
                </Box>

                {manualPackageItems.length === 0 ? (
                  <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 1, px: 2, py: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      <FormattedMessage
                        id="market.packageItemsEmpty"
                        defaultMessage="No extra items added yet. Add rows for text-only items or items with images."
                      />
                    </Typography>
                  </Box>
                ) : (
                  manualPackageItems.map((entry, index) => (
                    <Box
                      key={entry.id}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        p: 2,
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                        gap: 1.5,
                      }}
                    >
                      <TextField
                        label={intl.formatMessage({ id: "market.packageItemName", defaultMessage: "Extra Item Name" })}
                        value={entry.itemName}
                        onChange={(event) => handleUpdateManualPackageItem(entry.id, "itemName", event.target.value)}
                      />
                      <TextField
                        label={intl.formatMessage({ id: "market.packageItemKind", defaultMessage: "Extra Item Kind" })}
                        value={entry.itemKind}
                        onChange={(event) => handleUpdateManualPackageItem(entry.id, "itemKind", event.target.value)}
                      />
                      <TextField
                        label={intl.formatMessage({ id: "market.packageItemImageUrl", defaultMessage: "Extra Item Image URL" })}
                        value={entry.imageUrl}
                        onChange={(event) => handleUpdateManualPackageItem(entry.id, "imageUrl", event.target.value)}
                        sx={{ gridColumn: { md: "1 / span 2" } }}
                        helperText={intl.formatMessage({
                          id: "market.packageItemImageUrlHelp",
                          defaultMessage: "Leave empty for text-only items.",
                        })}
                      />
                      <Box sx={{ gridColumn: { md: "1 / span 2" }, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                        <Typography variant="body2" color="text.secondary">
                          <FormattedMessage
                            id="market.packageItemRowLabel"
                            defaultMessage="Extra item #{index}"
                            values={{ index: index + 1 }}
                          />
                        </Typography>
                        <Button color="error" onClick={() => handleRemoveManualPackageItem(entry.id)}>
                          <FormattedMessage id="remove" defaultMessage="Remove" />
                        </Button>
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
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
            {editingListing ? (
              <FormattedMessage id="market.replaceListingAction" defaultMessage="Replace SKU" />
            ) : (
              <FormattedMessage id="hangar.addItem" defaultMessage="Add Item" />
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isAdjustStockDialogOpen}
        onClose={handleCloseAdjustStockDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          <FormattedMessage id="market.adjustStock" defaultMessage="Adjust Stock" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            <FormattedMessage
              id="market.adjustStockDescription"
              defaultMessage="Enter a positive number to add stock or a negative number to reduce stock. The server applies this as an atomic stock delta update."
            />
          </DialogContentText>

          {adjustStockTarget && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {adjustStockTarget.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage
                    id="market.listingStockBreakdown"
                    defaultMessage="Total {stock} / Locked {lockedStock}"
                    values={{ stock: adjustStockTarget.stock, lockedStock: adjustStockTarget.lockedStock }}
                  />
                </Typography>
                {projectedStock !== null && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    <FormattedMessage
                      id="market.adjustStockProjected"
                      defaultMessage="Projected total stock: {stock}"
                      values={{ stock: projectedStock }}
                    />
                  </Typography>
                )}
              </Box>

              <TextField
                label={intl.formatMessage({ id: "market.stockDelta", defaultMessage: "Stock Delta" })}
                type="number"
                value={adjustStockDeltaInput}
                onChange={(event) => setAdjustStockDeltaInput(event.target.value)}
                InputProps={{
                  inputProps: {
                    step: 1,
                    min: -Math.max(adjustStockTarget.stock - adjustStockTarget.lockedStock, 0),
                  },
                }}
                helperText={intl.formatMessage({
                  id: "market.stockDeltaHelp",
                  defaultMessage: "For example: 3 adds three units, -2 removes two units.",
                })}
              />

              {projectedStock !== null && projectedStock < 0 && (
                <Alert severity="warning">
                  <FormattedMessage
                    id="market.adjustStockNegativeWarning"
                    defaultMessage="Projected stock cannot be less than 0."
                  />
                </Alert>
              )}

              {projectedStock !== null && projectedStock < adjustStockTarget.lockedStock && (
                <Alert severity="warning">
                  <FormattedMessage
                    id="market.adjustStockLockedWarning"
                    defaultMessage="Projected stock cannot be lower than the currently locked quantity."
                  />
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAdjustStockDialog} disabled={isAdjustStockSubmitting}>
            <FormattedMessage id="cancel" defaultMessage="Cancel" />
          </Button>
          <Button
            onClick={handleAdjustStock}
            disabled={!canSubmitStockAdjustment || isAdjustStockSubmitting}
            variant="contained"
          >
            <FormattedMessage id="save" defaultMessage="Save" />
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
