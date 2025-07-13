import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { selectUsersHangarItems } from "@/store/upgradesStore";
import { generateItemKey } from "@/store/shareStore";
import { Typography, TextField, InputAdornment, TableContainer, TableHead, TableRow, TableCell, TableBody, TablePagination, Box, Table, Chip, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText, Autocomplete } from "@mui/material";
import { Search, ChevronsRight, BadgePercent, CircleUser, Inbox, PlusCircle, List } from "lucide-react";
import Crawler from "@/components/Crawler";
import UserSelector from "@/components/UserSelector";
import { ListingItem, Ship } from "@/types";

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

export default function StoreTable({ ships }: { ships: Ship[] }) {
  const intl = useIntl();
  const [ccus, setCcus] = useState<DisplayEquipmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [listingItems, setListingItems] = useState<ListingItem[]>([]);
  const [isListingDialogOpen, setIsListingDialogOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<DisplayEquipmentItem | null>(null);
  const [listingPrice, setListingPrice] = useState(0);
  const [listingQuantity, setListingQuantity] = useState(0);
  
  // 新增状态管理变量
  const [isManageListingDialogOpen, setIsManageListingDialogOpen] = useState(false);
  const [selectedFromShip, setSelectedFromShip] = useState<Ship | null>(null);
  const [selectedToShip, setSelectedToShip] = useState<Ship | null>(null);
  const [manualItemName, setManualItemName] = useState('');
  const [manualItemPrice, setManualItemPrice] = useState(0);
  const [manualItemQuantity, setManualItemQuantity] = useState(1);

  const { token, id } = useSelector((state: RootState) => state.user.user);
  const { locale } = intl;
  const { users } = useSelector((state: RootState) => state.upgrades);
  const items = useSelector(selectUsersHangarItems);
  const savedItems = useSelector((state: RootState) => state.share.selectedItems);
  const allItemPrices = useSelector((state: RootState) => state.share?.allItemPrices || {});

  const currency = 'USD';

  useEffect(() => {
    if (!id) return;

    fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/list`)
      .then(res => res.json()).then(data => {
        setListingItems(data.filter((item: ListingItem) => item.belongsTo === id));
      });
  }, [id]);

  useEffect(() => {
    const processStoreData = () => {
      // 第一步：收集所有可赠送的CCU
      const giftableCCUs = items.ccus
        .filter(ccu => ccu.canGift) // 只保留可赠送的
        .map(ccu => {
          const from = ships.find(ship => ship.name.toUpperCase().trim() === ccu.parsed.from.toUpperCase().trim())
          const to = ships.find(ship => ship.name.toUpperCase().trim() === ccu.parsed.to.toUpperCase().trim())

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
            : ccu.value;

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
  }, [currency, items, ships, savedItems, allItemPrices, users]);

  const mutateListingItems = () => {
    fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/list`)
      .then(res => res.json()).then(data => {
        setListingItems(data.filter((item: ListingItem) => item.belongsTo === id));
      });
  }

  const handleOpenListingDialog = (item: DisplayEquipmentItem) => {
    setCurrentItem(item);
    setListingPrice(item.value);
    setListingQuantity(item.quantity);
    setIsListingDialogOpen(true);
  };

  const handleCloseListingDialog = () => {
    setIsListingDialogOpen(false);
    setCurrentItem(null);
  };

  const handleListItem = async (item: DisplayEquipmentItem, value: number, stock: number) => {
    await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
      method: 'POST',
      body: JSON.stringify({
        name: item.name,
        price: value,
        item: JSON.stringify({
          type: item.type,
          from: item.from.id,
          to: item.to.id
        }),
        stock: stock,
        lockedStock: stock,
        belongsTo: id
      }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    mutateListingItems();
    handleCloseListingDialog();
  };

  const handleConfirmListing = () => {
    if (currentItem) {
      handleListItem(currentItem, listingPrice, listingQuantity);
    }
  };

  const handleRemoveItem = async (skuId?: string) => {
    if (!skuId) return;

    await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
      method: 'DELETE',
      body: JSON.stringify({
        skuId: skuId
      }),
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    mutateListingItems();
  };

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

  // 过滤和分页数据
  const filteredEquipment = ccus.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.from?.name && item.from.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.to?.name && item.to.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    item.owners.some(owner => owner.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const paginatedEquipment = filteredEquipment.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleOpenManageListingDialog = () => {
    setIsManageListingDialogOpen(true);
  };

  const handleCloseManageListingDialog = () => {
    setIsManageListingDialogOpen(false);
    resetManualFormFields();
  };

  const resetManualFormFields = () => {
    setSelectedFromShip(null);
    setSelectedToShip(null);
    setManualItemName('');
    setManualItemPrice(0);
    setManualItemQuantity(1);
  };

  const handleManualAdd = async () => {
    if (!selectedFromShip || !selectedToShip || !manualItemName || manualItemPrice <= 0 || manualItemQuantity <= 0) {
      return;
    }

    await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/item`, {
      method: 'POST',
      body: JSON.stringify({
        name: manualItemName,
        price: manualItemPrice,
        item: JSON.stringify({
          type: 'CCU',
          from: selectedFromShip.id,
          to: selectedToShip.id
        }),
        stock: manualItemQuantity,
        lockedStock: manualItemQuantity,
        belongsTo: id
      }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    mutateListingItems();
    resetManualFormFields();
  };

  return (<>
    <div className='absolute top-0 right-0 m-[15px] gap-2 hidden sm:flex'>
      <div className='flex flex-col gap-2 items-center justify-center'>
        <Crawler ships={ships} />
      </div>
      <UserSelector />
    </div>

    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
      <TextField
        sx={{ flexGrow: 1, mr: 2 }}
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
        startIcon={<List />} 
        onClick={handleOpenManageListingDialog}
      >
        <FormattedMessage id="hangar.manageListings" defaultMessage="Manage Listings" />
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
    ) : (
      <Box sx={{ width: '100%', overflow: 'auto' }}>
        <TableContainer sx={{ mb: 2 }}>
          <Table aria-label="Equipment table">
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
                <TableCell width="180px">
                  <FormattedMessage id="hangar.operation" defaultMessage="Operation" />
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedEquipment.map((item) => (
                <TableRow key={item.id} hover>
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
                          src={item.from.medias.productThumbMediumAndSmall.replace('medium_and_small', 'large')}
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
                          src={item.to.medias.productThumbMediumAndSmall.replace('medium_and_small', 'large')}
                          alt={item.to.name}
                        />
                        <div className='absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center justify-center'>
                          <span className='text-white text-sm'>
                            {item.name}
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
                        src={item.imageUrl}
                        alt={item.name}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col gap-2'>
                      <span className='text-md text-blue-500 font-bold'>
                        <span className='text-gray-500 mr-2 dark:text-gray-400'><FormattedMessage id="hangar.msrp" defaultMessage="MSRP:" /></span>
                        {(item.from.msrp / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                        <span className='text-gray-500 mx-2 dark:text-gray-400'>-</span>
                        {(item.to.msrp / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                      </span>
                      <span className='text-md text-blue-500 font-bold'>
                        <span className='text-gray-500 mr-2 dark:text-gray-400'><FormattedMessage id="hangar.cost" defaultMessage="Cost" /></span>
                        {item.value.toLocaleString(locale, { style: 'currency', currency: 'USD' })}
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
                        <Inbox className='w-4 h-4' /> {item.quantity}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell sx={{ textWrap: 'nowrap' }}>{item.isBuyBack && <FormattedMessage id="hangar.buyBack" defaultMessage="Buy Back" />} {item.type}</TableCell>
                  <TableCell>
                    {
                      listingItems.find(listing => listing.name === item.name) ? (
                        <Button variant="outlined" onClick={() => handleRemoveItem(listingItems.find(listing => listing.name === item.name)?.skuId)}>
                          <FormattedMessage id="hangar.remove" defaultMessage="Remove" />
                        </Button>
                      ) : (
                        <Button variant="outlined" onClick={() => handleOpenListingDialog(item)}>
                          <FormattedMessage id="hangar.edit" defaultMessage="List Item" />
                        </Button>
                      )
                    }
                  </TableCell>
                </TableRow>
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

    <Dialog open={isListingDialogOpen} onClose={handleCloseListingDialog}>
      <DialogTitle>
        <FormattedMessage id="hangar.listItem" defaultMessage="List Item" />
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          <FormattedMessage 
            id="hangar.listItemConfirm" 
            defaultMessage="Please confirm the price and quantity for {itemName}" 
            values={{itemName: currentItem?.name || ""}}
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
          onChange={(e) => setListingPrice(Number(e.target.value))}
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
          onChange={(e) => setListingQuantity(Number(e.target.value))}
          InputProps={{
            inputProps: { 
              min: 1, 
              max: currentItem?.quantity || 1 
            }
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCloseListingDialog}>
          <FormattedMessage id="cancel" defaultMessage="Cancel" />
        </Button>
        <Button onClick={handleConfirmListing}>
          <FormattedMessage id="confirm" defaultMessage="Confirm" />
        </Button>
      </DialogActions>
    </Dialog>

    {/* 新增管理上架物品的弹窗 */}
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
                    <TableCell><FormattedMessage id="hangar.price" defaultMessage="Price" /></TableCell>
                    <TableCell><FormattedMessage id="hangar.quantity" defaultMessage="Quantity" /></TableCell>
                    <TableCell><FormattedMessage id="hangar.action" defaultMessage="Action" /></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {listingItems.map((item) => (
                    <TableRow key={item.skuId}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.price.toLocaleString(locale, { style: 'currency', currency: 'USD' })}</TableCell>
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
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Autocomplete
              options={ships}
              getOptionLabel={(option) => option.name}
              value={selectedFromShip}
              onChange={(_, newValue) => setSelectedFromShip(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={intl.formatMessage({ id: 'hangar.fromShip', defaultMessage: 'From Ship' })}
                  variant="outlined"
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
                  variant="outlined"
                />
              )}
            />
            <TextField
              label={intl.formatMessage({ id: 'hangar.itemName', defaultMessage: 'Item Name' })}
              value={manualItemName}
              onChange={(e) => setManualItemName(e.target.value)}
              variant="outlined"
            />
            <TextField
              label={intl.formatMessage({ id: 'hangar.price', defaultMessage: 'Price' })}
              type="number"
              value={manualItemPrice}
              onChange={(e) => setManualItemPrice(Number(e.target.value))}
              variant="outlined"
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
            />
            <TextField
              label={intl.formatMessage({ id: 'hangar.quantity', defaultMessage: 'Quantity' })}
              type="number"
              value={manualItemQuantity}
              onChange={(e) => setManualItemQuantity(Number(e.target.value))}
              variant="outlined"
              InputProps={{
                inputProps: { min: 1 }
              }}
            />
            <Button
              variant="contained"
              startIcon={<PlusCircle />}
              onClick={handleManualAdd}
              disabled={!selectedFromShip || !selectedToShip || !manualItemName || manualItemPrice <= 0 || manualItemQuantity <= 0}
            >
              <FormattedMessage id="hangar.addItem" defaultMessage="Add Item" />
            </Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCloseManageListingDialog}>
          <FormattedMessage id="close" defaultMessage="Close" />
        </Button>
      </DialogActions>
    </Dialog>
  </>)
}