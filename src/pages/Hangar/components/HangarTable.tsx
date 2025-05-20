import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useSelector } from "react-redux";
import { RootState } from "../../../store";
import { selectUsersHangarItems } from "../../../store/upgradesStore";
import { Typography, TextField, InputAdornment, TableContainer, TableHead, TableRow, TableCell, TableBody, TablePagination, Box, Table, } from "@mui/material";
import { Search, ChevronsRight, BadgePercent, CircleUser, Gift, Inbox } from "lucide-react";
import Crawler from "../../../components/Crawler";
import UserSelector from "../../../components/UserSelector";
import { Ship } from "../../../types";

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
}

export default function HangarTable({ ships }: { ships: Ship[] }) {
  const intl = useIntl();
  const [ccus, steCcus] = useState<DisplayEquipmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { locale } = intl;
  const { users } = useSelector((state: RootState) => state.upgrades);
  const items = useSelector(selectUsersHangarItems);

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
          }
        }).filter(ccu => ccu !== undefined);

      steCcus(userCCUs);
      setIsLoading(false);
    };

    processStoreData();
  }, [intl, items, ships]);

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

  const paginatedEquipment = filteredEquipment.sort((b, a) => a.isBuyBack ? 1 : b.isBuyBack ? -1 : 0).slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (<>
    <div className='absolute top-0 right-0 m-[15px] gap-2 hidden sm:flex'>
      <div className='flex flex-col gap-2 items-center justify-center'>
        <Crawler ships={ships} />
      </div>
      <UserSelector />
    </div>

    <TextField
      fullWidth
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
      sx={{ mb: 2 }}
    />

    {isLoading ? (
      <Typography align="center"><FormattedMessage id="loading" defaultMessage="Loading..." /></Typography>
    ) : filteredEquipment.length === 0 ? (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="h6">
          <FormattedMessage id="hangar.noEquipment" defaultMessage="No content in your hangar" />
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
                            {item.isBuyBack && <FormattedMessage id="hangar.buyback" defaultMessage="Buyback:" />} {item.name}
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
                      <span className='text-md font-bold flex flex-col'>
                        <span className='text-gray-500 dark:text-gray-400 flex items-center gap-2'>
                          <CircleUser className='w-4 h-4' />
                          {
                            !item.isBuyBack && <Gift className={`${item.canGift ? 'text-green-300' : 'text-red-400'} w-4 h-4`} />
                          }
                          {users.find(user => user.id === item.belongsTo)?.nickname || '-'}
                        </span>
                      </span>
                      <span className='text-md font-bold flex items-center gap-2 text-gray-500 dark:text-gray-400'>
                        <Inbox className='w-4 h-4' />{item.quantity}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell sx={{ textWrap: 'nowrap' }}>{item.isBuyBack && <FormattedMessage id="hangar.buyBack" defaultMessage="Buy Back" />} {item.type}</TableCell>
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
  </>)
}