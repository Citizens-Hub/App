import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, InputAdornment, TablePagination, Select, MenuItem, FormControl, InputLabel, List, ListItem, ListItemText, IconButton } from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Search, Delete, Add } from '@mui/icons-material';
import { selectUsersHangarItems, addPredict, removePredict } from '../../store/upgradesStore';
import { RootState } from '../../store';
import useResourceData from './hooks/useResourceData';
import UserSelector from '../../components/UserSelector';

interface DisplayShipItem {
  id: string;
  name: string;
  manufacturer?: string;
  type?: string;
  price?: number;
  imageUrl?: string;
  insuranceType?: string;
  insuranceEnd?: string;
  packageName?: string;
  value: number;
  canGift: boolean;
}

interface DisplayEquipmentItem {
  id: string;
  name: string;
  type: string;
  manufacturer?: string;
  imageUrl?: string;
  value: number;
  canGift: boolean;
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
}

export default function Hangar() {
  const intl = useIntl();
  const dispatch = useDispatch();
  const [ships, setShips] = useState<Partial<DisplayShipItem>[]>([]);
  const [ccus, steCcus] = useState<DisplayEquipmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedShip, setSelectedShip] = useState<number | ''>('');
  const [predictPrice, setPredictPrice] = useState<string>('');

  const { locale } = intl;
  const { users } = useSelector((state: RootState) => state.upgrades);
  const items = useSelector(selectUsersHangarItems);
  const { ships: shipsData, loading } = useResourceData();
  const predictions = useSelector((state: RootState) => state.upgrades.items.predicts);

  useEffect(() => {
    // 获取并处理仓库中的数据
    const processStoreData = () => {
      // 处理预测数据
      const predicts = Object.entries(predictions).map(([shipId, price]) => {
        const ship = shipsData.find(s => s.id === Number(shipId));
        return {
          id: shipId,
          name: ship?.name || `Ship ID: ${shipId}`,
          price: price,
          imageUrl: ship?.medias.productThumbMediumAndSmall,
        }
      });

      // 处理CCU数据
      const userCCUs = items.ccus
        .map(ccu => {
          const from = shipsData.find(ship => ship.name.toUpperCase().trim() === ccu.parsed.from.toUpperCase().trim())
          const to = shipsData.find(ship => ship.name.toUpperCase().trim() === ccu.parsed.to.toUpperCase().trim())

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
          }
        }).filter(ccu => ccu !== undefined);

      setShips(predicts);
      steCcus(userCCUs);
      setIsLoading(false);
    };

    processStoreData();
  }, [intl, items, shipsData, predictions]);

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
    (item.to?.name && item.to.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const paginatedEquipment = filteredEquipment.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  // 处理价格预测添加
  const handleAddPrediction = () => {
    if (selectedShip && predictPrice) {
      dispatch(addPredict({
        shipId: Number(selectedShip),
        price: Number(predictPrice) * 100
      }));
      setPredictPrice('');
    }
  };

  // 处理价格预测删除
  const handleRemovePrediction = (shipId: number) => {
    dispatch(removePredict(shipId));
  };

  if (loading) {
    return <Typography align="center">Loading...</Typography>
  }

  return (
    <div className='absolute top-[65px] left-0 right-0 bottom-0 flex'>
      <div className='flex flex-col flex-1 justify-between items-center min-w-[300px] border-r border-gray-200 dark:border-gray-800 py-4 px-4'>
        <div className='w-full'>
          <Typography variant="h6" sx={{ mb: 2 }}>
            <FormattedMessage id="hangar.predictions" defaultMessage="舰船价格预测" />
          </Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="ship-select-label">
              <FormattedMessage id="hangar.selectShip" defaultMessage="选择舰船" />
            </InputLabel>
            <Select
              labelId="ship-select-label"
              value={selectedShip}
              onChange={(e) => setSelectedShip(e.target.value as number)}
              label={intl.formatMessage({ id: "hangar.selectShip", defaultMessage: "选择舰船" })}
            >
              {shipsData.map((ship) => (
                <MenuItem key={ship.id} value={ship.id}>
                  {ship.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', mb: 2 }}>
            <TextField
              label={intl.formatMessage({ id: "hangar.predictPrice", defaultMessage: "预测价格" })}
              type="number"
              value={predictPrice}
              onChange={(e) => setPredictPrice(e.target.value)}
              sx={{ flexGrow: 1, mr: 1 }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleAddPrediction}
              disabled={!selectedShip || !predictPrice}
            >
              <Add />
            </Button>
          </Box>

          <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
            <FormattedMessage id="hangar.currentPredictions" defaultMessage="当前预测" />
          </Typography>

          <List>
            {Object.entries(predictions).map(([shipId, price]) => {
              const ship = shipsData.find(s => s.id === Number(shipId));
              return (
                <ListItem
                  key={shipId}
                  secondaryAction={
                    <IconButton edge="end" onClick={() => handleRemovePrediction(Number(shipId))}>
                      <Delete />
                    </IconButton>
                  }
                  divider
                >
                  <ListItemText
                    primary={ship?.name || `Ship ID: ${shipId}`}
                    secondary={`$${price}`}
                  />
                </ListItem>
              );
            })}
            {Object.keys(predictions).length === 0 && (
              <ListItem>
                <ListItemText primary={intl.formatMessage({ id: "hangar.noPredictions", defaultMessage: "暂无价格预测" })} />
              </ListItem>
            )}
          </List>
        </div>
      </div>

      <div className='mt-32 px-4 w-full h-[calc(100vh-128px-65px)] overflow-y-auto'>
        <div className='absolute top-0 right-0 m-[15px]'>
          <UserSelector />
        </div>

        <TextField
          fullWidth
          variant="outlined"
          placeholder={intl.formatMessage({ id: 'search.placeholder', defaultMessage: '搜索装备名称...' })}
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

        {isLoading ? (
          <Typography align="center">加载中...</Typography>
        ) : filteredEquipment.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6">
              <FormattedMessage id="hangar.noEquipment" defaultMessage="您的机库中没有装备" />
            </Typography>
            <Button variant="contained" sx={{ mt: 2 }}>
              <FormattedMessage id="hangar.addEquipment" defaultMessage="添加装备" />
            </Button>
          </Box>
        ) : (
          <Box sx={{ width: '100%', overflow: 'auto' }}>
            <TableContainer sx={{ mb: 2 }}>
              <Table aria-label="装备表格">
                <TableHead>
                  <TableRow>
                    <TableCell>图片</TableCell>
                    <TableCell>名称</TableCell>
                    <TableCell>类型</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ships.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell>
                        <Box sx={{ position: 'relative', width: 320, height: 180 }}>
                          <Box
                            component="img"
                            sx={{
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                            src={item?.imageUrl?.replace('medium_and_small', 'large') || ''}
                            alt={item.name}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-col gap-2'>
                          <span className='text-xl font-bold'>
                            {item.name}
                          </span>
                          <span className='text-md text-blue-500 font-bold'>
                            {((item.price || 0) / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                          </span>
                          <span className='text-sm text-gray-500'>
                            {(() => {
                              // 查找该舰船的msrp
                              const ship = shipsData.find(s => String(s.id) === String(item.id));
                              if (!ship || typeof item.price !== 'number' || typeof ship.msrp !== 'number') return null;
                              const diff = (item.price - ship.msrp) / 100;
                              if (diff === 0) return '与MSRP持平';
                              return diff > 0
                                ? `高于MSRP ${(diff).toLocaleString(locale, { style: 'currency', currency: 'USD' })}`
                                : `低于MSRP ${Math.abs(diff).toLocaleString(locale, { style: 'currency', currency: 'USD' })}`;
                            })()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <FormattedMessage id="hangar.predictPrice" defaultMessage="价格预测" />
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedEquipment.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell>
                        {item.type === 'CCU' && item.from && item.to ? (
                          <Box sx={{ position: 'relative', width: 320, height: 180 }}>
                            <Box
                              component="img"
                              sx={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                width: '50%',
                                height: '100%',
                                objectFit: 'cover'
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
                                width: '50%',
                                height: '100%',
                                objectFit: 'cover'
                              }}
                              src={item.to.medias.productThumbMediumAndSmall.replace('medium_and_small', 'large')}
                              alt={item.to.name}
                            />
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
                          <span className='text-xl font-bold'>
                            {item.name}
                          </span>
                          <span className='text-md text-blue-500 font-bold'>
                            {((item.from.msrp || 0) / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                            <span className='text-gray-500 mx-2'>-</span>
                            {((item.to.msrp || 0) / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                            <span className='text-gray-500 mx-2'><FormattedMessage id="hangar.cost" defaultMessage="成本" /></span>
                            {item.value.toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                          </span>
                          <span className='text-md text-blue-500 font-bold'>
                            <span className='text-gray-500 mr-2'><FormattedMessage id="hangar.save" defaultMessage="节省" /></span>
                            {(((item.to.msrp || 0) - (item.from.msrp || 0)) / 100 - item.value).toLocaleString(locale, { style: 'currency', currency: 'USD' })}
                            <span className='text-gray-500 mx-2'>
                              {((((item.to.msrp || 0) - (item.from.msrp || 0)) / 100 - item.value) / (((item.to.msrp || 0) - (item.from.msrp || 0)) / 100) * 100).toFixed(2)}%
                            </span>
                          </span>
                          <span className='text-md font-bold flex flex-col'>
                            <span className='text-gray-500'>
                              {users.find(user => user.id === item.belongsTo)?.nickname || '-'}
                            </span>
                            {
                              item.canGift ? <FormattedMessage id="hangar.giftable" defaultMessage="可赠送" /> : <FormattedMessage id="hangar.notGiftable" defaultMessage="不可赠送" />
                            }
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{item.type}</TableCell>
                      {/* <TableCell>${item.value}</TableCell>
                      <TableCell>${((item.to.msrp || 0) - (item.from.msrp || 0)) / 100 - item.value}</TableCell>
                      <TableCell>{item.from.name}</TableCell>
                      <TableCell>{item.to.name}</TableCell>
                      <TableCell>
                        <Chip
                          label={item.canGift ? '是' : '否'}
                          size="small"
                          color={item.canGift ? 'primary' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        {users.find(user => user.id === item.belongsTo)?.nickname || '-'}
                      </TableCell> */}
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
      </div>
    </div>
  );
}
