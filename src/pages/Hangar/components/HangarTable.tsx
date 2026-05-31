import React, { useEffect, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { BundleItem, OtherItem, selectUsersHangarItems, ShipItem } from "@/store/upgradesStore";
import { Typography, TextField, InputAdornment, TableContainer, TableHead, TableRow, TableCell, TableBody, TablePagination, Box, Table, FormControlLabel, Checkbox, Divider, IconButton, Collapse, Button, Tooltip, SwipeableDrawer } from "@mui/material";
import { Search, ChevronsRight, BadgePercent, CircleUser, Gift, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, SquareArrowOutUpRight, Archive, X } from "lucide-react";
import { Ship } from "@/types";
import { Link } from "react-router";
import { StoredCompletedPath } from "../../CCUPlanner/services/PathFinderService";
import MarkdownPreview from '@uiw/react-markdown-preview';
import { getShipThumbLarge } from "@/utils/shipImage";
import { findShipByIdOrName, getShipDisplayName, getShipManufacturerDisplayName, resolveStoredCcuShip } from "@/utils/shipDisplay";
import HangarToolbar from "./HangarToolbar";
import useMobileInfiniteRows from "@/hooks/useMobileInfiniteRows";
import ShipInfoDialog from "@/components/ShipInfoDialog";
import { formatMarketCcuResourceName } from "@/pages/Market/marketI18n";

interface DisplayEquipmentItem {
  pageId?: number;
  id: string;
  name: string;
  type: string;
  manufacturer?: string;
  imageUrl?: string;
  value: number;
  canGift: boolean;
  isBuyBack: boolean;
  from: {
    name: string;
    imageUrl?: string;
    medias: {
      productThumbMediumAndSmall: string;
    };
    msrp: number;
  };
  to: {
    name: string;
    imageUrl?: string;
    medias: {
      productThumbMediumAndSmall: string;
    };
    msrp: number;
  };
  belongsTo: number;
  quantity?: number;
  pageIds?: number[];
  insurance?: string;
  ships?: Partial<ShipItem>[];
  others?: Partial<OtherItem>[];
  groupedItems?: DisplayEquipmentItem[];
  ownerCount?: number;
  hasMultipleValues?: boolean;
  totalCost?: number;
}

interface BundleTextItem {
  key: string;
  type: string;
  name: string;
  details?: string[];
}

const normalizeShipName = (name: string) => name.toUpperCase().trim();
const getCcuPairKey = (from: string, to: string) => `${normalizeShipName(from)}->${normalizeShipName(to)}`;
const getCcuGroupKey = (from: string, to: string, isBuyBack: boolean) => `${getCcuPairKey(from, to)}|${isBuyBack ? 'buyback' : 'hangar'}`;
const MAX_VISIBLE_BUNDLE_TEXT_ITEMS = 4;
const normalizeHangarTextKey = (value?: string | null) => value?.trim().replace(/\s+/g, ' ').toUpperCase() || '';
const normalizeHangarNumberKey = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const getEquipmentImageSrc = (item: Pick<DisplayEquipmentItem, 'imageUrl' | 'from'>) =>
  item.imageUrl ||
  getShipThumbLarge(item.from as Ship) ||
  '';

const getEquipmentRowKey = (item: DisplayEquipmentItem, absoluteIndex: number) =>
  `${item.type}-${item.id}-${item.belongsTo}-${item.pageId ?? 'na'}-${absoluteIndex}`;

const getBundleShipContentKey = (item: Partial<ShipItem>) => [
  `id:${normalizeHangarNumberKey(item.id)}`,
  `name:${normalizeHangarTextKey(item.name)}`,
  `insurance:${normalizeHangarTextKey(item.insurance)}`,
].join('|');

const getBundleOtherContentKey = (item: Partial<OtherItem>) => [
  `name:${normalizeHangarTextKey(item.name)}`,
  `type:${normalizeHangarTextKey(item.type)}`,
  `image:${normalizeHangarTextKey(item.image)}`,
  `withImage:${item.withImage ? 'yes' : 'no'}`,
].join('|');

const getContentMultisetKey = <T extends { quantity?: number }>(
  items: T[] | undefined,
  getItemKey: (item: T) => string,
) => {
  const counts = new Map<string, number>();

  items?.forEach((item) => {
    const itemKey = getItemKey(item);
    counts.set(itemKey, (counts.get(itemKey) || 0) + (item.quantity || 1));
  });

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}#${count}`)
    .join('||');
};

const getEquipmentMergeKey = (item: DisplayEquipmentItem) => {
  const baseKey = [
    `type:${item.type}`,
    `source:${item.isBuyBack ? 'buyback' : 'hangar'}`,
    `gift:${item.canGift ? 'yes' : 'no'}`,
    `name:${normalizeHangarTextKey(item.name)}`,
    `value:${normalizeHangarNumberKey(item.value)}`,
    `insurance:${normalizeHangarTextKey(item.insurance)}`,
  ];

  if (item.type === 'Ship') {
    baseKey.push(`ship:${normalizeHangarTextKey(item.id)}`);
    baseKey.push(`shipName:${normalizeHangarTextKey(item.from?.name || item.name)}`);
  }

  if (item.type === 'Bundle') {
    baseKey.push(`ships:${getContentMultisetKey(item.ships, getBundleShipContentKey)}`);
    baseKey.push(`others:${getContentMultisetKey(item.others, getBundleOtherContentKey)}`);
  }

  return baseKey.join('|');
};

const mergeDisplayEquipmentItems = (items: DisplayEquipmentItem[]): DisplayEquipmentItem[] => {
  const grouped = new Map<string, DisplayEquipmentItem[]>();

  items.forEach((item) => {
    const key = getEquipmentMergeKey(item);
    const bucket = grouped.get(key) || [];
    bucket.push(item);
    grouped.set(key, bucket);
  });

  return Array.from(grouped.entries()).map(([key, group]): DisplayEquipmentItem => {
    const first = group[0];

    if (group.length === 1) {
      return first;
    }

    const totalQuantity = group.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const totalCost = group.reduce((sum, item) => sum + item.value * (item.quantity || 1), 0);
    const pageIds = Array.from(new Set(group.flatMap((item) => [
      ...(item.pageIds || []),
      ...(item.pageId ? [item.pageId] : []),
    ]))).sort((left, right) => left - right);

    return {
      ...first,
      id: `${first.type.toLowerCase()}-group-${key}`,
      quantity: totalQuantity,
      pageId: first.pageId || pageIds[0],
      pageIds,
      groupedItems: group,
      ownerCount: new Set(group.map(item => item.belongsTo)).size,
      hasMultipleValues: new Set(group.map(item => item.value)).size > 1,
      totalCost,
    };
  });
};

const getHangarDetailUrl = (item: Pick<DisplayEquipmentItem, 'isBuyBack' | 'pageId' | 'type'>) => {
  if (!item.pageId) {
    return '';
  }

  if (item.isBuyBack) {
    return `https://robertsspaceindustries.com/en/account/buy-back-pledges?page=${item.pageId}&pagesize=1`;
  }

  return `https://robertsspaceindustries.com/en/account/pledges?page=${Math.ceil(item.pageId / 10)}`;
};

const getBundlePreviewImage = (item: Pick<DisplayEquipmentItem, 'ships' | 'others'>, ships: Ship[]) => {
  const bundleShip = item.ships?.find((bundleShip) => bundleShip.name);
  if (bundleShip?.name) {
    const shipInfo = ships.find((ship) => ship.name.toUpperCase().trim() === bundleShip.name?.toUpperCase().trim());
    const image = getShipThumbLarge(shipInfo);
    if (image) {
      return image;
    }
  }

  const otherWithImage = item.others?.find((other) => other.image);
  if (otherWithImage?.image) {
    return otherWithImage.image.replace('subscribers_vault_thumbnail', 'product_thumb_large');
  }

  return '';
};

// MARK: Bundle中船只图片的轮播组件
function BundleImageSlider({ bundleShips, bundleOthers, ships, bundleName, isBuyBack, isLti }: {
  bundleShips: Partial<ShipItem>[],
  bundleOthers: Partial<OtherItem>[],
  ships: Ship[],
  bundleName: string,
  isBuyBack: boolean,
  isLti: boolean
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // 获取Bundle中船只的图片
  const images = useMemo(() => Array.from(new Set([
    ...bundleShips
      .map(bundleShip => {
        const shipInfo = ships.find(s =>
          bundleShip.name && s.name.toUpperCase().trim() === bundleShip.name.toUpperCase().trim()
        );
        return getShipThumbLarge(shipInfo);
      })
      .filter(img => img) as string[],
    ...bundleOthers.map(other => other.image?.replace('subscribers_vault_thumbnail', 'product_thumb_large'))
      .filter(img => img) as string[]
  ])), [bundleOthers, bundleShips, ships]);

  const currentImage = images[currentIndex] || images[0];

  useEffect(() => {
    setCurrentIndex(0);
  }, [images]);

  // 如果没有图片，显示一个默认的空白图片区域
  if (images.length === 0) {
    return (
      <div className="relative w-[320px] h-[180px] bg-gray-200 flex items-center justify-center">
        <Typography variant="subtitle1">
          <FormattedMessage id="hangar.noImages" defaultMessage="No ship images available" />
        </Typography>
        <div className='absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center justify-center'>
          <span className='text-white text-sm'>
            {isBuyBack && <FormattedMessage id="hangar.buyback" defaultMessage="Buyback:" />} {bundleName}
          </span>
        </div>
      </div>
    );
  }

  const nextSlide = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + images.length) % images.length);
  };

  return (
    <div className="relative w-[320px] h-[180px]">
      <Box
        key={currentImage}
        component="img"
        sx={{ width: 320, height: 180, objectFit: 'cover' }}
        src={currentImage}
        alt={`Ship in ${bundleName}`}
      />
      {images.length > 1 && (
        <>
          <IconButton
            size="small"
            onClick={prevSlide}
            sx={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              bgcolor: 'rgba(0,0,0,0.5)',
              color: 'white',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }
            }}
          >
            <ChevronLeft size={20} />
          </IconButton>
          <IconButton
            size="small"
            onClick={nextSlide}
            sx={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              bgcolor: 'rgba(0,0,0,0.5)',
              color: 'white',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }
            }}
          >
            <ChevronRight size={20} />
          </IconButton>
          {/* <Box 
            sx={{ 
              position: 'absolute', 
              bottom: 30, 
              left: 0, 
              right: 0, 
              display: 'flex', 
              justifyContent: 'center', 
              gap: 0.5 
            }}
          >
            {shipImages.map((_, i) => (
              <Box 
                key={i} 
                sx={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  bgcolor: i === currentIndex ? 'white' : 'rgba(255,255,255,0.5)' 
                }} 
              />
            ))}
          </Box> */}
        </>
      )}
      <div className='absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center justify-center'>
        <span className='text-white text-sm flex items-center justify-center gap-2'>
          {isLti && <span className="text-red-500">LTI</span>} {isBuyBack && <span className="shrink-0 text-nowrap"><FormattedMessage id="hangar.buyback" defaultMessage="Buyback:" /></span>} {bundleName}
        </span>
      </div>
    </div>
  );
}

function BundleContentCard({
  type,
  name,
  imageUrl,
  meta,
  onClick,
}: {
  type?: string;
  name?: string;
  imageUrl?: string;
  meta?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        width: 220,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <Box
        component="img"
        sx={{ width: '100%', height: 120, objectFit: 'cover' }}
        src={imageUrl}
        alt={name || ''}
      />
      <div className="p-2 flex flex-col">
        <span className="text-gray-500 dark:text-gray-400">{type || '-'}</span>
        <span className="text-md font-bold">{name || '-'}</span>
        {meta}
      </div>
    </Box>
  );
}

function BundleTextItemsBlock({ items }: { items: BundleTextItem[] }) {
  const intl = useIntl();
  const visibleItems = items.slice(0, MAX_VISIBLE_BUNDLE_TEXT_ITEMS);
  const hiddenCount = Math.max(items.length - visibleItems.length, 0);

  const renderItem = (item: BundleTextItem, useTooltipColors = false) => (
    <Box
      key={item.key}
    >
      <Typography
        variant="body2"
        sx={{
          fontWeight: 700,
          color: useTooltipColors ? 'inherit' : 'text.primary'
        }}
      >
        {item.name || '-'}
      </Typography>
    </Box>
  );

  const content = (
    <Box
      sx={{
        minWidth: 220,
        maxWidth: 320,
        px: 2,
        py: 1.5,
        borderLeft: '3px solid',
        borderColor: 'divider',
        backgroundColor: 'action.hover',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        cursor: hiddenCount > 0 ? 'help' : 'default'
      }}
    >
      {visibleItems.map(item => renderItem(item))}
      {hiddenCount > 0 && (
        <Typography variant="caption" color="primary">
          {intl.formatMessage(
            { id: 'hangar.moreItems', defaultMessage: '+ {count} items' },
            { count: hiddenCount }
          )}
        </Typography>
      )}
    </Box>
  );

  if (hiddenCount === 0) {
    return content;
  }

  return (
    <Tooltip
      arrow
      placement="top-start"
      title={
        <Box
          sx={{
            maxWidth: 320,
            maxHeight: 320,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
            py: 0.5
          }}
        >
          {items.map(item => renderItem(item, true))}
        </Box>
      }
    >
      <Box sx={{ display: 'inline-flex' }}>
        {content}
      </Box>
    </Tooltip>
  );
}

export default function HangarTable({ ships }: { ships: Ship[] }) {
  const intl = useIntl();
  const [ccus, setCcus] = useState<DisplayEquipmentItem[]>([]);
  const [hangarShips, setHangarShips] = useState<ShipItem[]>([]);
  const [hangarBundles, setHangarBundles] = useState<BundleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showCcus, setShowCcus] = useState(true);
  const [showShips, setShowShips] = useState(true);
  const [showHangarItems, setShowHangarItems] = useState(true);
  const [showBuybacks, setShowBuybacks] = useState(true);
  const [expandedBundles, setExpandedBundles] = useState<{ [key: string]: boolean }>({});
  const [expandedCcuGroups, setExpandedCcuGroups] = useState<{ [key: string]: boolean }>({});
  const [completedPaths] = useState<StoredCompletedPath[]>(JSON.parse(localStorage.getItem('completedPaths') || '[]'));
  const [hangarMarkdown, setHangarMarkdown] = useState<string>('');
  const [mobileDetailItem, setMobileDetailItem] = useState<DisplayEquipmentItem | null>(null);
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);

  const { locale } = intl;
  const { users } = useSelector((state: RootState) => state.upgrades);
  const items = useSelector(selectUsersHangarItems);

  // 计算每个CCU在完成路径中的使用数量，按 from/to 聚合
  const ccuUsageMap = useMemo(() => {
    const usage = new Map<string, number>();
    const shipIdNameMap = new Map<number, string>();
    ships.forEach(ship => shipIdNameMap.set(ship.id, ship.name));

    completedPaths.forEach(path => {
      path.path.edges?.forEach(edge => {
        if (!edge.sourceShipId || !edge.targetShipId) {
          return;
        }

        const fromShipName = shipIdNameMap.get(edge.sourceShipId);
        const toShipName = shipIdNameMap.get(edge.targetShipId);
        if (!fromShipName || !toShipName) {
          return;
        }

        const key = getCcuPairKey(fromShipName, toShipName);
        usage.set(key, (usage.get(key) || 0) + 1);
      });
    });

    return usage;
  }, [completedPaths, ships]);

  const getCcuUsage = (from: string, to: string) => ccuUsageMap.get(getCcuPairKey(from, to)) || 0;

  const matchesSearchTerm = (...values: Array<string | null | undefined>) => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();
    if (!normalizedSearchTerm) {
      return true;
    }

    return values.some((value) => value?.toLowerCase().includes(normalizedSearchTerm));
  };

  const resolveShipInfo = (shipTarget?: {
    id?: number | string | null;
    name?: string | null;
    localizedName?: string | null;
    alias?: string | null;
  } | null) => {
    return findShipByIdOrName(ships, shipTarget);
  };

  const getShipTargetDisplayName = (shipTarget?: {
    id?: number | string | null;
    name?: string | null;
    localizedName?: string | null;
    alias?: string | null;
  } | null) => {
    const shipInfo = resolveShipInfo(shipTarget);
    return getShipDisplayName(shipInfo || shipTarget) || shipTarget?.name?.trim() || '-';
  };

  const getShipTargetManufacturerName = (shipTarget?: {
    id?: number | string | null;
    name?: string | null;
    localizedName?: string | null;
    alias?: string | null;
  } | null) => {
    const shipInfo = resolveShipInfo(shipTarget);
    return getShipManufacturerDisplayName(shipInfo);
  };

  const getDisplayEquipmentName = (item: DisplayEquipmentItem) => {
    if (item.type === 'CCU') {
      return formatMarketCcuResourceName(
        intl,
        getShipTargetDisplayName(item.from),
        getShipTargetDisplayName(item.to),
      );
    }

    if (item.type === 'Ship') {
      return getShipTargetDisplayName({ id: item.id, name: item.name });
    }

    return item.name;
  };

  const handleOpenShipDetail = (shipTarget?: {
    id?: number | string | null;
    name?: string | null;
    localizedName?: string | null;
    alias?: string | null;
  } | null) => {
    const shipInfo = resolveShipInfo(shipTarget);
    if (shipInfo) {
      setSelectedShip(shipInfo);
    }
  };

  const handleCloseShipDetail = () => {
    setSelectedShip(null);
  };

  useEffect(() => {
    const processStoreData = () => {
      const userCCUs = items.ccus
        .map(ccu => {
          const from = resolveStoredCcuShip(ships, ccu.parsed, 'from');
          const to = resolveStoredCcuShip(ships, ccu.parsed, 'to');

          if (!from || !to) {
            return undefined;
          }

          return {
            id: Math.random().toString(),
            name: ccu.name,
            type: 'CCU',
            value: ccu.value,
            canGift: ccu.canGift,
            from: from,
            to: to,
            imageUrl: undefined,
            belongsTo: ccu.belongsTo,
            isBuyBack: ccu.isBuyBack,
            quantity: ccu.quantity,
            pageId: ccu.pageId,
          }
        }).filter(ccu => ccu !== undefined);

      setCcus(userCCUs);
      setHangarShips(items.ships);
      setHangarBundles(items.bundles);

      setIsLoading(false);
    };

    processStoreData();
  }, [intl, items, ships]);

  useEffect(() => {
    const fetchHangarMarkdown = async () => {
      try {
        const response = await fetch('/docs/hangar.md');
        if (response.ok) {
          const text = await response.text();
          setHangarMarkdown(text);
        }
      } catch (err) {
        console.error('Failed to fetch hangar.md:', err);
      }
    };

    fetchHangarMarkdown();
  }, []);

  // 处理搜索
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(0); // 重置页码
  };

  // 处理分页
  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // 处理筛选器变化
  const handleCcuFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setShowCcus(event.target.checked);
    setPage(0); // 重置页码
  };

  // 处理ships和bundles的筛选
  const handleShipFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setShowShips(event.target.checked);
    setPage(0); // 重置页码
  };

  const handleHangarItemFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setShowHangarItems(event.target.checked);
    setPage(0); // 重置页码
  };

  const handleBuybackFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setShowBuybacks(event.target.checked);
    setPage(0); // 重置页码
  };

  // 展开/折叠Bundle
  const toggleBundleExpand = (bundleId: string) => {
    setExpandedBundles(prev => ({
      ...prev,
      [bundleId]: !prev[bundleId]
    }));
  };

  // 展开/折叠CCU明细
  const toggleCcuGroupExpand = (groupId: string) => {
    setExpandedCcuGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const openMobileDetail = (item: DisplayEquipmentItem) => {
    setMobileDetailItem(item);
  };

  const closeMobileDetail = () => {
    setMobileDetailItem(null);
  };

  const mergedCcus = useMemo<DisplayEquipmentItem[]>(() => {
    const grouped = new Map<string, DisplayEquipmentItem[]>();

    ccus.forEach(ccu => {
      const key = getCcuGroupKey(ccu.from.name, ccu.to.name, ccu.isBuyBack);
      const bucket = grouped.get(key) || [];
      bucket.push(ccu);
      grouped.set(key, bucket);
    });

    return Array.from(grouped.entries()).map(([key, group]) => {
      const first = group[0];
      const totalQuantity = group.reduce((sum, item) => sum + (item.quantity || 1), 0);
      const totalCost = group.reduce((sum, item) => sum + item.value * (item.quantity || 1), 0);
      const uniqueOwners = new Set(group.map(item => item.belongsTo)).size;
      const valueSet = new Set(group.map(item => item.value));

      return {
        ...first,
        id: `ccu-group-${key}`,
        quantity: totalQuantity,
        value: totalQuantity > 0 ? totalCost / totalQuantity : first.value,
        groupedItems: group,
        ownerCount: uniqueOwners,
        hasMultipleValues: valueSet.size > 1,
        totalCost,
      };
    });
  }, [ccus]);

  const shouldShowBySourceFilter = (item: Pick<DisplayEquipmentItem, 'isBuyBack'>) => (
    item.isBuyBack ? showBuybacks : showHangarItems
  );

  // MARK: 过滤和分页数据
  const filteredEquipment: DisplayEquipmentItem[] = [...(showCcus ? mergedCcus.filter(item =>
    matchesSearchTerm(
      item.name,
      getDisplayEquipmentName(item),
      item.from?.name,
      getShipTargetDisplayName(item.from),
      item.to?.name,
      getShipTargetDisplayName(item.to),
    )
  ) : []),
  ...(showShips ? hangarShips.filter(ship =>
    matchesSearchTerm(
      ship.name,
      getShipTargetDisplayName({ id: ship.id, name: ship.name }),
      getShipTargetManufacturerName({ id: ship.id, name: ship.name }),
    )
  ).map<DisplayEquipmentItem>(ship => {
    // 查找对应的船只信息
    const shipInfo = findShipByIdOrName(ships, { id: ship.id, name: ship.name });

    return {
      id: ship.id.toString(),
      name: ship.name,
      type: 'Ship',
      value: ship.value,
      canGift: ship.canGift,
      isBuyBack: ship.isBuyBack,
      from: {
        name: ship.name,
        imageUrl: getShipThumbLarge(shipInfo),
        medias: {
          productThumbMediumAndSmall: shipInfo?.medias?.productThumbMediumAndSmall || ''
        },
        msrp: shipInfo?.msrp || 0
      },
      to: {
        name: ship.name,
        imageUrl: getShipThumbLarge(shipInfo),
        medias: {
          productThumbMediumAndSmall: shipInfo?.medias?.productThumbMediumAndSmall || ''
        },
        msrp: shipInfo?.msrp || 0
      },
      imageUrl: getShipThumbLarge(shipInfo),
      belongsTo: ship.belongsTo,
      quantity: ship.quantity,
      pageId: ship.pageId,
      pageIds: ship.pageIds,
      insurance: ship.insurance,
      ships: [],
      others: []
    };
  }) : []),
  ...(showShips ? hangarBundles.filter(bundle =>
    // 匹配Bundle名称
    matchesSearchTerm(bundle.name) ||
    // 匹配Bundle内部ships的名称
    (bundle.ships || []).some(ship => 
      matchesSearchTerm(
        ship.name,
        getShipTargetDisplayName(ship),
      )
    ) ||
    // 匹配Bundle内部others的名称
    (bundle.others || []).some(other => 
      matchesSearchTerm(other.name)
    )
  ).map<DisplayEquipmentItem>(bundle => {
    // 计算Bundle中所有船只的MSRP总和
    const totalMsrp = (bundle.ships || []).reduce((sum, bundleShip) => {
      const shipInfo = ships.find(s =>
        bundleShip.name && s.name.toUpperCase().trim() === bundleShip.name.toUpperCase().trim()
      );
      return sum + (shipInfo?.msrp || 0);
    }, 0);

    return {
      id: `${bundle.belongsTo}-${bundle.pageId}`,
      name: bundle.name,
      type: 'Bundle',
      value: bundle.value, // 保留原始value，用于显示购买价格
      canGift: bundle.canGift,
      isBuyBack: bundle.isBuyBack,
      from: {
        name: bundle.name,
        imageUrl: undefined,
        medias: {
          productThumbMediumAndSmall: ''
        },
        msrp: totalMsrp // 使用计算出的MSRP总和
      },
      to: {
        name: bundle.name,
        imageUrl: undefined,
        medias: {
          productThumbMediumAndSmall: ''
        },
        msrp: totalMsrp // 使用计算出的MSRP总和
      },
      imageUrl: undefined,
      belongsTo: bundle.belongsTo,
      quantity: bundle.quantity,
      pageId: bundle.pageId,
      pageIds: bundle.pageIds,
      insurance: bundle.insurance,
      ships: bundle.ships,
      others: bundle.others
    };
  }) : [])].filter(item => shouldShowBySourceFilter(item));
  const mergedFilteredEquipment = mergeDisplayEquipmentItems(filteredEquipment);

  const isBuybackOnlyView = showBuybacks && !showHangarItems;
  const summaryItems = mergedFilteredEquipment.filter(item => isBuybackOnlyView ? item.isBuyBack : !item.isBuyBack);

  // 添加排序功能
  const sortedEquipment = [...mergedFilteredEquipment].sort((a, b) => {
    // 判断是否为不包含飞船的Bundle
    const isEmptyBundle = (item: typeof a) => 
      item.type === 'Bundle' && (!item.ships || item.ships.length === 0);
    
    // 如果其中一个是不包含飞船的Bundle，将它排在后面
    if (isEmptyBundle(a) && !isEmptyBundle(b)) return 1;
    if (!isEmptyBundle(a) && isEmptyBundle(b)) return -1;
    
    // 如果都不是空Bundle，优先按类型排序：Ship在前，然后是带飞船的Bundle，然后是CCU
    if (a.type !== b.type) {
      if (a.type === 'Ship') return -1;
      if (b.type === 'Ship') return 1;
      if (a.type === 'Bundle') return -1;
      if (b.type === 'Bundle') return 1;
    }

    // 然后buyback在后面显示
    if (a.isBuyBack !== b.isBuyBack) {
      return a.isBuyBack ? 1 : -1;
    }

    // 然后按价值排序：价值高的在前
    return b.value - a.value;
  });

  const {
    isMobile,
    displayedItems: mobileDisplayedEquipment,
    sentinelRef,
    hasMore,
  } = useMobileInfiniteRows(sortedEquipment, {
    resetKey: `${searchTerm}-${showCcus}-${showShips}-${showHangarItems}-${showBuybacks}`,
  });
  const paginatedStart = page * rowsPerPage;
  const paginatedEquipment = isMobile
    ? mobileDisplayedEquipment
    : sortedEquipment.slice(
        paginatedStart,
        paginatedStart + rowsPerPage
      );

  // Check if hangar is empty (based on original data, not filtered)
  const isHangarEmpty = hangarShips.length === 0 && ccus.length === 0 && hangarBundles.length === 0;

  return (<>
    <HangarToolbar ships={ships} />

    {!isHangarEmpty && (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1, flexBasis: { xs: '100%', md: '60%' } }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder={intl.formatMessage({ id: 'search.placeholder', defaultMessage: 'Search ships and upgrades...' })}
            value={searchTerm}
            onChange={handleSearchChange}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 0 }
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
        </Box>
        <Box sx={{ flexGrow: 1, flexBasis: { xs: '100%', md: '40%' } }}>
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 2, py: 1 }}>
            <Box sx={{ display: 'flex', width: '100%', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showHangarItems}
                      onChange={handleHangarItemFilterChange}
                      size="small"
                      color="primary"
                    />
                  }
                  label={intl.formatMessage({ id: 'hangar.filter.showHangarItems', defaultMessage: 'Hangar Items' })}
                  sx={{ minWidth: 'auto', mr: 2 }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showBuybacks}
                      onChange={handleBuybackFilterChange}
                      size="small"
                      color="primary"
                    />
                  }
                  label={intl.formatMessage({ id: 'hangar.filter.showBuybacks', defaultMessage: 'Buybacks' })}
                  sx={{ minWidth: 'auto', mr: 0 }}
                />
              </Box>
              <Divider orientation={isMobile ? "horizontal" : "vertical"} flexItem sx={{ mx: { sm: 2 }, my: { xs: 0.5, sm: 0 } }} />
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showShips}
                      onChange={handleShipFilterChange}
                      size="small"
                      color="primary"
                    />
                  }
                  label={intl.formatMessage({ id: 'hangar.filter.showShips', defaultMessage: 'Ships & Bundles' })}
                  sx={{ minWidth: 'auto', mr: 2 }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showCcus}
                      onChange={handleCcuFilterChange}
                      size="small"
                      color="primary"
                    />
                  }
                  label={intl.formatMessage({ id: 'hangar.filter.showCcus', defaultMessage: 'CCUs' })}
                  sx={{ minWidth: 'auto' }}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    )}

    {isLoading ? (
      <Typography align="center"><FormattedMessage id="loading" defaultMessage="Loading..." /></Typography>
    ) : isHangarEmpty ? (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        {hangarMarkdown && (
          <div className='overflow-auto px-[20px] max-w-[1200px] mx-auto'>
            <MarkdownPreview
              source={hangarMarkdown}
              wrapperElement={{
                'data-color-mode': document.documentElement.classList.contains('dark') ? 'dark' : 'light',
              }}
            />
          </div>
        )}
      </Box>
    ) : isMobile ? (
      <Box sx={{ width: '100%' }}>
        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'baseline' }}>
          <Typography variant="body1" color="primary" sx={{ fontWeight: 700 }}>
            <FormattedMessage
              id={isBuybackOnlyView ? "hangar.buybackValue" : "hangar.totalValue"}
              defaultMessage={isBuybackOnlyView ? "Buyback value:" : "Hangar value:"}
            />
            {" "}
            {summaryItems.reduce((sum, item) => sum + item.value * (item.quantity || 1), 0).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            <FormattedMessage
              id={isBuybackOnlyView ? "hangar.buybackMsrp" : "hangar.totalMsrp"}
              defaultMessage={isBuybackOnlyView ? "Buyback MSRP:" : "MSRP:"}
            />
            {" "}
            {(summaryItems.reduce((sum, item) => {
              const upgradeValue = item.to?.msrp && item.from?.msrp ? item.to.msrp - item.from.msrp : 0;
              const shipsValue = item.ships?.reduce((shipSum, ship) => {
                if (!ship?.name) return shipSum;
                const matchingShip = ships.find(s => s.name.toUpperCase().trim() === ship.name?.toUpperCase().trim());
                return shipSum + (matchingShip?.msrp || 0);
              }, 0) || 0;

              const quantity = item.quantity || 1;

              return sum + upgradeValue * quantity + shipsValue * quantity;
            }, 0) / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {paginatedEquipment.map((item, index) => {
            const isCcu = item.type === 'CCU';
            const isBundle = item.type === 'Bundle';
            const displayName = getDisplayEquipmentName(item);
            const fromDisplayName = getShipTargetDisplayName(item.from);
            const toDisplayName = getShipTargetDisplayName(item.to);
            const shipManufacturerName = item.type === 'Ship'
              ? getShipTargetManufacturerName({ id: item.id, name: item.name })
              : '';
            const previewImage = isCcu
              ? getShipThumbLarge(item.to as Ship) || getShipThumbLarge(item.from as Ship)
              : isBundle
                ? getBundlePreviewImage(item, ships)
                : getEquipmentImageSrc(item);
            const usedCount = isCcu ? getCcuUsage(item.from.name, item.to.name) : 0;
            const totalCount = item.quantity || 1;
            const remainingCount = Math.max(totalCount - usedCount, 0);
            const ownerLabel = item.ownerCount && item.ownerCount > 1
              ? intl.formatMessage({ id: 'hangar.multipleOwners', defaultMessage: '{count} owners' }, { count: item.ownerCount })
              : users.find(user => user.id === item.belongsTo)?.nickname || '-';
            const currentValue = isCcu
              ? ((item.to.msrp - item.from.msrp) / 100)
              : (item.from.msrp / 100);
            const costValue = item.groupedItems && item.groupedItems.length > 1
              ? (item.totalCost || 0)
              : item.value;
            const discountText = isCcu && item.to.msrp - item.from.msrp !== 0
              ? `${(((costValue - ((item.to.msrp - item.from.msrp) / 100)) / ((item.to.msrp - item.from.msrp) / 100)) * 100).toFixed(2)}%`
              : null;
            const canOpenShipDetail = item.type === 'Ship' && Boolean(resolveShipInfo({ id: item.id, name: item.name }));

            return (
              <Box
                key={getEquipmentRowKey(item, index)}
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  py: 1.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box
                  sx={{
                    position: 'relative',
                    width: 104,
                    height: 104,
                    flexShrink: 0,
                    overflow: 'hidden',
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                  }}
                >
                  {previewImage && (
                    <Box
                      component="img"
                      src={previewImage}
                      alt={item.name}
                      sx={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  )}
                  {!!item.quantity && (
                    <Box
                      sx={{
                        position: 'absolute',
                        right: 6,
                        bottom: 6,
                        px: 0.9,
                        py: 0.15,
                        borderRadius: 999,
                        bgcolor: 'rgba(0,0,0,0.68)',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      x{item.quantity}
                    </Box>
                  )}
                  {item.insurance === "LTI" && (
                    <Box
                      sx={{
                        position: 'absolute',
                        right: 6,
                        top: 6,
                        px: 0.8,
                        py: 0.15,
                        borderRadius: 1,
                        bgcolor: '#ef4444',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      LTI
                    </Box>
                  )}
                </Box>

                <Box sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Typography
                    variant="subtitle1"
                    fontWeight={800}
                    sx={{
                      lineHeight: 1.25,
                      pr: 1,
                      cursor: canOpenShipDetail ? 'pointer' : 'default',
                    }}
                    onClick={canOpenShipDetail ? () => handleOpenShipDetail({ id: item.id, name: item.name }) : undefined}
                  >
                    {displayName}
                  </Typography>

                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                    {isCcu ? `${fromDisplayName} -> ${toDisplayName}` : shipManufacturerName || ownerLabel}
                  </Typography>

                  <Box sx={{ mt: 1 }}>
                    <Typography variant="h5" sx={{ lineHeight: 1, fontWeight: 500, color: '#1976d2' }}>
                      {costValue.toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35, fontWeight: 600 }}>
                      MSRP {currentValue.toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                      {discountText ? ` (${discountText})` : ''}
                    </Typography>
                  </Box>

                  <Box sx={{ mt: 1.25, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                    <Typography variant="caption" color="text.secondary">
                      {item.isBuyBack ? `Buyback ${item.type}` : item.type}
                    </Typography>
                    {!item.isBuyBack && <Gift className={`${item.canGift ? 'text-green-500' : 'text-red-400'} w-4 h-4`} />}
                    {item.insurance === "LTI" && (
                      <Typography variant="caption" color="error" sx={{ fontWeight: 700 }}>
                        LTI
                      </Typography>
                    )}
                    {isCcu && (
                      <Typography variant="caption" color="text.secondary">
                        Used {usedCount} / Left {remainingCount}
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button size="small" variant="text" onClick={() => openMobileDetail(item)}>
                      <FormattedMessage id="hangar.mobileViewDetails" defaultMessage="VIEW DETAILS" />
                    </Button>
                  </Box>
                </Box>
              </Box>
            );
          })}
          {hasMore && <div ref={sentinelRef} className="h-8 w-full" aria-hidden="true" />}
        </Box>

        <SwipeableDrawer
          anchor="bottom"
          open={Boolean(mobileDetailItem)}
          onClose={closeMobileDetail}
          onOpen={() => undefined}
          disableDiscovery={false}
          disableSwipeToOpen
          sx={{
            '& .MuiDrawer-paper': {
              maxHeight: '88vh',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
            },
          }}
        >
          {mobileDetailItem && (() => {
            const detailItem = mobileDetailItem;
            const isCcu = detailItem.type === 'CCU';
            const isBundle = detailItem.type === 'Bundle';
            const displayName = getDisplayEquipmentName(detailItem);
            const fromDisplayName = getShipTargetDisplayName(detailItem.from);
            const toDisplayName = getShipTargetDisplayName(detailItem.to);
            const shipManufacturerName = detailItem.type === 'Ship'
              ? getShipTargetManufacturerName({ id: detailItem.id, name: detailItem.name })
              : '';
            const previewImage = isCcu
              ? getShipThumbLarge(detailItem.to as Ship) || getShipThumbLarge(detailItem.from as Ship)
              : isBundle
                ? getBundlePreviewImage(detailItem, ships)
                : getEquipmentImageSrc(detailItem);
            const usedCount = isCcu ? getCcuUsage(detailItem.from.name, detailItem.to.name) : 0;
            const totalCount = detailItem.quantity || 1;
            const remainingCount = Math.max(totalCount - usedCount, 0);
            const ownerName = detailItem.ownerCount && detailItem.ownerCount > 1
              ? intl.formatMessage({ id: 'hangar.multipleOwners', defaultMessage: '{count} owners' }, { count: detailItem.ownerCount })
              : users.find(user => user.id === detailItem.belongsTo)?.nickname || '-';

            return (
              <Box sx={{ px: 2, pb: 3, pt: 1.5, overflowY: 'auto' }}>
                <Box sx={{ mx: 'auto', mb: 2, height: 6, width: 56, borderRadius: 999, bgcolor: 'divider' }} />
                <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    {displayName}
                  </Typography>
                  <IconButton size="small" onClick={closeMobileDetail}>
                    <X className="w-5 h-5" />
                  </IconButton>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  {previewImage && (
                    <Box
                      component="img"
                      src={previewImage}
                      alt={detailItem.name}
                      sx={{ width: 132, height: 96, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                    />
                  )}
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      {isCcu ? `${fromDisplayName} -> ${toDisplayName}` : shipManufacturerName || ownerName}
                    </Typography>
                    <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {detailItem.isBuyBack ? `Buyback ${detailItem.type}` : detailItem.type}
                      </Typography>
                      {detailItem.insurance === "LTI" && (
                        <Typography variant="caption" color="error" sx={{ fontWeight: 700 }}>
                          LTI
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      <FormattedMessage id="hangar.cost" defaultMessage="Cost" />
                    </Typography>
                    <Typography variant="h6" color="primary">
                      {(detailItem.groupedItems && detailItem.groupedItems.length > 1 ? (detailItem.totalCost || 0) : detailItem.value).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      <FormattedMessage id="hangar.msrp" defaultMessage="MSRP:" />
                    </Typography>
                    <Typography variant="h6">
                      {((isCcu ? (detailItem.to.msrp - detailItem.from.msrp) : detailItem.from.msrp) / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      <FormattedMessage id="hangar.owner" defaultMessage="Owner" />
                    </Typography>
                    <Typography variant="body1">{ownerName}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      <FormattedMessage id="hangar.quantity" defaultMessage="Quantity" />
                    </Typography>
                    <Typography variant="body1">{totalCount}</Typography>
                  </Box>
                  {isCcu && (
                    <Box sx={{ gridColumn: '1 / -1' }}>
                      <Typography variant="caption" color="text.secondary">
                        <FormattedMessage id="hangar.usage" defaultMessage="Usage:" />
                      </Typography>
                      <Typography variant="body1">
                        <FormattedMessage
                          id="hangar.ccuUsage"
                          defaultMessage="Used: {used}, Remaining: {remaining}"
                          values={{ used: usedCount, remaining: remainingCount }}
                        />
                      </Typography>
                    </Box>
                  )}
                </Box>

                {!!detailItem.pageId && (
                  <Box sx={{ mt: 3 }}>
                    <Button
                      component={Link}
                      to={getHangarDetailUrl(detailItem)}
                      target="_blank"
                      variant="outlined"
                      startIcon={<SquareArrowOutUpRight className='w-4 h-4' />}
                      fullWidth
                    >
                      <FormattedMessage id="hangar.viewInHangar" defaultMessage="RSI Hangar" />
                    </Button>
                  </Box>
                )}

                {detailItem.type === 'Ship' && (
                  <Box sx={{ mt: 3 }}>
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={() => handleOpenShipDetail({ id: detailItem.id, name: detailItem.name })}
                    >
                      <FormattedMessage id="hangar.openShipDetail" defaultMessage="Ship detail" />
                    </Button>
                  </Box>
                )}

                {isBundle && (
                  <Box sx={{ mt: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
                      <FormattedMessage id="hangar.expand" defaultMessage="Items" />
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {detailItem.ships?.map((bundleShip, index) => {
                        const shipInfo = resolveShipInfo(bundleShip);
                        const imageUrl = getShipThumbLarge(shipInfo || undefined);
                        const itemKey = `${getBundleShipContentKey(bundleShip)}-${index}`;

                        return (
                          <Box
                            key={`drawer-ship-${itemKey}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleOpenShipDetail(bundleShip)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleOpenShipDetail(bundleShip);
                              }
                            }}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.5,
                              py: 0.75,
                              px: 1,
                              mx: -1,
                              borderRadius: 1,
                              cursor: shipInfo ? 'pointer' : 'default',
                              '&:hover': shipInfo ? {
                                backgroundColor: 'action.hover',
                              } : undefined,
                            }}
                          >
                            {imageUrl && (
                              <Box
                                component="img"
                                src={imageUrl}
                                alt={bundleShip.name || ''}
                                sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                              />
                            )}
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography variant="body2" fontWeight={700} noWrap>
                                {getShipTargetDisplayName(bundleShip)}
                              </Typography>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {shipInfo?.msrp && (
                                  <Typography variant="caption" color="text.secondary">
                                    <FormattedMessage id="hangar.msrp" defaultMessage="MSRP:" />{" "}
                                    {(shipInfo.msrp / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                                  </Typography>
                                )}
                                {bundleShip.insurance && (
                                  <Typography variant="caption" color="text.secondary">
                                    <FormattedMessage id="hangar.insurance" defaultMessage="Insurance:" />{" "}
                                    {bundleShip.insurance}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          </Box>
                        );
                      })}
                      {detailItem.others?.map((bundleOther, index) => {
                        const imageUrl = bundleOther.image?.replace('subscribers_vault_thumbnail', 'product_thumb_large');

                        const itemKey = `${getBundleOtherContentKey(bundleOther)}-${index}`;

                        if (imageUrl) {
                          return (
                            <Box
                              key={`drawer-other-${itemKey}`}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5,
                                py: 0.75,
                              }}
                            >
                              <Box
                                component="img"
                                src={imageUrl}
                                alt={bundleOther.name || ''}
                                sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                              />
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2">{bundleOther.name || '-'}</Typography>
                                {bundleOther.type && (
                                  <Typography variant="caption" color="text.secondary">
                                    {bundleOther.type}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          );
                        }

                        return (
                          <Typography key={`drawer-other-${itemKey}`} variant="body2" color="text.secondary">
                            {bundleOther.name || '-'}
                          </Typography>
                        );
                      })}
                    </Box>
                  </Box>
                )}

                {detailItem.groupedItems && detailItem.groupedItems.length > 1 && (
                  <Box sx={{ mt: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
                      {isCcu ? (
                        <FormattedMessage
                          id="hangar.mergedCcuDetails"
                          defaultMessage="Merged CCU details ({count} records)"
                          values={{ count: detailItem.groupedItems.length }}
                        />
                      ) : (
                        <FormattedMessage
                          id="hangar.mergedItemDetails"
                          defaultMessage="Merged item details ({count} records)"
                          values={{ count: detailItem.groupedItems.length }}
                        />
                      )}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {detailItem.groupedItems.map((groupedItem, index) => {
                        const groupedOwnerName = users.find(user => user.id === groupedItem.belongsTo)?.nickname || '-';
                        const quantity = groupedItem.quantity || 1;
                        const lineTotal = groupedItem.value * quantity;

                        return (
                          <Box
                            key={getEquipmentRowKey(groupedItem, index)}
                            sx={{
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                              px: 0,
                              py: 1.25,
                            }}
                          >
                            <Typography variant="body2" fontWeight={700}>
                              {groupedOwnerName}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              x{quantity} · {groupedItem.value.toLocaleString(locale, { style: 'currency', currency: 'USD' })} /ea · {lineTotal.toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })()}
        </SwipeableDrawer>
      </Box>
    ) : (
      <Box sx={{ width: '100%', overflow: 'auto' }}>
        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2 }}>
          <Typography variant="h6" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FormattedMessage
              id={isBuybackOnlyView ? "hangar.buybackValue" : "hangar.totalValue"}
              defaultMessage={isBuybackOnlyView ? "Buyback value:" : "Hangar value:"}
            />
            <span>
              {summaryItems.reduce((sum, item) => sum + item.value * (item.quantity || 1), 0).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
            </span>
          </Typography>
          <Typography variant="h6" color="secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FormattedMessage
              id={isBuybackOnlyView ? "hangar.buybackMsrp" : "hangar.totalMsrp"}
              defaultMessage={isBuybackOnlyView ? "Buyback MSRP:" : "MSRP:"}
            />
            <span>
              {(summaryItems.reduce((sum, item) => {
                // Calculate upgrade value if exists
                const upgradeValue = item.to?.msrp && item.from?.msrp ? item.to.msrp - item.from.msrp : 0;
                
                // Calculate ships value if exists
                const shipsValue = item.ships?.reduce((shipSum, ship) => {
                  if (!ship?.name) return shipSum;
                  const matchingShip = ships.find(s => s.name.toUpperCase().trim() === ship.name?.toUpperCase().trim());
                  return shipSum + (matchingShip?.msrp || 0);
                }, 0) || 0;

                const quantity = item.quantity || 1;

                return sum + upgradeValue * quantity + shipsValue * quantity;
              }, 0) / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
            </span>
          </Typography>
        </Box>
        <TableContainer sx={{ mb: 2 }}>
          <Table aria-label={intl.formatMessage({ id: 'hangar.table.ariaLabel', defaultMessage: 'Equipment table' })}>
            <TableHead>
              <TableRow>
                <TableCell width="380px">
                  <FormattedMessage id="hangar.image" defaultMessage="Image" />
                </TableCell>
                <TableCell>
                  <FormattedMessage id="hangar.details" defaultMessage="Details" />
                </TableCell>
                <TableCell width="120px">
                  <FormattedMessage id="hangar.type" defaultMessage="Type" />
                </TableCell>
                <TableCell width="120px">
                  <FormattedMessage id="hangar.action" defaultMessage="Action" />
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedEquipment.map((item, index) => {
                const displayName = getDisplayEquipmentName(item);
                const fromDisplayName = getShipTargetDisplayName(item.from);
                const toDisplayName = getShipTargetDisplayName(item.to);
                const shipManufacturerName = item.type === 'Ship'
                  ? getShipTargetManufacturerName({ id: item.id, name: item.name })
                  : '';

                return (
                <React.Fragment key={getEquipmentRowKey(item, paginatedStart + index)}>
                  <TableRow hover>
                    <TableCell>
                      {item.type === 'CCU' && item.from && item.to ? (
                        <Box sx={{ position: 'relative', width: 320, height: 180, overflow: 'hidden', }}>
                          <Box
                            key={item.from?.medias?.productThumbMediumAndSmall}
                            component="img"
                            sx={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              width: '35%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                            src={getShipThumbLarge(item.from as Ship)}
                            alt={item.from.name}
                          />
                          <Box
                            key={item.to?.medias?.productThumbMediumAndSmall}
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
                            src={getShipThumbLarge(item.to as Ship)}
                            alt={item.to.name}
                          />
                          <div className='absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center justify-center'>
                            <span className='text-white text-sm'>
                              {item.isBuyBack && <FormattedMessage id="hangar.buyback" defaultMessage="Buyback:" />} {displayName}
                            </span>
                          </div>
                          <div className='absolute top-[50%] left-[35%] -translate-y-[50%] -translate-x-[50%] text-white text-2xl font-bold'>
                            <ChevronsRight className='w-8 h-8' />
                          </div>
                        </Box>
                      ) : item.type === 'Bundle' ? (
                        <div className="relative">
                          <BundleImageSlider bundleShips={item.ships || []} bundleOthers={item.others || []} ships={ships} bundleName={item.name} isBuyBack={item.isBuyBack} isLti={item.insurance === "LTI"} />
                        </div>
                      ) : (
                        <div className="relative w-[320px] h-[180px]">
                          <Box
                            key={getEquipmentImageSrc(item)}
                            component="img"
                            sx={{ width: 320, height: 180, objectFit: 'cover' }}
                            src={getEquipmentImageSrc(item)}
                            alt={item.name}
                          />
                          <div className='absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center justify-center'>
                            <span className='text-white text-sm flex items-center justify-center gap-2'>
                              {item.insurance === "LTI" && <span className="text-red-500">LTI</span>}
                              {item.isBuyBack && <span className="shrink-0 text-nowrap"><FormattedMessage id="hangar.buyback" defaultMessage="Buyback:" /></span>}
                              <span>{displayName}</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-col gap-2'>
                        {item.type === 'CCU' ? (
                          <>
                            <span className='text-md text-gray-500 dark:text-gray-400'>
                              {fromDisplayName} -&gt; {toDisplayName}
                            </span>
                            <span className='text-md text-blue-500 font-bold'>
                              <span className='text-gray-500 mr-2 dark:text-gray-400'><FormattedMessage id="hangar.msrp" defaultMessage="MSRP:" /></span>
                              <span>{(item.from.msrp / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                              <span className='text-gray-500 mx-2 dark:text-gray-400'>-</span>
                              <span>{(item.to.msrp / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                            </span>
                            <span className='text-md text-blue-500 font-bold'>
                              <span className='text-gray-500 mr-2 dark:text-gray-400'><FormattedMessage id="hangar.cost" defaultMessage="Cost" /></span>
                              <span>{(item.groupedItems && item.groupedItems.length > 1 ? (item.totalCost || 0) : item.value).toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                              {item.groupedItems && item.groupedItems.length > 1 ? (
                                <span className='text-gray-500 mx-2'>
                                  <span>(</span>
                                  <span><FormattedMessage id="hangar.avgCost" defaultMessage="Avg:" /></span>
                                  <span> {item.value.toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                                  <span>)</span>
                                </span>
                              ) : null}
                              {!item.hasMultipleValues && item.to.msrp - item.from.msrp !== item.value * 100 && <span className='text-gray-500 mx-2'>
                                {`${((item.to.msrp - item.from.msrp) / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}`}
                              </span>}
                            </span>
                            {!item.hasMultipleValues && item.to.msrp - item.from.msrp !== item.value * 100 && <span className='text-md text-blue-500 font-bold flex items-center gap-2'>
                              <BadgePercent className='w-4 h-4' />
                              <span>
                                {((1 - (((item.to.msrp || 0) - (item.from.msrp || 0)) / 100 - item.value) / (((item.to.msrp || 0) - (item.from.msrp || 0)) / 100)) * 100).toFixed(2)}%
                              </span>
                            </span>}

                            {/* 顶层显示CCU使用情况 */}
                            {(() => {
                              const usedCount = getCcuUsage(item.from.name, item.to.name);
                              const totalCount = item.quantity || 1;
                              const remainingCount = Math.max(totalCount - usedCount, 0);

                              return (
                                <span className='text-md text-amber-500 font-bold'>
                                  <span className='text-gray-500 mr-2 dark:text-gray-400'>
                                    <FormattedMessage id="hangar.usage" defaultMessage="Usage:" />
                                  </span>
                                  <FormattedMessage
                                    id="hangar.ccuUsage"
                                    defaultMessage="Used: {used}, Remaining: {remaining}"
                                    values={{
                                      used: usedCount,
                                      remaining: remainingCount
                                    }}
                                  />
                                </span>
                              );
                            })()}

                            {item.groupedItems && item.groupedItems.length > 1 && (
                              <div className="flex items-center">
                                <Button
                                  size="small"
                                  onClick={() => toggleCcuGroupExpand(item.id)}
                                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                                  variant="text"
                                >
                                  <FormattedMessage id="hangar.expand" defaultMessage="Items" />
                                  {expandedCcuGroups[item.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </Button>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {shipManufacturerName && (
                              <span className='text-md text-gray-500 dark:text-gray-400'>
                                {shipManufacturerName}
                              </span>
                            )}
                            <span className='text-md text-blue-500 font-bold'>
                              <span className='text-gray-500 mr-2 dark:text-gray-400'><FormattedMessage id="hangar.msrp" defaultMessage="MSRP:" /></span>
                              <span>{(item.from.msrp / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                            </span>
                            <span className='text-md text-blue-500 font-bold'>
                              <span className='text-gray-500 mr-2 dark:text-gray-400'><FormattedMessage id="hangar.cost" defaultMessage="Cost" /></span>
                              <span>{(item.groupedItems && item.groupedItems.length > 1 ? (item.totalCost || 0) : item.value).toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                            </span>
                            {/* {'insurance' in item && item.insurance && (
                              <span className='text-md text-blue-500 font-bold'>
                                <span className='text-gray-500 mr-2 dark:text-gray-400'><FormattedMessage id="hangar.insurance" defaultMessage="Insurance:" /></span>
                                {item.insurance}
                              </span>
                            )} */}
                          </>
                        )}
                        <span className='text-md font-bold flex flex-col'>
                          <span className='text-gray-500 dark:text-gray-400 flex items-center gap-2'>
                            <CircleUser className='w-4 h-4' />
                            {
                              !item.isBuyBack && <Gift className={`${item.canGift ? 'text-green-300' : 'text-red-400'} w-4 h-4`} />
                            }
                            {item.ownerCount && item.ownerCount > 1 ? (
                              <FormattedMessage
                                id="hangar.multipleOwners"
                                defaultMessage="{count} owners"
                                values={{ count: item.ownerCount }}
                              />
                            ) : (<span>{users.find(user => user.id === item.belongsTo)?.nickname || '-'}</span>)}
                          </span>
                        </span>
                        {item.quantity && <span className='text-md font-bold flex flex-col'>
                          <span className='text-gray-500 dark:text-gray-400 flex items-center gap-2'>
                            <Archive className='w-4 h-4' />
                            <span>{item.quantity}</span>
                          </span>
                        </span>}
                        {item.type === 'Bundle' && (
                          <div className="flex items-center">
                            <Button
                              size="small"
                              onClick={() => {
                                toggleBundleExpand(item.id);
                                if (item.groupedItems && item.groupedItems.length > 1) {
                                  toggleCcuGroupExpand(item.id);
                                }
                              }}
                              sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                              variant="text"
                            >
                              <FormattedMessage id="hangar.expand" defaultMessage="Items" />
                              {expandedBundles[item.id] || expandedCcuGroups[item.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </Button>
                          </div>
                        )}
                        {item.type !== 'Bundle' && item.type !== 'CCU' && item.groupedItems && item.groupedItems.length > 1 && (
                          <div className="flex items-center">
                            <Button
                              size="small"
                              onClick={() => toggleCcuGroupExpand(item.id)}
                              sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                              variant="text"
                            >
                              <FormattedMessage id="hangar.expand" defaultMessage="Items" />
                              {expandedCcuGroups[item.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell sx={{ textWrap: 'nowrap' }}>
                      {item.isBuyBack && <span><FormattedMessage id="hangar.buyBack" defaultMessage="Buy Back" /></span>}
                      <span>{item.isBuyBack ? ` ${item.type}` : item.type}</span>
                    </TableCell>
                    <TableCell sx={{ textWrap: 'nowrap' }}>
                      {!!item.pageId &&
                        <Link
                          to={getHangarDetailUrl(item)}
                          target="_blank"
                          className="flex items-center gap-2"
                        >
                          <SquareArrowOutUpRight className="w-4 h-4" />
                          <FormattedMessage id="hangar.viewInHangar" defaultMessage="RSI Hangar" />
                        </Link>
                      }
                    </TableCell>
                  </TableRow>
                  {item.type === 'Bundle' && (item.ships && item.ships.length > 0 || item.others && item.others.length > 0) && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ py: 0, border: expandedBundles[item.id] ? '' : 'none' }}>
                        <Collapse in={expandedBundles[item.id]} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 2, px: 3, backgroundColor: 'background.paper', boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.1)' }}>
                            {(() => {
                              const imageItems: React.ReactNode[] = [];
                              const textItems: BundleTextItem[] = [];

                              item.ships?.forEach((bundleShip, index) => {
                                const shipInfo = ships.find(s =>
                                  bundleShip.name && s.name.toUpperCase().trim() === bundleShip.name.toUpperCase().trim()
                                );
                                const imageUrl = getShipThumbLarge(shipInfo);
                                const details = [
                                  shipInfo?.msrp
                                    ? `${intl.formatMessage({ id: 'hangar.msrp', defaultMessage: 'MSRP:' })} ${(shipInfo.msrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}`
                                    : undefined,
                                  bundleShip.insurance
                                    ? `${intl.formatMessage({ id: 'hangar.insurance', defaultMessage: 'Insurance:' })} ${bundleShip.insurance}`
                                    : undefined,
                                ].filter(Boolean) as string[];

                                if (imageUrl) {
                                  imageItems.push(
                                    <BundleContentCard
                                      key={`ship-${index}`}
                                      type="Ship"
                                      name={getShipTargetDisplayName(bundleShip)}
                                      imageUrl={imageUrl}
                                      onClick={() => handleOpenShipDetail(bundleShip)}
                                      meta={
                                        <>
                                          {shipInfo?.msrp && (
                                            <Typography variant="caption" color="text.secondary">
                                              <span><FormattedMessage id="hangar.msrp" defaultMessage="MSRP:" /></span>
                                              <span> {(shipInfo.msrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}</span>
                                            </Typography>
                                          )}
                                          {bundleShip.insurance && (
                                            <Typography variant="caption" display="block" color="primary">
                                              <span><FormattedMessage id="hangar.insurance" defaultMessage="Insurance:" /></span>
                                              <span> {bundleShip.insurance}</span>
                                            </Typography>
                                          )}
                                        </>
                                      }
                                    />
                                  );
                                  return;
                                }

                                textItems.push({
                                  key: `ship-${index}`,
                                  type: 'Ship',
                                  name: getShipTargetDisplayName(bundleShip),
                                  details,
                                });
                              });

                              item.others?.forEach((bundleOther, index) => {
                                const imageUrl = bundleOther.image?.replace('subscribers_vault_thumbnail', 'product_thumb_large');

                                if (imageUrl) {
                                  imageItems.push(
                                    <BundleContentCard
                                      key={`other-${index}`}
                                      type={bundleOther.type}
                                      name={bundleOther.name}
                                      imageUrl={imageUrl}
                                    />
                                  );
                                  return;
                                }

                                textItems.push({
                                  key: `other-${index}`,
                                  type: bundleOther.type || '-',
                                  name: bundleOther.name || '-',
                                });
                              });

                              return (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                  {imageItems}
                                  {!!imageItems.length && !!textItems.length && <Divider orientation="vertical" flexItem />}
                                  {!!textItems.length && <BundleTextItemsBlock items={textItems} />}
                                </Box>
                              );
                            })()}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                  {!!item.groupedItems && item.groupedItems.length > 1 && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ py: 0, border: expandedCcuGroups[item.id] ? '' : 'none' }}>
                        <Collapse in={expandedCcuGroups[item.id]} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 2, px: 3, backgroundColor: 'background.paper', boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.1)' }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                              {item.type === 'CCU' ? (
                                <FormattedMessage
                                  id="hangar.mergedCcuDetails"
                                  defaultMessage="Merged CCU details ({count} records)"
                                  values={{ count: item.groupedItems.length }}
                                />
                              ) : (
                                <FormattedMessage
                                  id="hangar.mergedItemDetails"
                                  defaultMessage="Merged item details ({count} records)"
                                  values={{ count: item.groupedItems.length }}
                                />
                              )}
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              {item.groupedItems.map((groupedItem, index) => {
                                const ownerName = users.find(user => user.id === groupedItem.belongsTo)?.nickname || '-';
                                const quantity = groupedItem.quantity || 1;
                                const lineTotal = groupedItem.value * quantity;
                                const detailHangarUrl = getHangarDetailUrl(groupedItem);

                                return (
                                  <Box
                                    key={getEquipmentRowKey(groupedItem, index)}
                                    sx={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      alignItems: 'center',
                                      gap: 2,
                                      px: 1.5,
                                      py: 1,
                                      border: '1px solid',
                                      borderColor: 'divider',
                                      borderRadius: 1
                                    }}
                                  >
                                    <span className='text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2'>
                                      <CircleUser className='w-4 h-4' />
                                      <span>{ownerName}</span>
                                    </span>
                                    <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                      <span className='text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2'>
                                        <Archive className='w-4 h-4' />
                                        <span>{`x${quantity}`}</span>
                                      </span>
                                      <span className='text-sm text-blue-500 font-bold'>
                                        <span>{groupedItem.value.toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                                        <span className='text-gray-500 mx-1'>/ea</span>
                                        <span className='text-gray-500 mx-1'>·</span>
                                        <span>{lineTotal.toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                                      </span>
                                      {!!groupedItem.pageId && (
                                        <Link
                                          to={detailHangarUrl}
                                          target="_blank"
                                          className="flex items-center gap-2 text-sm"
                                        >
                                          <SquareArrowOutUpRight className="w-4 h-4" />
                                          <FormattedMessage id="hangar.viewInHangar" defaultMessage="RSI Hangar" />
                                        </Link>
                                      )}
                                    </Box>
                                  </Box>
                                );
                              })}
                            </Box>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              )})}
            </TableBody>
          </Table>
        </TableContainer>

        {!isMobile && (
          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={mergedFilteredEquipment.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: 'Rows per page:' })}
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'total' })}${count}${intl.formatMessage({ id: 'pagination.items', defaultMessage: 'items' })}`}
          />
        )}
        {isMobile && hasMore && <div ref={sentinelRef} className="h-8 w-full" aria-hidden="true" />}
      </Box>
    )}
    <ShipInfoDialog
      open={Boolean(selectedShip)}
      ship={selectedShip}
      onClose={handleCloseShipDetail}
    />
  </>)
}
