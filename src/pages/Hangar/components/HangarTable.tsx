import React, { useEffect, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { BundleItem, OtherItem, selectUsersHangarItems, ShipItem } from "@/store/upgradesStore";
import { Typography, TextField, InputAdornment, TableContainer, TableHead, TableRow, TableCell, TableBody, TablePagination, Box, Table, FormGroup, FormControlLabel, Checkbox, Divider, IconButton, Collapse, Button, Tooltip } from "@mui/material";
import { Search, ChevronsRight, BadgePercent, CircleUser, Gift, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, SquareArrowOutUpRight, Archive } from "lucide-react";
import Crawler from "@/components/Crawler";
import UserSelector from "@/components/UserSelector";
import { Ship } from "@/types";
import { Link } from "react-router";
import { StoredCompletedPath } from "../../CCUPlanner/services/PathFinderService";
import MarkdownPreview from '@uiw/react-markdown-preview';

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
const getEquipmentImageSrc = (item: Pick<DisplayEquipmentItem, 'imageUrl' | 'from'>) =>
  item.imageUrl?.replace('medium_and_small', 'large') ||
  item.from?.medias?.productThumbMediumAndSmall?.replace('medium_and_small', 'large') ||
  '';

const getEquipmentRowKey = (item: DisplayEquipmentItem, absoluteIndex: number) =>
  `${item.type}-${item.id}-${item.belongsTo}-${item.pageId ?? 'na'}-${absoluteIndex}`;

const getHangarDetailUrl = (item: Pick<DisplayEquipmentItem, 'isBuyBack' | 'pageId' | 'type'>) => {
  if (!item.pageId) {
    return '';
  }

  if (item.isBuyBack) {
    return `https://robertsspaceindustries.com/en/account/buy-back-pledges?page=${item.pageId}&pagesize=1`;
  }

  return `https://robertsspaceindustries.com/en/account/pledges?page=${Math.ceil(item.pageId / 10)}`;
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
        return shipInfo?.medias?.productThumbMediumAndSmall;
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
        src={currentImage.replace('medium_and_small', 'large')}
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
}: {
  type?: string;
  name?: string;
  imageUrl?: string;
  meta?: React.ReactNode;
}) {
  return (
    <Box sx={{
      width: 220,
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      overflow: 'hidden'
    }}>
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

  useEffect(() => {
    const processStoreData = () => {
      const userCCUs = items.ccus
        .map(ccu => {
          const from = ships.find(ship => ship.name.toUpperCase().trim() === ccu.parsed.from.toUpperCase().trim())
          const to = ships.find(ship => ship.name.toUpperCase().trim() === ccu.parsed.to.toUpperCase().trim())

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
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.from?.name && item.from.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.to?.name && item.to.name.toLowerCase().includes(searchTerm.toLowerCase()))
  ) : []),
  ...(showShips ? hangarShips.filter(ship =>
    ship.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).map<DisplayEquipmentItem>(ship => {
    // 查找对应的船只信息
    const shipInfo = ships.find(s => s.name.toUpperCase().trim() === ship.name.toUpperCase().trim());

    return {
      id: ship.id.toString(),
      name: ship.name,
      type: 'Ship',
      value: ship.value,
      canGift: ship.canGift,
      isBuyBack: ship.isBuyBack,
      from: {
        name: ship.name,
        imageUrl: shipInfo?.medias?.productThumbMediumAndSmall,
        medias: {
          productThumbMediumAndSmall: shipInfo?.medias?.productThumbMediumAndSmall || ''
        },
        msrp: shipInfo?.msrp || 0
      },
      to: {
        name: ship.name,
        imageUrl: shipInfo?.medias?.productThumbMediumAndSmall,
        medias: {
          productThumbMediumAndSmall: shipInfo?.medias?.productThumbMediumAndSmall || ''
        },
        msrp: shipInfo?.msrp || 0
      },
      imageUrl: shipInfo?.medias?.productThumbMediumAndSmall,
      belongsTo: ship.belongsTo,
      quantity: ship.quantity,
      pageId: ship.pageId,
      insurance: ship.insurance,
      ships: [],
      others: []
    };
  }) : []),
  ...(showShips ? hangarBundles.filter(bundle =>
    // 匹配Bundle名称
    bundle.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    // 匹配Bundle内部ships的名称
    (bundle.ships || []).some(ship => 
      ship.name && ship.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) ||
    // 匹配Bundle内部others的名称
    (bundle.others || []).some(other => 
      other.name && other.name.toLowerCase().includes(searchTerm.toLowerCase())
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
      insurance: bundle.insurance,
      ships: bundle.ships,
      others: bundle.others
    };
  }) : [])].filter(item => shouldShowBySourceFilter(item));

  const isBuybackOnlyView = showBuybacks && !showHangarItems;
  const summaryItems = filteredEquipment.filter(item => isBuybackOnlyView ? item.isBuyBack : !item.isBuyBack);

  // 添加排序功能
  const sortedEquipment = filteredEquipment.sort((a, b) => {
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

  const paginatedStart = page * rowsPerPage;
  const paginatedEquipment = sortedEquipment.slice(
    paginatedStart,
    paginatedStart + rowsPerPage
  );

  // Check if hangar is empty (based on original data, not filtered)
  const isHangarEmpty = hangarShips.length === 0 && ccus.length === 0 && hangarBundles.length === 0;

  return (<>
    <div className='absolute top-0 right-0 m-[15px] gap-2 hidden sm:flex'>
      <div className='flex flex-col gap-2 items-center justify-center'>
        <Crawler ships={ships} />
      </div>
      <UserSelector />
    </div>

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
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 2, py: 1, display: 'flex', alignItems: 'center' }}>
            <FormGroup row sx={{ width: '100%', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
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
              <Divider orientation="vertical" flexItem sx={{ mx: 2 }} />
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
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
            </FormGroup>
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

                return sum + upgradeValue * (item.quantity || 1) + shipsValue;
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
              {paginatedEquipment.map((item, index) => (
                <React.Fragment key={getEquipmentRowKey(item, paginatedStart + index)}>
                  <TableRow hover>
                    <TableCell>
                      {item.type === 'CCU' && item.from && item.to ? (
                        <Box sx={{ position: 'relative', width: 320, height: 180, overflow: 'hidden', }}>
                          <Box
                            key={item.from.medias.productThumbMediumAndSmall}
                            component="img"
                            sx={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              width: '35%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                            src={item.from.medias.productThumbMediumAndSmall.replace('medium_and_small', 'large')}
                            alt={item.from.name}
                          />
                          <Box
                            key={item.to.medias.productThumbMediumAndSmall}
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
                            src={item.to.medias.productThumbMediumAndSmall.replace('medium_and_small', 'large')}
                            alt={item.to.name}
                          />
                          <div className='absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center justify-center'>
                            <span className='text-white text-sm'>
                              {item.isBuyBack && <FormattedMessage id="hangar.buyback" defaultMessage="Buyback:" />} {item.name}
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
                              <span>{item.name}</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-col gap-2'>
                        {item.type === 'CCU' ? (
                          <>
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
                            <span className='text-md text-blue-500 font-bold'>
                              <span className='text-gray-500 mr-2 dark:text-gray-400'><FormattedMessage id="hangar.msrp" defaultMessage="MSRP:" /></span>
                              <span>{(item.from.msrp / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                            </span>
                            <span className='text-md text-blue-500 font-bold'>
                              <span className='text-gray-500 mr-2 dark:text-gray-400'><FormattedMessage id="hangar.cost" defaultMessage="Cost" /></span>
                              <span>{item.value.toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
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
                            {item.type === 'CCU' && item.ownerCount && item.ownerCount > 1 ? (
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
                              onClick={() => toggleBundleExpand(item.id)}
                              sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                              variant="text"
                            >
                              <FormattedMessage id="hangar.expand" defaultMessage="Items" />
                              {expandedBundles[item.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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
                                const imageUrl = shipInfo?.medias?.productThumbMediumAndSmall?.replace('medium_and_small', 'large');
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
                                      name={bundleShip.name}
                                      imageUrl={imageUrl}
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
                                  name: bundleShip.name || '-',
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
                  {item.type === 'CCU' && !!item.groupedItems && item.groupedItems.length > 1 && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ py: 0, border: expandedCcuGroups[item.id] ? '' : 'none' }}>
                        <Collapse in={expandedCcuGroups[item.id]} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 2, px: 3, backgroundColor: 'background.paper', boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.1)' }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                              <FormattedMessage
                                id="hangar.mergedCcuDetails"
                                defaultMessage="Merged CCU details ({count} records)"
                                values={{ count: item.groupedItems.length }}
                              />
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              {item.groupedItems.map((groupedItem, index) => {
                                const ownerName = users.find(user => user.id === groupedItem.belongsTo)?.nickname || '-';
                                const quantity = groupedItem.quantity || 1;
                                const lineTotal = groupedItem.value * quantity;
                                const detailHangarUrl = getHangarDetailUrl(groupedItem);

                                return (
                                  <Box
                                    key={index}
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
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredEquipment.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: '每页行数:' })}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: '共' })}${count}${intl.formatMessage({ id: 'pagination.items', defaultMessage: '项' })}`}
        />
      </Box>
    )}
  </>)
}
