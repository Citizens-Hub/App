import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
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
} from '@mui/material';
import { Pencil, PlusCircle, Search, Trash2 } from 'lucide-react';

import { RootState } from '@/store';
import { selectUsersHangarItems } from '@/store/upgradesStore';
import {
  AccountListingItem,
  AccountMarketDraft,
  AccountMarketDraftIssue,
  AccountMarketEntry,
  AccountMarketEntryKind,
  AccountMarketListResponse,
  MarketListPagination,
  Ship,
} from '@/types';
import UserSelector from '@/components/UserSelector';
import Crawler from '@/components/Crawler';
import {
  buildAccountMarketSourceSections,
  createAccountMarketHighlightEntry,
  doesHighlightReferenceEntry,
  getAccountEntryPrimaryLabel,
  getAccountEntryPreviewImage,
  getAccountMarketEntryShipDisplay,
} from '@/utils/accountMarketEntries';
import { formatMarketCcuResourceName } from '@/pages/Market/marketI18n';
import { resolveMarketImageUrls } from '@/utils/marketImages';
import ResellerImagePicker from './ResellerImagePicker';

function createEmptyListingPagination(limit: number): MarketListPagination {
  return {
    total: 0,
    page: 0,
    limit,
    totalPages: 0,
  };
}

function createEmptyAccountDraft(): AccountMarketDraft {
  return {
    name: '',
    estimatedValue: 0,
    shipEntries: [],
    ccuEntries: [],
    bundleEntries: [],
    extraEntries: [],
    highlightEntries: [],
    metadata: {},
    issues: [],
  };
}

function buildAccountEntryGroupId(kind: 'ship' | 'ccu' | 'bundle', sourceKey: string) {
  return `${kind}:${sourceKey}`;
}

function normalizeShipName(name?: string) {
  return (name || '').trim().toUpperCase();
}

function yieldToMainThread() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function buildAccountDraft(args: {
  ships: ReturnType<typeof selectUsersHangarItems>['ships'];
  ccus: ReturnType<typeof selectUsersHangarItems>['ccus'];
  bundles: ReturnType<typeof selectUsersHangarItems>['bundles'];
  accountIssues: ReturnType<typeof selectUsersHangarItems>['accountIssues'];
  marketShips: Ship[];
}): Promise<AccountMarketDraft> {
  const { ships, ccus, bundles, accountIssues, marketShips } = args;
  let sortOrder = 1;
  const CHUNK_SIZE = 25;

  const resolveShip = (shipId?: number, shipName?: string) => {
    if (typeof shipId === 'number') {
      const matchedById = marketShips.find((ship) => ship.id === shipId);
      if (matchedById) return matchedById;
    }

    if (!shipName) return null;
    return marketShips.find((ship) => normalizeShipName(ship.name) === normalizeShipName(shipName)) || null;
  };

  const shipEntries: AccountMarketEntry[] = [];
  for (let index = 0; index < ships.length; index += 1) {
    const item = ships[index];
    const resolvedShip = resolveShip(item.id, item.name);
    const groupId = buildAccountEntryGroupId('ship', `${item.pageId || item.id}`);
    shipEntries.push({
      id: `ship-${item.pageId || item.id}-${sortOrder}`,
      kind: 'ship',
      name: resolvedShip?.name || item.name,
      shipId: resolvedShip?.id,
      shipName: resolvedShip?.name || item.name,
      imageUrl: resolvedShip?.imageUrls?.thumbLarge || resolvedShip?.imageUrls?.slideshow,
      value: item.value,
      msrp: resolvedShip?.msrp,
      sortOrder: sortOrder++,
      groupId,
      source: item.isBuyBack ? 'buyback' : 'hangar',
      canGift: item.isBuyBack ? null : item.canGift,
    });

    if ((index + 1) % CHUNK_SIZE === 0) {
      await yieldToMainThread();
    }
  }

  const ccuEntries: AccountMarketEntry[] = [];
  for (let index = 0; index < ccus.length; index += 1) {
    const item = ccus[index];
    const groupId = buildAccountEntryGroupId('ccu', `${item.pageId || `${item.from.id}-${item.to.id}`}`);
    ccuEntries.push({
      id: `ccu-${item.pageId || `${item.from.id}-${item.to.id}`}-${sortOrder}`,
      kind: 'ccu',
      name: `Upgrade - ${item.parsed.from} to ${item.parsed.to}`,
      fromShipId: item.from.id,
      toShipId: item.to.id,
      fromShipName: item.parsed.from,
      toShipName: item.parsed.to,
      shipName: item.parsed.to,
      quantity: item.quantity || 1,
      value: item.value,
      msrp: item.from?.id && item.to?.id
        ? (() => {
            const fromShip = resolveShip(item.from.id, item.parsed.from);
            const toShip = resolveShip(item.to.id, item.parsed.to);
            if (!fromShip?.msrp || !toShip?.msrp) {
              return undefined;
            }
            return Math.max(toShip.msrp - fromShip.msrp, 0);
          })()
        : undefined,
      sortOrder: sortOrder++,
      groupId,
      source: item.isBuyBack ? 'buyback' : 'hangar',
      canGift: item.isBuyBack ? null : item.canGift,
    });

    if ((index + 1) % CHUNK_SIZE === 0) {
      await yieldToMainThread();
    }
  }

  const bundleEntries: AccountMarketEntry[] = [];
  const extraEntries: AccountMarketEntry[] = [];
  for (let index = 0; index < bundles.length; index += 1) {
    const item = bundles[index];
    const groupId = buildAccountEntryGroupId('bundle', `${item.pageId || item.name}`);
    bundleEntries.push({
      id: `bundle-${item.pageId || item.name}-${sortOrder}`,
      kind: 'bundle',
      name: item.name,
      shipName: item.ships?.[0]?.name,
      imageUrl: item.others?.find((other) => other.withImage)?.image,
      quantity: item.quantity || 1,
      value: item.value,
      msrp: (item.ships || []).reduce((sum, bundleShip) => {
        const resolvedShip = resolveShip(bundleShip.id, bundleShip.name);
        return sum + (resolvedShip?.msrp || 0);
      }, 0) || undefined,
      sortOrder: sortOrder++,
      groupId,
      source: item.isBuyBack ? 'buyback' : 'hangar',
      canGift: item.isBuyBack ? null : item.canGift,
    });

    (item.ships || []).forEach((bundleShip) => {
      const resolvedShip = resolveShip(bundleShip.id, bundleShip.name);
      extraEntries.push({
        id: `bundle-ship-${item.pageId || item.name}-${bundleShip.id || bundleShip.name}-${sortOrder}`,
        kind: 'ship',
        name: resolvedShip?.name || bundleShip.name || 'Ship',
        shipId: resolvedShip?.id,
        shipName: resolvedShip?.name || bundleShip.name,
        imageUrl: resolvedShip?.imageUrls?.thumbLarge || resolvedShip?.imageUrls?.slideshow,
        quantity: bundleShip.quantity || 1,
        msrp: resolvedShip?.msrp,
        sortOrder: sortOrder++,
        groupId,
        source: item.isBuyBack ? 'buyback' : 'hangar',
        canGift: item.isBuyBack ? null : item.canGift,
      });
    });

    (item.others || []).forEach((other) => {
      extraEntries.push({
        id: `extra-${item.pageId || item.name}-${other.id}-${sortOrder}`,
        kind: 'extra',
        name: other.name,
        imageUrl: other.image,
        quantity: other.quantity || 1,
        value: other.value,
        sortOrder: sortOrder++,
        groupId,
        source: item.isBuyBack ? 'buyback' : 'hangar',
        canGift: item.isBuyBack ? null : item.canGift,
      });
    });

    if ((index + 1) % Math.max(1, Math.floor(CHUNK_SIZE / 2)) === 0) {
      await yieldToMainThread();
    }
  }

  const estimatedValue = [
    ...ships.map((item) => item.value || 0),
    ...ccus.map((item) => item.value || 0),
    ...bundles.map((item) => item.value || 0),
  ].reduce((sum, value) => sum + value, 0);

  const issues: AccountMarketDraftIssue[] = accountIssues.map((issue) => ({
    ...issue,
    resolution: 'pending',
    manualKind: issue.itemType === 'ccu' ? 'ccu' : 'bundle',
    manualName: issue.name,
  }));

  return {
    name: shipEntries[0]?.shipName
      ? `${shipEntries[0].shipName} Account Package`
      : 'RSI Account Listing',
    estimatedValue,
    shipEntries,
    ccuEntries,
    bundleEntries,
    extraEntries,
    highlightEntries: [],
    metadata: {},
    issues,
  };
}

function buildDraftFromListing(item: AccountListingItem): AccountMarketDraft {
  const shipEntries = item.entries.filter((entry) => entry.kind === 'ship');
  const ccuEntries = item.entries.filter((entry) => entry.kind === 'ccu');
  const bundleEntries = item.entries.filter((entry) => entry.kind === 'bundle');
  const extraEntries = item.entries.filter((entry) => entry.kind === 'extra');
  const highlightEntries = item.entries.filter((entry) => entry.kind === 'highlight');

  return {
    name: item.name,
    estimatedValue: item.cost || item.price,
    shipEntries,
    ccuEntries,
    bundleEntries,
    extraEntries,
    highlightEntries,
    metadata: item.metadata || {},
    issues: [],
  };
}

function buildEditableEntries(draft: AccountMarketDraft, manualIssueNames: Record<string, string>) {
  const resolvedIssues: AccountMarketEntry[] = draft.issues.flatMap((issue, index) => {
    if (issue.resolution === 'ignore') {
      return [];
    }

    const manualName = (manualIssueNames[issue.id] || issue.manualName || issue.name).trim();
    if (!manualName) {
      return [];
    }

    return [{
      id: `resolved-issue-${issue.id}-${index}`,
      kind: issue.manualKind,
      name: manualName,
      shipId: undefined,
      shipName: undefined,
      fromShipId: undefined,
      toShipId: undefined,
      fromShipName: undefined,
      toShipName: undefined,
      imageUrl: undefined,
      quantity: 1,
      value: 0,
      sortOrder: 10_000 + index,
      groupId: buildAccountEntryGroupId('bundle', `issue-${issue.id}`),
      linkedEntryId: undefined,
      source: issue.isBuyBack ? 'buyback' : 'hangar',
      canGift: issue.isBuyBack ? null : issue.canGift,
    } satisfies AccountMarketEntry];
  });

  const entries: AccountMarketEntry[] = [
    ...draft.shipEntries,
    ...draft.ccuEntries,
    ...draft.bundleEntries,
    ...draft.extraEntries,
    ...resolvedIssues,
  ];

  return entries.sort((left, right) => left.sortOrder - right.sortOrder);
}

function getEntryKindLabel(intl: ReturnType<typeof useIntl>, kind: AccountMarketEntryKind) {
  switch (kind) {
    case 'ship':
      return intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' });
    case 'ccu':
      return intl.formatMessage({ id: 'market.filter.ccu', defaultMessage: 'CCU' });
    case 'bundle':
      return intl.formatMessage({ id: 'market.filter.bundle', defaultMessage: 'Bundle' });
    case 'highlight':
      return intl.formatMessage({ id: 'accountMarket.entry.highlight', defaultMessage: 'Highlight' });
    default:
      return intl.formatMessage({ id: 'market.detail.extra', defaultMessage: 'Extra' });
  }
}

function SourceSectionTitle({
  source,
}: {
  source: 'hangar' | 'buyback';
}) {
  return source === 'buyback'
    ? <FormattedMessage id="accountMarket.entry.buyback" defaultMessage="Buyback" />
    : <FormattedMessage id="accountMarket.entry.hangar" defaultMessage="Hangar item" />;
}

export default function AccountStoreTable({ ships }: { ships: Ship[] }) {
  const intl = useIntl();
  const { token, id } = useSelector((state: RootState) => state.user.user);
  const hangarItems = useSelector(selectUsersHangarItems);
  const [listingItems, setListingItems] = useState<AccountListingItem[]>([]);
  const [listingPagination, setListingPagination] = useState<MarketListPagination>(() => createEmptyListingPagination(10));
  const [listingFetchError, setListingFetchError] = useState<string | null>(null);
  const [isListingLoading, setIsListingLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<AccountListingItem | null>(null);
  const [draft, setDraft] = useState<AccountMarketDraft>(() => createEmptyAccountDraft());
  const [listingName, setListingName] = useState('');
  const [listingPrice, setListingPrice] = useState(0);
  const [listingCost, setListingCost] = useState(0);
  const [listingStock, setListingStock] = useState(1);
  const [listingDescription, setListingDescription] = useState('');
  const [listingImageUrls, setListingImageUrls] = useState<string[]>([]);
  const [manualIssueNames, setManualIssueNames] = useState<Record<string, string>>({});
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);
  const [isPreparingDraft, setIsPreparingDraft] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const fetchListingItems = useCallback(async (signal?: AbortSignal) => {
    if (!id) {
      setListingItems([]);
      setListingPagination(createEmptyListingPagination(rowsPerPage));
      return;
    }

    setIsListingLoading(true);

    try {
      const searchParams = new URLSearchParams({
        page: String(page),
        limit: String(rowsPerPage),
      });

      const trimmedSearch = searchTerm.trim();
      if (trimmedSearch) {
        searchParams.set('search', trimmedSearch);
      }

      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/account-market/my/search?${searchParams.toString()}`, {
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Unexpected response: ${response.status}`);
      }

      const data = await response.json() as AccountMarketListResponse;
      if (signal?.aborted) {
        return;
      }

      setListingItems(data.items || []);
      setListingPagination(data.pagination || createEmptyListingPagination(rowsPerPage));
      setListingFetchError(null);
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        return;
      }

      console.error('Failed to fetch account listings:', error);
      setListingFetchError(intl.formatMessage({
        id: 'accountMarket.fetchListingsFailed',
        defaultMessage: 'Failed to fetch account listings',
      }));
    } finally {
      if (!signal?.aborted) {
        setIsListingLoading(false);
      }
    }
  }, [id, intl, page, rowsPerPage, searchTerm, token]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchListingItems(controller.signal);
    return () => controller.abort();
  }, [fetchListingItems]);

  const syncDraftFromHangar = useCallback(async () => {
    setIsPreparingDraft(true);
    setListingFetchError(null);
    await yieldToMainThread();

    const nextDraft = await buildAccountDraft({
      ships: hangarItems.ships,
      ccus: hangarItems.ccus,
      bundles: hangarItems.bundles,
      accountIssues: hangarItems.accountIssues,
      marketShips: ships,
    });

    setDraft(nextDraft);
    setHasLoadedDraft(true);
    setExpandedEntryId(null);
    if (!editingListing) {
      setListingName(nextDraft.name);
      const estimated = Number(nextDraft.estimatedValue.toFixed(2));
      setListingPrice(estimated);
      setListingCost(estimated);
      setListingImageUrls((current) => (
        current.length > 0
          ? current
          : [nextDraft.shipEntries[0]?.imageUrl || nextDraft.bundleEntries[0]?.imageUrl || nextDraft.extraEntries[0]?.imageUrl]
              .filter((imageUrl): imageUrl is string => Boolean(imageUrl))
      ));
    }
    setIsPreparingDraft(false);
  }, [editingListing, hangarItems.accountIssues, hangarItems.bundles, hangarItems.ccus, hangarItems.ships, ships]);

  const openCreateDialog = useCallback(() => {
    setEditingListing(null);
    setDraft(createEmptyAccountDraft());
    setManualIssueNames({});
    setListingName('');
    setListingPrice(0);
    setListingCost(0);
    setListingDescription('');
    setListingImageUrls([]);
    setListingStock(1);
    setHasLoadedDraft(false);
    setIsPreparingDraft(false);
    setExpandedEntryId(null);
    setIsCreateDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((item: AccountListingItem) => {
    const nextDraft = buildDraftFromListing(item);
    setEditingListing(item);
    setDraft(nextDraft);
    setManualIssueNames({});
    setListingName(item.name);
    setListingPrice(item.price);
    setListingCost(item.cost || item.price);
    setListingStock(Math.max(item.stock, 1));
    setListingDescription(item.description || '');
    setListingImageUrls(resolveMarketImageUrls(item.imageUrl, item.imageUrls));
    setHasLoadedDraft(true);
    setIsPreparingDraft(false);
    setExpandedEntryId(null);
    setIsCreateDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsCreateDialogOpen(false);
    setEditingListing(null);
    setManualIssueNames({});
    setHasLoadedDraft(false);
    setIsPreparingDraft(false);
    setExpandedEntryId(null);
    setListingImageUrls([]);
  }, []);

  const editableEntries = useMemo(
    () => buildEditableEntries(draft, manualIssueNames),
    [draft, manualIssueNames],
  );
  const sourceSections = useMemo(
    () => buildAccountMarketSourceSections(editableEntries),
    [editableEntries],
  );

  const unresolvedBlockingIssues = draft.issues.filter((issue) => issue.resolution === 'pending');

  const handleEntryFieldChange = useCallback((entryId: string, updater: (entry: AccountMarketEntry) => AccountMarketEntry) => {
    setDraft((current) => {
      let updatedEntrySnapshot: AccountMarketEntry | null = null;
      const updateEntryList = (entries: AccountMarketEntry[]) => entries.map((entry) => {
        if (entry.id !== entryId) {
          return entry;
        }

        updatedEntrySnapshot = updater(entry);
        return updatedEntrySnapshot;
      });

      const nextDraft = {
        ...current,
        shipEntries: updateEntryList(current.shipEntries),
        ccuEntries: updateEntryList(current.ccuEntries),
        bundleEntries: updateEntryList(current.bundleEntries),
        extraEntries: updateEntryList(current.extraEntries),
        metadata: current.metadata,
        highlightEntries: current.highlightEntries,
      };

      if (!updatedEntrySnapshot) {
        return nextDraft;
      }

      const updatedEntry: AccountMarketEntry = updatedEntrySnapshot;

      nextDraft.highlightEntries = current.highlightEntries.map((highlightEntry) => (
        doesHighlightReferenceEntry(highlightEntry, { ...updatedEntry, id: entryId })
          ? {
              ...highlightEntry,
              name: updatedEntry.name,
              shipId: updatedEntry.shipId,
              shipName: updatedEntry.shipName,
              fromShipId: updatedEntry.fromShipId,
              toShipId: updatedEntry.toShipId,
              fromShipName: updatedEntry.fromShipName,
              toShipName: updatedEntry.toShipName,
              imageUrl: updatedEntry.imageUrl,
              groupId: updatedEntry.groupId,
              source: updatedEntry.source,
              canGift: updatedEntry.canGift,
              quantity: updatedEntry.quantity,
              linkedEntryId: entryId,
            }
          : highlightEntry
      ));

      return nextDraft;
    });
  }, []);

  const handleRemoveEntry = useCallback((entryId: string) => {
    setDraft((current) => {
      const removedEntries = [
        ...current.shipEntries,
        ...current.ccuEntries,
        ...current.bundleEntries,
        ...current.extraEntries,
      ].filter((entry) => entry.id === entryId);

      const removeEntry = (entries: AccountMarketEntry[]) => entries.filter((entry) => entry.id !== entryId);

      return {
        ...current,
        shipEntries: removeEntry(current.shipEntries),
        ccuEntries: removeEntry(current.ccuEntries),
        bundleEntries: removeEntry(current.bundleEntries),
        extraEntries: removeEntry(current.extraEntries),
        highlightEntries: current.highlightEntries.filter((highlightEntry) => (
          !removedEntries.some((removedEntry) => doesHighlightReferenceEntry(highlightEntry, removedEntry))
        )),
      };
    });
    setExpandedEntryId((current) => current === entryId ? null : current);
  }, []);

  const handleRemoveEntries = useCallback((entryIds: string[], expandedIdToClear?: string) => {
    setDraft((current) => {
      const entryIdSet = new Set(entryIds);
      const removedEntries = [
        ...current.shipEntries,
        ...current.ccuEntries,
        ...current.bundleEntries,
        ...current.extraEntries,
      ].filter((entry) => entryIdSet.has(entry.id));

      const removeEntries = (entries: AccountMarketEntry[]) => entries.filter((entry) => !entryIdSet.has(entry.id));

      return {
        ...current,
        shipEntries: removeEntries(current.shipEntries),
        ccuEntries: removeEntries(current.ccuEntries),
        bundleEntries: removeEntries(current.bundleEntries),
        extraEntries: removeEntries(current.extraEntries),
        highlightEntries: current.highlightEntries.filter((highlightEntry) => (
          !removedEntries.some((removedEntry) => doesHighlightReferenceEntry(highlightEntry, removedEntry))
        )),
      };
    });

    if (expandedIdToClear) {
      setExpandedEntryId((current) => current === expandedIdToClear ? null : current);
    }
  }, []);

  const handleAddManualEntry = useCallback(() => {
    const nextSortOrder = editableEntries.reduce((maxValue, entry) => Math.max(maxValue, entry.sortOrder), 0) + 1;
    const nextEntryId = `manual-extra-${Date.now()}-${nextSortOrder}`;
    setDraft((current) => ({
      ...current,
      extraEntries: [
        ...current.extraEntries,
        {
          id: nextEntryId,
          kind: 'extra',
          name: '',
          sortOrder: nextSortOrder,
          groupId: buildAccountEntryGroupId('bundle', `manual-${nextEntryId}`),
          source: 'hangar',
          canGift: true,
        },
      ],
    }));
    setExpandedEntryId(nextEntryId);
  }, [editableEntries]);

  const isEntryHighlighted = useCallback((entry: AccountMarketEntry) => (
    draft.highlightEntries.some((highlightEntry) => doesHighlightReferenceEntry(highlightEntry, entry))
  ), [draft.highlightEntries]);

  const handleToggleHighlight = useCallback((entry: AccountMarketEntry) => {
    setDraft((current) => {
      const existingHighlightIndex = current.highlightEntries.findIndex((highlightEntry) => (
        doesHighlightReferenceEntry(highlightEntry, entry)
      ));

      if (existingHighlightIndex >= 0) {
        return {
          ...current,
          highlightEntries: current.highlightEntries.filter((_, index) => index !== existingHighlightIndex),
        };
      }

      const maxSortOrder = [
        ...current.shipEntries,
        ...current.ccuEntries,
        ...current.bundleEntries,
        ...current.extraEntries,
        ...current.highlightEntries,
      ].reduce((highestSortOrder, currentEntry) => Math.max(highestSortOrder, currentEntry.sortOrder), 0);

      return {
        ...current,
        highlightEntries: [
          ...current.highlightEntries,
          createAccountMarketHighlightEntry(entry, maxSortOrder + 1),
        ],
      };
    });
  }, []);

  const handlePublish = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsSubmitting(true);

    try {
      const highlightEntriesForPublish = draft.highlightEntries
        .flatMap((highlightEntry) => {
          const linkedEntry = editableEntries.find((entry) => doesHighlightReferenceEntry(highlightEntry, entry));
          if (!linkedEntry) {
            return [];
          }

          const nextHighlightEntry: AccountMarketEntry = {
            ...linkedEntry,
            kind: 'highlight' as const,
            sortOrder: highlightEntry.sortOrder,
            linkedEntryId: linkedEntry.id,
          };

          return [nextHighlightEntry];
        })
        .filter((entry) => Boolean(entry.name.trim()));

      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/account-market/item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: listingName.trim() || draft.name,
          price: listingPrice,
          cost: listingCost,
          stock: Math.max(1, Math.floor(listingStock)),
          replaceSkuId: editingListing?.skuId,
          visibleInMarket: true,
          imageUrl: listingImageUrls[0] || undefined,
          imageUrls: listingImageUrls,
          description: listingDescription.trim() || intl.formatMessage({
            id: 'accountMarket.defaultResellerDescription',
            defaultMessage: 'Account package with the listed hangar items, buyback items, and account-bound extras.',
          }),
          metadata: draft.metadata,
          entries: [...editableEntries, ...highlightEntriesForPublish]
            .filter((entry) => entry.name.trim())
            .map((entry, index) => ({
              kind: entry.kind,
              name: entry.name.trim(),
              shipId: entry.shipId,
              shipName: entry.shipName,
              fromShipId: entry.fromShipId,
              toShipId: entry.toShipId,
              fromShipName: entry.fromShipName,
              toShipName: entry.toShipName,
              imageUrl: entry.imageUrl,
              quantity: entry.quantity,
              sortOrder: entry.sortOrder || index + 1,
              groupId: entry.groupId,
              linkedEntryId: entry.linkedEntryId,
              source: entry.source,
              canGift: entry.source === 'buyback' ? null : entry.canGift,
            })),
        }),
      });

      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof responsePayload?.error === 'string' ? responsePayload.error : `Unexpected response: ${response.status}`);
      }

      await fetchListingItems();
      closeDialog();
    } catch (error) {
      console.error('Failed to publish account listing:', error);
      setListingFetchError(
        error instanceof Error
          ? error.message
          : intl.formatMessage({
            id: 'accountMarket.publishFailed',
            defaultMessage: 'Failed to publish account listing',
          }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    closeDialog,
    draft.name,
    editableEntries,
    editingListing?.skuId,
    fetchListingItems,
    intl,
    listingCost,
    listingDescription,
    listingImageUrls,
    listingName,
    listingPrice,
    listingStock,
    token,
  ]);

  const handleRemoveItem = useCallback(async (skuId: string) => {
    if (!token) {
      return;
    }

    setIsRemoving(skuId);
    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/account-market/item`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ skuId }),
      });

      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof responsePayload?.error === 'string' ? responsePayload.error : `Unexpected response: ${response.status}`);
      }

      await fetchListingItems();
    } catch (error) {
      console.error('Failed to remove account listing:', error);
      setListingFetchError(
        error instanceof Error
          ? error.message
          : intl.formatMessage({
            id: 'accountMarket.removeFailed',
            defaultMessage: 'Failed to remove account listing',
          }),
      );
    } finally {
      setIsRemoving(null);
    }
  }, [fetchListingItems, intl, token]);

  return (
    <div className="relative sm:pt-24">
      <div className="absolute top-0 right-0 m-[15px] gap-2 hidden sm:flex">
        <div className="flex flex-col gap-2 items-center justify-center">
          {!isCreateDialogOpen && <Crawler ships={ships} />}
        </div>
        <UserSelector />
      </div>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <TextField
          sx={{ flexGrow: 1, minWidth: 320 }}
          variant="outlined"
          placeholder={intl.formatMessage({ id: 'accountMarket.searchMyListings', defaultMessage: 'Search accounts or included items...' })}
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setPage(0);
          }}
          size="small"
          slotProps={{
            input: {
              startAdornment: <Search size={18} />,
            },
          }}
        />
        <Button
          variant="contained"
          startIcon={<PlusCircle />}
          onClick={openCreateDialog}
        >
          <FormattedMessage id="accountMarket.createListing" defaultMessage="Publish Account Listing" />
        </Button>
      </Box>

      <Alert severity={unresolvedBlockingIssues.length > 0 ? 'warning' : 'info'} sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          <FormattedMessage
            id="accountMarket.syncSummary"
            defaultMessage="Sync your RSI hangar before creating or updating an account listing."
            values={{
              shipCount: draft.shipEntries.length,
              ccuCount: draft.ccuEntries.length,
              bundleCount: draft.bundleEntries.length,
            }}
          />
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          <FormattedMessage
            id="accountMarket.issueSummary"
            defaultMessage="If anything needs review, we will show it in the editor before you publish."
            values={{ count: unresolvedBlockingIssues.length }}
          />
        </Typography>
      </Alert>

      {listingFetchError && <Alert severity="error" sx={{ mb: 2 }}>{listingFetchError}</Alert>}

      <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><FormattedMessage id="accountMarket.table.name" defaultMessage="Listing" /></TableCell>
              <TableCell><FormattedMessage id="accountMarket.table.contents" defaultMessage="Contents" /></TableCell>
              <TableCell><FormattedMessage id="accountMarket.table.highlights" defaultMessage="Highlights" /></TableCell>
              <TableCell align="right"><FormattedMessage id="accountMarket.table.price" defaultMessage="Price" /></TableCell>
              <TableCell align="right"><FormattedMessage id="accountMarket.table.stock" defaultMessage="Stock" /></TableCell>
              <TableCell align="right"><FormattedMessage id="common.actions" defaultMessage="Actions" /></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(isListingLoading && listingItems.length === 0) ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography align="center">
                    <FormattedMessage id="loading" defaultMessage="Loading..." />
                  </Typography>
                </TableCell>
              </TableRow>
            ) : listingItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography align="center" color="text.secondary">
                    <FormattedMessage id="accountMarket.empty" defaultMessage="No account listings yet." />
                  </Typography>
                </TableCell>
              </TableRow>
            ) : listingItems.map((item) => (
              <TableRow key={item.skuId}>
                <TableCell>
                  <Typography variant="subtitle2">{item.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{item.description || item.sourceKind}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{item.shipCount} ships · {item.ccuCount} CCUs · {item.extraCount + item.bundleCount} extras</Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {item.highlights.slice(0, 3).map((highlight) => (
                      <Chip key={`${item.skuId}-${highlight}`} size="small" label={highlight} />
                    ))}
                  </Box>
                </TableCell>
                <TableCell align="right">${item.price.toFixed(2)}</TableCell>
                <TableCell align="right">{Math.max(item.stock - item.lockedStock, 0)}</TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'inline-flex', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => openEditDialog(item)}>
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      disabled={isRemoving === item.skuId}
                      onClick={() => void handleRemoveItem(item.skuId)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={listingPagination.total}
        page={listingPagination.page}
        onPageChange={(_, nextPage) => setPage(nextPage)}
        rowsPerPage={listingPagination.limit}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(Number.parseInt(event.target.value, 10));
          setPage(0);
        }}
      />

      <Dialog open={isCreateDialogOpen} onClose={closeDialog} fullScreen>
        <DialogTitle>
          {editingListing
            ? <FormattedMessage id="accountMarket.publishDialog.editTitle" defaultMessage="Update Account Listing" />
            : <FormattedMessage id="accountMarket.publishDialog.title" defaultMessage="Create Account Listing" />}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Alert severity={unresolvedBlockingIssues.length > 0 ? 'warning' : 'info'}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <Typography variant="body2">
                  <FormattedMessage
                    id="accountMarket.publishDialog.syncNotice"
                    defaultMessage="1. Click Sync Hangar. 2. Click Use Latest Synced Hangar. 3. Check the imported items and update any details you want buyers to see. 4. Publish when everything looks correct."
                  />
                </Typography>
                <Crawler ships={ships} />
              </Box>
            </Alert>

            <Button variant="outlined" onClick={() => void syncDraftFromHangar()} disabled={isPreparingDraft || isSubmitting}>
              <FormattedMessage id="accountMarket.publishDialog.refreshDraft" defaultMessage="Use Latest Synced Hangar" />
            </Button>

            {isPreparingDraft && (
              <Alert severity="info">
                <FormattedMessage
                  id="accountMarket.publishDialog.preparingDraft"
                  defaultMessage="Loading your latest synced hangar. If this account has many items, it may take a moment."
                />
              </Alert>
            )}

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1.2fr 0.8fr 0.8fr 0.8fr' } }}>
              <TextField
                label={intl.formatMessage({ id: 'accountMarket.publishDialog.name', defaultMessage: 'Listing title' })}
                value={listingName}
                onChange={(event) => setListingName(event.target.value)}
                fullWidth
              />
              <TextField
                label={intl.formatMessage({ id: 'accountMarket.publishDialog.price', defaultMessage: 'Sale price (USD)' })}
                type="number"
                value={listingPrice}
                onChange={(event) => setListingPrice(Number(event.target.value))}
                fullWidth
              />
              <TextField
                label={intl.formatMessage({ id: 'accountMarket.publishDialog.cost', defaultMessage: 'Your cost (USD)' })}
                type="number"
                value={listingCost}
                onChange={(event) => setListingCost(Number(event.target.value))}
                fullWidth
              />
              <TextField
                label={intl.formatMessage({ id: 'accountMarket.publishDialog.stock', defaultMessage: 'Quantity available' })}
                type="number"
                value={listingStock}
                onChange={(event) => setListingStock(Number(event.target.value))}
                fullWidth
              />
            </Box>

            <TextField
              label={intl.formatMessage({ id: 'accountMarket.publishDialog.description', defaultMessage: 'Description buyers will read' })}
              value={listingDescription}
              onChange={(event) => setListingDescription(event.target.value)}
              fullWidth
              multiline
              minRows={4}
            />

            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
              <ResellerImagePicker
                imageUrls={listingImageUrls}
                onChange={setListingImageUrls}
                label={intl.formatMessage({ id: 'reseller.imagePicker.label', defaultMessage: 'Listing images' })}
              />
            </Box>

            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                <FormattedMessage id="accountMarket.publishDialog.accountMetadata" defaultMessage="Account access details" />
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '0.8fr 0.8fr 1fr 1fr' } }}>
                <TextField
                  select
                  label={intl.formatMessage({ id: 'accountMarket.publishDialog.hasGamePackage', defaultMessage: 'Game access' })}
                  value={draft.metadata.hasGamePackage === true ? 'yes' : draft.metadata.hasGamePackage === false ? 'no' : 'unknown'}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    metadata: {
                      ...current.metadata,
                      hasGamePackage: event.target.value === 'unknown' ? null : event.target.value === 'yes',
                    },
                  }))}
                  fullWidth
                >
                  <MenuItem value="unknown">{intl.formatMessage({ id: 'accountMarket.publishDialog.unknown', defaultMessage: 'Unknown' })}</MenuItem>
                  <MenuItem value="yes">{intl.formatMessage({ id: 'accountMarket.publishDialog.yes', defaultMessage: 'Yes' })}</MenuItem>
                  <MenuItem value="no">{intl.formatMessage({ id: 'accountMarket.publishDialog.no', defaultMessage: 'No' })}</MenuItem>
                </TextField>
                <TextField
                  select
                  label={intl.formatMessage({ id: 'accountMarket.publishDialog.hasSquadron42', defaultMessage: 'Squadron 42 access' })}
                  value={draft.metadata.hasSquadron42 === true ? 'yes' : draft.metadata.hasSquadron42 === false ? 'no' : 'unknown'}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    metadata: {
                      ...current.metadata,
                      hasSquadron42: event.target.value === 'unknown' ? null : event.target.value === 'yes',
                    },
                  }))}
                  fullWidth
                >
                  <MenuItem value="unknown">{intl.formatMessage({ id: 'accountMarket.publishDialog.unknown', defaultMessage: 'Unknown' })}</MenuItem>
                  <MenuItem value="yes">{intl.formatMessage({ id: 'accountMarket.publishDialog.yes', defaultMessage: 'Yes' })}</MenuItem>
                  <MenuItem value="no">{intl.formatMessage({ id: 'accountMarket.publishDialog.no', defaultMessage: 'No' })}</MenuItem>
                </TextField>
                <TextField
                  label={intl.formatMessage({ id: 'accountMarket.publishDialog.conciergeLevel', defaultMessage: 'Concierge level' })}
                  value={draft.metadata.conciergeLevel || ''}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    metadata: {
                      ...current.metadata,
                      conciergeLevel: event.target.value,
                    },
                  }))}
                  fullWidth
                />
                <TextField
                  label={intl.formatMessage({ id: 'accountMarket.publishDialog.spendAmount', defaultMessage: 'Account spend (USD)' })}
                  type="number"
                  value={draft.metadata.spendAmount ?? ''}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    metadata: {
                      ...current.metadata,
                      spendAmount: event.target.value === '' ? null : Number(event.target.value),
                    },
                  }))}
                  fullWidth
                />
              </Box>
            </Box>

            <Divider />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                <FormattedMessage id="accountMarket.publishDialog.contentsTitle" defaultMessage="Items included in this account" />
              </Typography>
              <Button variant="outlined" onClick={handleAddManualEntry}>
                <FormattedMessage id="accountMarket.publishDialog.addExtra" defaultMessage="Add item manually" />
              </Button>
            </Box>

            {!hasLoadedDraft && !editingListing ? (
              <Alert severity="info">
                <FormattedMessage
                  id="accountMarket.publishDialog.loadDraftHint"
                  defaultMessage="After Sync Hangar finishes, click Use Latest Synced Hangar to import the newest items into this listing."
                />
              </Alert>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {sourceSections.map((section) => (
                  <Box
                    key={section.source}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      overflow: 'hidden',
                    }}
                  >
                    <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        <SourceSectionTitle source={section.source} />
                      </Typography>
                    </Box>

                    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {section.items.map((itemGroup) => {
                        const { entry, nestedEntries } = itemGroup.group;
                        const isExpanded = expandedEntryId === itemGroup.group.id;
                        const previewImage = getAccountEntryPreviewImage(entry, nestedEntries, ships);
                        const isHighlighted = isEntryHighlighted(entry);
                        const groupEntries = itemGroup.group.members.map((member) => member.entry);
                        const title = entry.kind === 'ccu'
                          ? (() => {
                              const shipDisplay = getAccountMarketEntryShipDisplay(entry, ships);
                              return formatMarketCcuResourceName(intl, shipDisplay.fromShipName || '-', shipDisplay.toShipName || '-');
                            })()
                          : getAccountEntryPrimaryLabel(entry).trim() || intl.formatMessage({ id: 'accountMarket.publishDialog.untitledEntry', defaultMessage: 'Untitled entry' });
                        const subtitle = entry.kind === 'bundle'
                          ? intl.formatMessage(
                            { id: 'accountMarket.publishDialog.bundleSummary', defaultMessage: 'Package contents: {count} included items' },
                            { count: nestedEntries.length },
                          )
                          : entry.kind === 'ccu' && itemGroup.group.totalQuantity > 1
                            ? intl.formatMessage(
                              { id: 'accountMarket.publishDialog.quantityOnlySummary', defaultMessage: '{count} upgrades in this group' },
                              { count: itemGroup.group.totalQuantity },
                            )
                            : intl.formatMessage(
                              { id: 'accountMarket.publishDialog.singleItemSummary', defaultMessage: 'Standalone account item' },
                            );

                        return (
                          <Box
                            key={itemGroup.group.id}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              overflow: 'hidden',
                            }}
                          >
                            <Box
                              sx={{
                                px: 2,
                                py: 1.5,
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 2,
                                alignItems: 'flex-start',
                                bgcolor: entry.kind === 'bundle' ? 'action.hover' : 'background.paper',
                              }}
                            >
                              <Box sx={{ display: 'flex', gap: 2, minWidth: 0, flex: 1 }}>
                                {previewImage ? (
                                  <Box
                                    sx={{
                                      width: 88,
                                      height: 88,
                                      flexShrink: 0,
                                      borderRadius: 1,
                                      overflow: 'hidden',
                                      bgcolor: 'action.hover',
                                      border: '1px solid',
                                      borderColor: 'divider',
                                    }}
                                  >
                                    <Box
                                      component="img"
                                      src={previewImage}
                                      alt={entry.name}
                                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  </Box>
                                ) : null}

                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                                    {title}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                    {subtitle}
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip size="small" label={getEntryKindLabel(intl, entry.kind)} />
                                    {itemGroup.group.totalQuantity > 1 && (
                                      <Chip size="small" label={intl.formatMessage({ id: 'accountMarket.publishDialog.quantitySummary', defaultMessage: 'Qty {count}' }, { count: itemGroup.group.totalQuantity })} />
                                    )}
                                    {typeof entry.canGift === 'boolean' && (
                                      <Chip
                                        size="small"
                                        color={entry.canGift === false ? 'warning' : 'success'}
                                        label={entry.canGift === false
                                          ? intl.formatMessage({ id: 'market.notGiftable', defaultMessage: 'Not giftable' })
                                          : intl.formatMessage({ id: 'ccuPlanner.canGift', defaultMessage: 'Giftable' })}
                                      />
                                    )}
                                    {nestedEntries.length > 0 && (
                                      <Chip
                                        size="small"
                                        label={intl.formatMessage(
                                          { id: 'accountMarket.publishDialog.nestedCount', defaultMessage: '{count} included items' },
                                          { count: nestedEntries.length },
                                        )}
                                      />
                                    )}
                                    {isHighlighted && <Chip size="small" color="secondary" label={intl.formatMessage({ id: 'accountMarket.entry.highlight', defaultMessage: 'Highlight' })} />}
                                  </Box>
                                </Box>
                              </Box>
                              <Box sx={{ display: 'inline-flex', gap: 0.5 }}>
                                <Button size="small" variant={isHighlighted ? 'contained' : 'outlined'} onClick={() => handleToggleHighlight(entry)}>
                                  <FormattedMessage id="accountMarket.publishDialog.highlightToggle" defaultMessage="Highlight" />
                                </Button>
                                <IconButton size="small" onClick={() => setExpandedEntryId((current) => current === itemGroup.group.id ? null : itemGroup.group.id)}>
                                  <Pencil size={16} />
                                </IconButton>
                                <IconButton size="small" color="error" onClick={() => handleRemoveEntries(groupEntries.map((groupEntry) => groupEntry.id), itemGroup.group.id)}>
                                  <Trash2 size={16} />
                                </IconButton>
                              </Box>
                            </Box>

                            {nestedEntries.length > 0 && (
                              <Box sx={{ px: 2, pb: isExpanded ? 0 : 1.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                  {nestedEntries
                                    .slice(0, 4)
                                    .map((nestedEntry) => nestedEntry.name)
                                    .join(' · ')}
                                  {nestedEntries.length > 4 ? ` +${nestedEntries.length - 4}` : ''}
                                </Typography>
                              </Box>
                            )}

                            {isExpanded && (
                              <Box sx={{ borderTop: '1px solid', borderColor: 'divider', px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box
                                  sx={{
                                    display: 'grid',
                                    gap: 1.5,
                                    gridTemplateColumns: { xs: '1fr', md: '1.6fr 0.9fr 0.9fr 0.8fr' },
                                  }}
                                >
                                  <TextField
                                    label={intl.formatMessage({ id: 'accountMarket.publishDialog.entryName', defaultMessage: 'Item name' })}
                                    value={entry.name}
                                    onChange={(event) => handleEntryFieldChange(entry.id, (current) => ({
                                      ...current,
                                      name: event.target.value,
                                    }))}
                                    fullWidth
                                  />
                                  <TextField
                                    select
                                    label={intl.formatMessage({ id: 'accountMarket.publishDialog.entryKind', defaultMessage: 'Item type' })}
                                    value={entry.kind}
                                    onChange={(event) => handleEntryFieldChange(entry.id, (current) => ({
                                      ...current,
                                      kind: event.target.value as AccountMarketEntryKind,
                                    }))}
                                    fullWidth
                                  >
                                    {(['ship', 'ccu', 'bundle', 'extra', 'highlight'] as const).map((entryKind) => (
                                      <MenuItem key={entryKind} value={entryKind}>
                                        {getEntryKindLabel(intl, entryKind)}
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                  <TextField
                                    select
                                    label={intl.formatMessage({ id: 'accountMarket.publishDialog.entrySource', defaultMessage: 'Source' })}
                                    value={entry.source || 'hangar'}
                                    onChange={(event) => handleEntryFieldChange(entry.id, (current) => ({
                                      ...current,
                                      source: event.target.value as 'hangar' | 'buyback',
                                      canGift: event.target.value === 'buyback' ? null : (current.canGift ?? true),
                                    }))}
                                    fullWidth
                                  >
                                    <MenuItem value="hangar">
                                      {intl.formatMessage({ id: 'accountMarket.entry.hangar', defaultMessage: 'Item' })}
                                    </MenuItem>
                                    <MenuItem value="buyback">
                                      {intl.formatMessage({ id: 'accountMarket.entry.buyback', defaultMessage: 'Buyback' })}
                                    </MenuItem>
                                  </TextField>
                                  <TextField
                                    select
                                    disabled={entry.source === 'buyback'}
                                    label={intl.formatMessage({ id: 'accountMarket.publishDialog.entryGiftable', defaultMessage: 'Can the buyer receive it as a gift?' })}
                                    value={
                                      entry.source === 'buyback'
                                        ? 'buyback'
                                        : (entry.canGift === false ? 'no' : 'yes')
                                    }
                                    onChange={(event) => handleEntryFieldChange(entry.id, (current) => ({
                                      ...current,
                                      canGift: event.target.value === 'yes',
                                    }))}
                                    fullWidth
                                  >
                                    <MenuItem value="yes">
                                      {intl.formatMessage({ id: 'ccuPlanner.canGift', defaultMessage: 'Giftable' })}
                                    </MenuItem>
                                    <MenuItem value="no">
                                      {intl.formatMessage({ id: 'market.notGiftable', defaultMessage: 'Not giftable' })}
                                    </MenuItem>
                                    <MenuItem value="buyback">
                                      {intl.formatMessage({ id: 'accountMarket.entry.buyback', defaultMessage: 'Buyback' })}
                                    </MenuItem>
                                  </TextField>
                                </Box>

                                {groupEntries.length > 1 && (
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                      <FormattedMessage id="accountMarket.publishDialog.mergedEntries" defaultMessage="Merged entries" />
                                    </Typography>
                                    {groupEntries.map((groupEntry) => (
                                      <Box
                                        key={groupEntry.id}
                                        sx={{
                                          display: 'grid',
                                          gap: 1.5,
                                          gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr 0.9fr 0.8fr auto' },
                                          alignItems: 'center',
                                          border: '1px solid',
                                          borderColor: 'divider',
                                          borderRadius: 1,
                                          p: 1.5,
                                        }}
                                      >
                                        <TextField
                                          label={intl.formatMessage({ id: 'accountMarket.publishDialog.entryName', defaultMessage: 'Item name' })}
                                          value={groupEntry.name}
                                          onChange={(event) => handleEntryFieldChange(groupEntry.id, (current) => ({
                                            ...current,
                                            name: event.target.value,
                                          }))}
                                          fullWidth
                                        />
                                        <TextField
                                          label={intl.formatMessage({ id: 'accountMarket.publishDialog.entrySummary', defaultMessage: 'Item summary' })}
                                          value={groupEntry.kind === 'ccu'
                                            ? `${groupEntry.fromShipName || '-'} -> ${groupEntry.toShipName || '-'}`
                                            : getAccountEntryPrimaryLabel(groupEntry)}
                                          fullWidth
                                          disabled
                                        />
                                        <TextField
                                          select
                                          label={intl.formatMessage({ id: 'accountMarket.publishDialog.entrySource', defaultMessage: 'Source' })}
                                          value={groupEntry.source || 'hangar'}
                                          onChange={(event) => handleEntryFieldChange(groupEntry.id, (current) => ({
                                            ...current,
                                            source: event.target.value as 'hangar' | 'buyback',
                                            canGift: event.target.value === 'buyback' ? null : (current.canGift ?? true),
                                          }))}
                                          fullWidth
                                        >
                                          <MenuItem value="hangar">
                                            {intl.formatMessage({ id: 'accountMarket.entry.hangar', defaultMessage: 'Item' })}
                                          </MenuItem>
                                          <MenuItem value="buyback">
                                            {intl.formatMessage({ id: 'accountMarket.entry.buyback', defaultMessage: 'Buyback' })}
                                          </MenuItem>
                                        </TextField>
                                        <TextField
                                          select
                                          disabled={groupEntry.source === 'buyback'}
                                          label={intl.formatMessage({ id: 'accountMarket.publishDialog.entryGiftable', defaultMessage: 'Can the buyer receive it as a gift?' })}
                                          value={
                                            groupEntry.source === 'buyback'
                                              ? 'buyback'
                                              : (groupEntry.canGift === false ? 'no' : 'yes')
                                          }
                                          onChange={(event) => handleEntryFieldChange(groupEntry.id, (current) => ({
                                            ...current,
                                            canGift: event.target.value === 'yes',
                                          }))}
                                          fullWidth
                                        >
                                          <MenuItem value="yes">
                                            {intl.formatMessage({ id: 'ccuPlanner.canGift', defaultMessage: 'Giftable' })}
                                          </MenuItem>
                                          <MenuItem value="no">
                                            {intl.formatMessage({ id: 'market.notGiftable', defaultMessage: 'Not giftable' })}
                                          </MenuItem>
                                          <MenuItem value="buyback">
                                            {intl.formatMessage({ id: 'accountMarket.entry.buyback', defaultMessage: 'Buyback' })}
                                          </MenuItem>
                                        </TextField>
                                        <IconButton size="small" color="error" onClick={() => handleRemoveEntry(groupEntry.id)}>
                                          <Trash2 size={16} />
                                        </IconButton>
                                      </Box>
                                    ))}
                                  </Box>
                                )}

                                {nestedEntries.length > 0 && (
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                      <FormattedMessage id="accountMarket.publishDialog.includedItems" defaultMessage="Included items" />
                                    </Typography>
                                    {nestedEntries.map((nestedEntry) => (
                                      <Box
                                        key={nestedEntry.id}
                                        sx={{
                                          display: 'grid',
                                          gap: 1.5,
                                          gridTemplateColumns: { xs: '1fr', md: '1.5fr 0.9fr auto' },
                                          alignItems: 'center',
                                          border: '1px solid',
                                          borderColor: 'divider',
                                          borderRadius: 1,
                                          p: 1.5,
                                        }}
                                      >
                                        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', minWidth: 0 }}>
                                          {nestedEntry.imageUrl ? (
                                            <Box
                                              component="img"
                                              src={nestedEntry.imageUrl}
                                              alt={nestedEntry.name}
                                              sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider', flexShrink: 0 }}
                                            />
                                          ) : null}
                                          <TextField
                                            label={intl.formatMessage({ id: 'accountMarket.publishDialog.entryName', defaultMessage: 'Item name' })}
                                            value={nestedEntry.name}
                                            onChange={(event) => handleEntryFieldChange(nestedEntry.id, (current) => ({
                                              ...current,
                                              name: event.target.value,
                                            }))}
                                            fullWidth
                                          />
                                        </Box>
                                        <TextField
                                          select
                                          label={intl.formatMessage({ id: 'accountMarket.publishDialog.entryKind', defaultMessage: 'Item type' })}
                                          value={nestedEntry.kind}
                                          onChange={(event) => handleEntryFieldChange(nestedEntry.id, (current) => ({
                                            ...current,
                                            kind: event.target.value as AccountMarketEntryKind,
                                          }))}
                                          fullWidth
                                        >
                                          {(['ship', 'ccu', 'bundle', 'extra', 'highlight'] as const).map((entryKind) => (
                                            <MenuItem key={entryKind} value={entryKind}>
                                              {getEntryKindLabel(intl, entryKind)}
                                            </MenuItem>
                                          ))}
                                        </TextField>
                                        <IconButton size="small" color="error" onClick={() => handleRemoveEntry(nestedEntry.id)}>
                                          <Trash2 size={16} />
                                        </IconButton>
                                      </Box>
                                    ))}
                                  </Box>
                                )}
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

            <Divider />

            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                <FormattedMessage id="accountMarket.publishDialog.unresolvedTitle" defaultMessage="Items that need your review" />
              </Typography>
              {!hasLoadedDraft && !editingListing ? (
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage
                    id="accountMarket.publishDialog.unresolvedPendingLoad"
                    defaultMessage="If anything needs attention, it will appear here after you import the synced hangar."
                  />
                </Typography>
              ) : draft.issues.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage id="accountMarket.publishDialog.unresolvedEmpty" defaultMessage="Everything looks ready. Review the listing details above, then publish when you are ready." />
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {draft.issues.map((issue) => (
                    <Box key={issue.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                      <Typography variant="subtitle2">{issue.name}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {issue.reason}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                        <Chip
                          size="small"
                          color={issue.resolution === 'manual' ? 'success' : 'default'}
                          label={intl.formatMessage({ id: 'accountMarket.issue.manual', defaultMessage: 'Use my edited name' })}
                          onClick={() => setDraft((current) => ({
                            ...current,
                            issues: current.issues.map((entry) => entry.id === issue.id ? { ...entry, resolution: 'manual' } : entry),
                          }))}
                        />
                        <Chip
                          size="small"
                          color={issue.resolution === 'ignore' ? 'warning' : 'default'}
                          label={intl.formatMessage({ id: 'accountMarket.issue.ignore', defaultMessage: 'Do not include this' })}
                          onClick={() => setDraft((current) => ({
                            ...current,
                            issues: current.issues.map((entry) => entry.id === issue.id ? { ...entry, resolution: 'ignore' } : entry),
                          }))}
                        />
                        <Chip
                          size="small"
                          color={issue.resolution === 'pending' ? 'info' : 'default'}
                          label={intl.formatMessage({ id: 'accountMarket.issue.pending', defaultMessage: 'Review later' })}
                          onClick={() => setDraft((current) => ({
                            ...current,
                            issues: current.issues.map((entry) => entry.id === issue.id ? { ...entry, resolution: 'pending' } : entry),
                          }))}
                        />
                      </Box>
                      <TextField
                        label={intl.formatMessage({ id: 'accountMarket.issue.manualName', defaultMessage: 'Manual entry name' })}
                        value={manualIssueNames[issue.id] || issue.manualName}
                        onChange={(event) => setManualIssueNames((current) => ({
                          ...current,
                          [issue.id]: event.target.value,
                        }))}
                        size="small"
                        fullWidth
                      />
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button variant="contained" onClick={() => void handlePublish()} disabled={isSubmitting || isPreparingDraft || unresolvedBlockingIssues.length > 0}>
            {editingListing
              ? <FormattedMessage id="accountMarket.publishDialog.save" defaultMessage="Save changes" />
              : <FormattedMessage id="accountMarket.publishDialog.publish" defaultMessage="Publish listing" />}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
