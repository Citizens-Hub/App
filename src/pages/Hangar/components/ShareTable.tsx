import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/store";
import { selectUsersHangarItems } from "@/store/upgradesStore";
import { setItemSelected, updateItemPrice, generateItemKey } from "@/store/shareStore";
import { Typography, TextField, InputAdornment, TableContainer, TableHead, TableRow, TableCell, TableBody, TablePagination, Box, Table, Button, Checkbox, Chip, Stack, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Alert } from "@mui/material";
import { Search, ChevronsRight, BadgePercent, CircleUser, Inbox, Upload, Copy, X, Link } from "lucide-react";
import { Ship } from "@/types";
import { getShipThumbLarge, toApiAssetUrl } from "@/utils/shipImage";
import { findShipByIdOrName, getShipDisplayName } from "@/utils/shipDisplay";
import HangarToolbar from "./HangarToolbar";
import useMobileInfiniteRows from "@/hooks/useMobileInfiniteRows";
import { formatMarketCcuResourceName } from "@/pages/Market/marketI18n";

interface DisplayEquipmentItem {
  id: string;
  name: string;
  type: string;
  manufacturer?: string;
  imageUrl?: string;
  value: number;
  canGift: boolean;
  isBuyBack: boolean;
  from: {
    id: number;
    name: string;
    imageUrl?: string;
    medias: {
      productThumbMediumAndSmall: string;
    };
    msrp: number;
  };
  to: {
    id: number;
    name: string;
    imageUrl?: string;
    medias: {
      productThumbMediumAndSmall: string;
    };
    msrp: number;
  };
  owners: {
    id: number;
    name: string;
    quantity: number;
  }[];
  quantity: number;
  selectedForShare?: boolean;
  customPrice?: number;
}

export default function ShareTable({ ships, exchangeRates }: { ships: Ship[], exchangeRates: Record<string, number> }) {
  const intl = useIntl();
  const [ccus, setCcus] = useState<DisplayEquipmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const dispatch = useDispatch();
  const { token } = useSelector((state: RootState) => state.user.user);
  const userId = useSelector((state: RootState) => state.user.user.id);
  const { locale } = intl;
  const { users, currency } = useSelector((state: RootState) => state.upgrades);
  const items = useSelector(selectUsersHangarItems);
  const savedItems = useSelector((state: RootState) => state.share.selectedItems);
  const allItemPrices = useSelector((state: RootState) => state.share?.allItemPrices || {});

  const matchesSearchTerm = (...values: Array<string | null | undefined>) => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();
    if (!normalizedSearchTerm) {
      return true;
    }

    return values.some((value) => value?.toLowerCase().includes(normalizedSearchTerm));
  };

  const getShipTargetDisplayName = (shipTarget?: { id?: number | string | null; name?: string | null; localizedName?: string | null; alias?: string | null } | null) => {
    const shipInfo = findShipByIdOrName(ships, shipTarget);
    return getShipDisplayName(shipInfo || shipTarget) || shipTarget?.name?.trim() || '-';
  };

  const getDisplayEquipmentName = (item: DisplayEquipmentItem) => (
    formatMarketCcuResourceName(
      intl,
      getShipTargetDisplayName(item.from),
      getShipTargetDisplayName(item.to),
    )
  );

  useEffect(() => {
    const processStoreData = () => {
      // 第一步：收集所有可赠送的CCU
      const giftableCCUs = items.ccus
        .filter(ccu => ccu.canGift) // 只保留可赠送的
        .map(ccu => {
          const from = findShipByIdOrName(ships, {
            id: ccu.from?.id,
            name: ccu.from?.name || ccu.parsed.from,
          });
          const to = findShipByIdOrName(ships, {
            id: ccu.to?.id,
            name: ccu.to?.name || ccu.parsed.to,
          });

          if (!from || !to) {
            return undefined;
          }

          // 使用不包含持有者ID的key用于分组
          const itemKey = generateItemKey(ccu.name, from.id, to.id);

          // 查找用户昵称
          const ownerName = users.find(user => user.id === ccu.belongsTo)?.nickname || '未知用户';

          // 从allItemPrices中获取价格
          const savedPrice = allItemPrices[itemKey];
          const customPrice = savedPrice !== undefined
            ? savedPrice
            : Math.ceil(ccu.value * exchangeRates[currency.toLocaleLowerCase() || 'usd'] * 2) / 2;

          return {
            baseId: itemKey, // 基础ID，不包含持有者
            name: ccu.name,
            type: 'CCU',
            value: ccu.value,
            canGift: ccu.canGift,
            isBuyBack: ccu.isBuyBack,
            from: from,
            to: to,
            ownerId: ccu.belongsTo,
            ownerName: ownerName,
            quantity: ccu.quantity || 1,
            customPrice: customPrice
          };
        }).filter(ccu => ccu !== undefined);

      // 第二步：按照baseId分组合并
      const groupedCCUs = new Map();

      giftableCCUs.forEach(ccu => {
        if (!ccu) return;

        const existingGroup = groupedCCUs.get(ccu.baseId);

        if (existingGroup) {
          // 检查该所有者是否已存在
          const existingOwner = existingGroup.owners.find((owner: { id: number }) => owner.id === ccu.ownerId);

          if (existingOwner) {
            // 如果该所有者已存在，增加数量
            existingOwner.quantity += ccu.quantity;
          } else {
            // 添加新所有者
            existingGroup.owners.push({
              id: ccu.ownerId,
              name: ccu.ownerName,
              quantity: ccu.quantity
            });
          }

          // 更新总数量
          existingGroup.quantity += ccu.quantity;
        } else {
          // 创建新分组
          groupedCCUs.set(ccu.baseId, {
            id: ccu.baseId,
            name: ccu.name,
            type: ccu.type,
            value: ccu.value,
            canGift: ccu.canGift,
            isBuyBack: ccu.isBuyBack,
            from: ccu.from,
            to: ccu.to,
            owners: [{
              id: ccu.ownerId,
              name: ccu.ownerName,
              quantity: ccu.quantity
            }],
            quantity: ccu.quantity,
            customPrice: ccu.customPrice,
            // 检查是否有保存的选择状态
            selectedForShare: !!savedItems.find(item =>
              generateItemKey(item.name, item.fromId, item.toId) === ccu.baseId
            )
          });
        }
      });

      // 转换为数组
      const mergedCCUs = Array.from(groupedCCUs.values()) as DisplayEquipmentItem[];

      setCcus(mergedCCUs);
      setIsLoading(false);
    };

    processStoreData();
  }, [currency, exchangeRates, items, ships, savedItems, allItemPrices, users]);

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

  // 选择/取消选择项目
  const handleSelectItem = (id: string) => {
    setCcus(prevCcus => {
      const newCcus = prevCcus.map(item => {
        if (item.id === id) {
          const newSelectedState = !item.selectedForShare;
          const newItem = { ...item, selectedForShare: newSelectedState };

          // 更新 Redux store
          dispatch(setItemSelected({
            item: {
              id: newItem.id,
              name: newItem.name,
              fromId: newItem.from.id || 0,
              toId: newItem.to.id || 0,
              customPrice: newItem.customPrice || 0,
              owners: newItem.owners.map(owner => owner.id)
            },
            selected: newSelectedState
          }));

          return newItem;
        }
        return item;
      });

      return newCcus;
    });
  };

  // 设置自定义价格
  const handleSetCustomPrice = (id: string, price: number) => {
    setCcus(prevCcus => {
      const newCcus = prevCcus.map(item => {
        if (item.id === id) {
          const newItem = { ...item, customPrice: price };

          // 使用更新的updateItemPrice
          dispatch(updateItemPrice({
            id: newItem.id,
            name: newItem.name,
            fromId: newItem.from.id || 0,
            toId: newItem.to.id || 0,
            price
          }));

          return newItem;
        }
        return item;
      });

      return newCcus;
    });
  };

  // 全选/取消全选
  const handleSelectAll = (checked: boolean) => {
    setCcus(prevCcus => {
      const newCcus = prevCcus.map(item => {
        const newItem = { ...item, selectedForShare: checked };

        // 更新 Redux store
        dispatch(setItemSelected({
          item: {
            id: newItem.id,
            name: newItem.name,
            fromId: newItem.from.id || 0,
            toId: newItem.to.id || 0,
            customPrice: newItem.customPrice || 0,
            owners: newItem.owners.map(owner => owner.id)
          },
          selected: checked
        }));

        return newItem;
      });

      return newCcus;
    });
  };

  // 上传到服务器
  const handleUpload = async () => {
    try {
      setUploading(true);

      const selectedItems = ccus.filter(item => item.selectedForShare);

      if (selectedItems.length === 0) {
        alert(intl.formatMessage({ id: 'hangar.noItemsSelected', defaultMessage: '请至少选择一个物品进行分享' }));
        setUploading(false);
        return;
      }

      const payload = {
        hangar: {
          items: selectedItems.map(item => ({
            name: item.name,
            from: item.from.id,
            to: item.to.id,
            price: item.customPrice,
            owners: item.owners.map(owner => owner.id)
          })),
          currency: currency || 'USD'
        }
      };

      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/user/hangar`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(intl.formatMessage({ id: 'hangar.uploadFailed', defaultMessage: '上传失败' }));
      }

      // 设置分享链接
      setShareLink(`${window.location.origin}/share/hangar/${userId}`);
      setSuccessDialogOpen(true);
    } catch (error) {
      console.error('Upload error:', error);
      alert(error instanceof Error ? error.message : intl.formatMessage({ id: 'hangar.uploadError', defaultMessage: '上传时发生错误' }));
    } finally {
      setUploading(false);
    }
  };

  // 复制链接到剪贴板
  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  // 过滤和分页数据
  const filteredEquipment = ccus.filter(item =>
    matchesSearchTerm(
      item.name,
      getDisplayEquipmentName(item),
      item.from?.name,
      getShipTargetDisplayName(item.from),
      item.to?.name,
      getShipTargetDisplayName(item.to),
    ) ||
    item.owners.some(owner => matchesSearchTerm(owner.name))
  );

  const {
    isMobile,
    page,
    rowsPerPage,
    setPage,
    setRowsPerPage,
    displayedItems: paginatedEquipment,
    sentinelRef,
    hasMore,
  } = useMobileInfiniteRows(filteredEquipment, { resetKey: `${searchTerm}-${currency}` });

  // 计算选中的物品数量
  const selectedCount = ccus.filter(item => item.selectedForShare).length;

  return (<>
    <HangarToolbar ships={ships} />

    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 2 }}>
      <TextField
        sx={{
          '& .MuiOutlinedInput-root': { borderRadius: 0 },
          flexGrow: 1,
        }}
        variant="outlined"
        placeholder={intl.formatMessage({ id: 'search.placeholder', defaultMessage: 'Search equipment...' })}
        value={searchTerm}
        onChange={handleSearchChange}
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
        color="primary"
        startIcon={<Upload />}
        onClick={handleUpload}
        disabled={uploading || selectedCount === 0}
        sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}
      >
        <span>
          {uploading ?
            <FormattedMessage id="hangar.uploading" defaultMessage="上传中..." /> :
            <FormattedMessage id="hangar.shareItems" defaultMessage="分享物品" />
          }
        </span>
        {selectedCount > 0 && <span>{` (${selectedCount})`}</span>}
      </Button>
    </Box>

    {isLoading ? (
      <Typography align="center"><FormattedMessage id="loading" defaultMessage="Loading..." /></Typography>
    ) : filteredEquipment.length === 0 ? (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="h6">
          <FormattedMessage id="hangar.noEquipment" defaultMessage="No sharable content in your hangar" />
        </Typography>
      </Box>
    ) : isMobile ? (
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {paginatedEquipment.map((item) => {
          const displayName = getDisplayEquipmentName(item);
          const fromDisplayName = getShipTargetDisplayName(item.from);
          const toDisplayName = getShipTargetDisplayName(item.to);

          return (
          <Box
            key={item.id}
            sx={{
              py: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Checkbox
                checked={item.selectedForShare}
                onChange={() => handleSelectItem(item.id)}
                sx={{ mt: -0.5, ml: -1 }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  {item.type === 'CCU' && item.from && item.to ? (
                    <Box sx={{ position: 'relative', width: 104, height: 80, overflow: 'hidden', borderRadius: 1, flexShrink: 0 }}>
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
                        src={getShipThumbLarge(item.from as Ship)}
                        alt={item.from.name}
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
                        }}
                        src={getShipThumbLarge(item.to as Ship)}
                        alt={item.to.name}
                      />
                    </Box>
                  ) : (
                    <Box
                      component="img"
                      sx={{ width: 104, height: 80, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                      src={toApiAssetUrl(item.imageUrl)}
                      alt={item.name}
                    />
                  )}

                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {displayName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                      {`${fromDisplayName} -> ${toDisplayName}`}
                    </Typography>

                    <Typography variant="body1" color="primary" fontWeight={700} sx={{ mt: 1 }}>
                      {(item.customPrice || 0).toLocaleString(locale, { style: 'currency', currency })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                      <FormattedMessage id="hangar.cost" defaultMessage="Cost" />: {" "}
                      {item.value.toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ mt: 1.25, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {item.owners.map((owner) => (
                    <Chip
                      key={owner.id}
                      label={`${owner.name} (${owner.quantity})`}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  ))}
                  <Chip
                    icon={<Inbox className='w-4 h-4' />}
                    label={`${item.quantity ?? 0}`}
                    size="small"
                    variant="outlined"
                  />
                </Box>

                <TextField
                  type="number"
                  size="small"
                  disabled={!item.selectedForShare}
                  value={item.customPrice}
                  onChange={(e) => handleSetCustomPrice(item.id, parseFloat(e.target.value) || 0)}
                  sx={{
                    mt: 1.5,
                    '& .MuiOutlinedInput-root': { borderRadius: 0 }
                  }}
                  slotProps={{
                    input: {
                      startAdornment: <InputAdornment position="start">{(0).toLocaleString(locale, { style: 'currency', currency }).replace('0.00', '')}</InputAdornment>
                    }
                  }}
                  fullWidth
                />
              </Box>
            </Box>
          </Box>
        )})}
        {hasMore && <div ref={sentinelRef} className="h-8 w-full" aria-hidden="true" />}
      </Box>
    ) : (
      <Box sx={{ width: '100%', overflow: 'auto' }}>
        <TableContainer sx={{ mb: 2 }}>
          <Table aria-label={intl.formatMessage({ id: 'hangar.shareTable.ariaLabel', defaultMessage: 'Equipment table' })}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={ccus.length > 0 && ccus.every(item => item.selectedForShare)}
                    indeterminate={ccus.some(item => item.selectedForShare) && !ccus.every(item => item.selectedForShare)}
                    onChange={e => handleSelectAll(e.target.checked)}
                  />
                </TableCell>
                <TableCell width="380px">
                  <FormattedMessage id="hangar.image" defaultMessage="Image" />
                </TableCell>
                <TableCell>
                  <FormattedMessage id="hangar.details" defaultMessage="Details" />
                </TableCell>
                <TableCell width="120px">
                  <FormattedMessage id="hangar.type" defaultMessage="Type" />
                </TableCell>
                <TableCell width="180px">
                  <FormattedMessage id="hangar.sharePrice" defaultMessage="Share Price" />
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedEquipment.map((item) => {
                const displayName = getDisplayEquipmentName(item);
                const fromDisplayName = getShipTargetDisplayName(item.from);
                const toDisplayName = getShipTargetDisplayName(item.to);

                return (
                <TableRow key={item.id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={item.selectedForShare}
                      onChange={() => handleSelectItem(item.id)}
                    />
                  </TableCell>
                  <TableCell>
                    {item.type === 'CCU' && item.from && item.to ? (
                      <Box sx={{ position: 'relative', width: 320, height: 180, overflow: 'hidden', }}>
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
                          src={getShipThumbLarge(item.from as Ship)}
                          alt={item.from.name}
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
                          src={getShipThumbLarge(item.to as Ship)}
                          alt={item.to.name}
                        />
                        <div className='absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center justify-center'>
                          <span className='text-white text-sm'>
                            {displayName}
                          </span>
                        </div>
                        <div className='absolute top-[50%] left-[35%] -translate-y-[50%] -translate-x-[50%] text-white text-2xl font-bold'>
                          <ChevronsRight className='w-8 h-8' />
                        </div>
                      </Box>
                    ) : (
                      <Box
                        component="img"
                        sx={{ width: 100, height: 50, objectFit: 'cover' }}
                        src={toApiAssetUrl(item.imageUrl)}
                        alt={item.name}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col gap-2'>
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
                        <span>{item.value.toLocaleString(locale, { style: 'currency', currency: 'USD' })}</span>
                        {item.to.msrp - item.from.msrp !== item.value * 100 && <span className='text-gray-500 mx-2'>
                          {`${((item.to.msrp - item.from.msrp) / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}`}
                        </span>}
                      </span>
                      {item.to.msrp - item.from.msrp !== item.value * 100 && <span className='text-md text-blue-500 font-bold flex items-center gap-2'>
                        <BadgePercent className='w-4 h-4' />
                        <span>
                          {((1 - (((item.to.msrp || 0) - (item.from.msrp || 0)) / 100 - item.value) / (((item.to.msrp || 0) - (item.from.msrp || 0)) / 100)) * 100).toFixed(2)}%
                        </span>
                      </span>}
                      <span className='text-md font-bold'>
                        <span className='text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-1'>
                          <CircleUser className='w-4 h-4' />
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            {item.owners.map((owner) => (
                              <Chip
                                key={owner.id}
                                label={`${owner.name} (${owner.quantity})`}
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            ))}
                          </Stack>
                        </span>
                      </span>
                      <span className='text-md font-bold flex items-center gap-2 text-gray-500 dark:text-gray-400'>
                        <Inbox className='w-4 h-4' />
                        <span>{item.quantity}</span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell sx={{ textWrap: 'nowrap' }}>
                    {item.isBuyBack && <span><FormattedMessage id="hangar.buyBack" defaultMessage="Buy Back" /></span>}
                    <span>{item.isBuyBack ? ` ${item.type}` : item.type}</span>
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      disabled={!item.selectedForShare}
                      value={item.customPrice}
                      onChange={(e) => handleSetCustomPrice(item.id, parseFloat(e.target.value) || 0)}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 0 }
                      }}
                      slotProps={{
                        input: {
                          startAdornment: <InputAdornment position="start">{(0).toLocaleString(locale, { style: 'currency', currency: currency }).replace('0.00', '')}</InputAdornment>
                        }
                      }}
                      fullWidth
                    />
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </TableContainer>

        {!isMobile && (
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
        )}
      </Box>
    )}

    {/* 成功分享弹窗 */}
    <Dialog 
      open={successDialogOpen} 
      onClose={() => setSuccessDialogOpen(false)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <div className="flex justify-between items-center">
          <Typography variant="h6">
            <FormattedMessage id="hangar.shareSuccess" defaultMessage="Items Shared" />
          </Typography>
          <IconButton onClick={() => setSuccessDialogOpen(false)}>
            <X />
          </IconButton>
        </div>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" gutterBottom>
            <FormattedMessage 
              id="hangar.shareSuccessMessage" 
              defaultMessage="You have successfully shared items. Use the following link to access your share page:"
            />
          </Typography>
        </Box>
        
        <Box sx={{ 
          display: 'flex',
          alignItems: 'center',
          p: 2,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'action.hover',
          mb: 2
        }}>
          <Link className="mr-2" size={20} />
          <Typography 
            variant="body2" 
            sx={{ 
              flexGrow: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {shareLink}
          </Typography>
          <IconButton onClick={handleCopyLink} size="small">
            <Copy size={18} />
          </IconButton>
        </Box>
        
        {linkCopied && (
          <Alert severity="success" sx={{ mb: 2 }}>
            <FormattedMessage id="hangar.linkCopied" defaultMessage="Link copied to clipboard" />
          </Alert>
        )}
        
        <Typography variant="body2" color="textSecondary">
          <FormattedMessage 
            id="hangar.shareInfoMessage" 
            defaultMessage="Through this link, other users can view the items and prices you have shared."
          />
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setSuccessDialogOpen(false)} color="primary">
          <FormattedMessage id="common.close" defaultMessage="Close" />
        </Button>
      </DialogActions>
    </Dialog>
  </>)
}
