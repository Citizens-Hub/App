import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, TextField, InputAdornment, TablePagination } from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Search } from '@mui/icons-material';
import { RootState, selectUsersHangarItems } from '../../store';
import useResourceData from './hooks/useResourceData';
import UserSelector from '../../components/UserSelector';

// interface DisplayShipItem {
//   id: string;
//   name: string;
//   manufacturer?: string;
//   type?: string;
//   imageUrl?: string;
//   insuranceType?: string;
//   insuranceEnd?: string;
//   packageName?: string;
//   value: number;
//   canGift: boolean;
// }

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
  // const [ships, setShips] = useState<DisplayShipItem[]>([]);
  const [equipment, setEquipment] = useState<DisplayEquipmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { users } = useSelector((state: RootState) => state.upgrades);
  const items = useSelector(selectUsersHangarItems);
  const { ships: shipsData, loading } = useResourceData();

  useEffect(() => {
    // 获取并处理仓库中的数据
    const processStoreData = () => {
      // // 处理飞船数据
      // const userShips = [...items.ships, ...items.bundles.flatMap(bundle => bundle.ships)]
      //   .map(ship => ({
      //     id: ship.id?.toString() || Math.random().toString(),
      //     name: ship.name,
      //     value: ship.value,
      //     canGift: ship.canGift,
      //     type: '飞船',
      //     imageUrl: 'https://robertsspaceindustries.com/media/bp86xpkhi47etr/store_small/Andromeda_Storefront.jpg', // 默认图片
      //     insuranceType: 'LTI',
      //   }));

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

      // setShips(userShips);
      setEquipment(userCCUs);
      setIsLoading(false);
    };

    processStoreData();
  }, [intl, items, shipsData]);

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
  const filteredEquipment = equipment.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.from?.name && item.from.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.to?.name && item.to.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const paginatedEquipment = filteredEquipment.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  if (loading) {
    return <Typography align="center">Loading...</Typography>
  }

  return (
    <div className='absolute top-[65px] left-0 right-0 bottom-0 flex'>
      <div className='flex flex-col flex-1 justify-between items-center min-w-[300px] border-r border-gray-200 dark:border-gray-800 py-4 px-4'>

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
                    <TableCell>价值</TableCell>
                    <TableCell>节约</TableCell>
                    <TableCell>从</TableCell>
                    <TableCell>到</TableCell>
                    <TableCell>可赠送</TableCell>
                    <TableCell>属于</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
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
                        <span className='text-lg'>
                          {item.name}
                        </span>
                      </TableCell>
                      <TableCell>{item.type}</TableCell>
                      <TableCell>${item.value}</TableCell>
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
      </div>
    </div>
  );
}
