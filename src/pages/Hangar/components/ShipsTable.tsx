import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Typography, TextField, InputAdornment, TableContainer, TableHead, TableRow, TableCell, TableBody, TablePagination, Box, Table, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";
import { Search, PlusCircle, XCircle, Edit } from "lucide-react";
import { Ship } from "@/types";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store";
import { addPredict, removePredict } from "@/store/upgradesStore";
import { localizeShipDataLabel } from "@/data/shipDetailLabelI18n";
import { getShipThumbLarge } from "@/utils/shipImage";
import { getShipDisplayName, getShipManufacturerDisplayName, matchesShipManufacturerQuery, matchesShipNameQuery } from "@/utils/shipDisplay";
import HangarToolbar from "./HangarToolbar";
import useMobileInfiniteRows from "@/hooks/useMobileInfiniteRows";
import ShipInfoDialog from "@/components/ShipInfoDialog";

export default function ShipsTable({ ships }: { ships: Ship[] }) {
  const intl = useIntl();
  const dispatch = useDispatch();
  const [searchTerm, setSearchTerm] = useState('');
  const { locale } = intl;
  const [predictDialogOpen, setPredictDialogOpen] = useState(false);
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
  const [detailShip, setDetailShip] = useState<Ship | null>(null);
  const [predictPrice, setPredictPrice] = useState('');

  // Get predictions from store
  const predictions = useSelector((state: RootState) => state.upgrades.items.predicts);

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

  // 过滤和排序数据
  const filteredShips = ships.filter(ship =>
    matchesShipNameQuery(ship, searchTerm) ||
    matchesShipManufacturerQuery(ship, searchTerm)
  );

  // 按MSRP排序
  const sortedShips = [...filteredShips].sort((a, b) => (b.msrp || 0) - (a.msrp || 0));
  const {
    isMobile,
    page,
    rowsPerPage,
    setPage,
    setRowsPerPage,
    displayedItems: paginatedShips,
    sentinelRef,
    hasMore,
  } = useMobileInfiniteRows(sortedShips, { resetKey: searchTerm });

  // Open prediction dialog
  const handleOpenPredictDialog = (ship: Ship) => {
    setSelectedShip(ship);
    setPredictPrice(predictions[ship.id] ? (predictions[ship.id] / 100).toString() : '');
    setPredictDialogOpen(true);
  };

  // Close prediction dialog
  const handleClosePredictDialog = () => {
    setPredictDialogOpen(false);
    setSelectedShip(null);
    setPredictPrice('');
  };

  const handleOpenShipDetail = (ship: Ship) => {
    setDetailShip(ship);
  };

  const handleCloseShipDetail = () => {
    setDetailShip(null);
  };

  // Save prediction
  const handleSavePrediction = () => {
    if (selectedShip && predictPrice) {
      const priceInCents = Math.round(parseFloat(predictPrice) * 100);
      dispatch(addPredict({ shipId: selectedShip.id, price: priceInCents }));
      handleClosePredictDialog();
    }
  };

  // Remove prediction
  const handleRemovePrediction = (shipId: number) => {
    dispatch(removePredict(shipId));
  };

  return (
    <>
      <HangarToolbar ships={ships} />

      <TextField
        fullWidth
        variant="outlined"
        placeholder={intl.formatMessage({ id: 'search.ships.placeholder', defaultMessage: '搜索舰船名称...' })}
        value={searchTerm}
        onChange={handleSearchChange}
        sx={{
          '& .MuiOutlinedInput-root': { borderRadius: 0 },
          mb:2
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

      {ships.length === 0 ? (
        <Typography align="center">
          <FormattedMessage id="ships.noShips" defaultMessage="没有舰船数据" />
        </Typography>
      ) : filteredShips.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6">
            <FormattedMessage id="ships.noResults" defaultMessage="没有匹配的舰船" />
          </Typography>
        </Box>
      ) : isMobile ? (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {paginatedShips.map((ship) => (
            <Box
              key={ship.id}
              sx={{
                display: 'flex',
                gap: 1.5,
                py: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              {ship.medias?.productThumbMediumAndSmall && (
                <Box
                  component="img"
                  sx={{
                    width: 104,
                    height: 80,
                    objectFit: 'cover',
                    borderRadius: 1,
                    flexShrink: 0,
                  }}
                  src={getShipThumbLarge(ship)}
                  alt={ship.name}
                />
              )}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {getShipDisplayName(ship) || ship.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                  {getShipManufacturerDisplayName(ship) || '-'}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body1" color="primary" fontWeight={700}>
                    {ship.msrp
                      ? (ship.msrp / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })
                      : '-'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                    <FormattedMessage id="ships.prediction" defaultMessage="Predicted Price" />: {" "}
                    {predictions[ship.id]
                      ? (predictions[ship.id] / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })
                      : '-'}
                  </Typography>
                </Box>

                <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => handleOpenShipDetail(ship)}
                  >
                    <FormattedMessage id="hangar.mobileViewDetails" defaultMessage="查看详情" />
                  </Button>
                  {predictions[ship.id] ? (
                    <>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleOpenPredictDialog(ship)}
                        startIcon={<Edit size={16} />}
                      >
                        <FormattedMessage id="ships.editPrediction" defaultMessage="编辑预测" />
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => handleRemovePrediction(ship.id)}
                        startIcon={<XCircle size={16} />}
                      >
                        <FormattedMessage id="ships.removePrediction" defaultMessage="删除预测" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleOpenPredictDialog(ship)}
                      startIcon={<PlusCircle size={16} />}
                    >
                      <FormattedMessage id="ships.addPrediction" defaultMessage="添加预测" />
                    </Button>
                  )}
                </Box>
              </Box>
            </Box>
          ))}
          {hasMore && <div ref={sentinelRef} className="h-8 w-full" aria-hidden="true" />}
        </Box>
      ) : (
        <Box sx={{ width: '100%', overflow: 'auto' }}>
          <TableContainer sx={{ mb: 2 }}>
            <Table aria-label={intl.formatMessage({ id: 'ships.table.ariaLabel', defaultMessage: 'Ships table' })}>
              <TableHead>
                <TableRow>
                  <TableCell width="200px" sx={{ textWrap: 'nowrap' }}>
                    <FormattedMessage id="ships.image" defaultMessage="Image" />
                  </TableCell>
                  <TableCell sx={{ textWrap: 'nowrap' }}>
                    <FormattedMessage id="ships.name" defaultMessage="Name" />
                  </TableCell>
                  <TableCell sx={{ textWrap: 'nowrap' }}>
                    <FormattedMessage id="ships.manufacturer" defaultMessage="Manufacturer" />
                  </TableCell>
                  <TableCell width="150px" sx={{ textWrap: 'nowrap' }}>
                    {localizeShipDataLabel(locale, 'msrp')}
                  </TableCell>
                  <TableCell width="170px" sx={{ textWrap: 'nowrap' }}>
                    <FormattedMessage id="ships.prediction" defaultMessage="Predicted Price" />
                  </TableCell>
                  <TableCell width="100px" sx={{ textWrap: 'nowrap' }}>
                    <FormattedMessage id="ships.actions" defaultMessage="Actions" />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedShips.map((ship) => (
                  <TableRow key={ship.id} hover>
                    <TableCell>
                      {ship.medias && ship?.medias?.productThumbMediumAndSmall && (
                        <Box
                          component="img"
                          sx={{ width: 180, height: 100, objectFit: 'cover', maxWidth: '180px' }}
                          src={getShipThumbLarge(ship)}
                          alt={ship.name}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body1" fontWeight="bold">
                        {getShipDisplayName(ship) || ship.name}
                      </Typography>
                    </TableCell>
                    <TableCell>{getShipManufacturerDisplayName(ship) || '-'}</TableCell>
                    <TableCell>
                      {ship.msrp
                        ? (ship.msrp / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {predictions[ship.id]
                        ? (predictions[ship.id] / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {predictions[ship.id] ? (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleOpenPredictDialog(ship)}
                            aria-label={intl.formatMessage({ id: 'ships.editPrediction', defaultMessage: '编辑预测' })}
                          >
                            <Edit size={18} />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemovePrediction(ship.id)}
                            aria-label={intl.formatMessage({ id: 'ships.removePrediction', defaultMessage: '删除预测' })}
                          >
                            <XCircle size={18} />
                          </IconButton>
                        </Box>
                      ) : (
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleOpenPredictDialog(ship)}
                          aria-label={intl.formatMessage({ id: 'ships.addPrediction', defaultMessage: '添加预测' })}
                        >
                          <PlusCircle size={18} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {!isMobile && (
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={filteredShips.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: '每页行数:' })}
              labelDisplayedRows={({ from, to, count }) =>
                `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: '共' })}${count}${intl.formatMessage({ id: 'pagination.items', defaultMessage: '项' })}`
              }
            />
          )}
        </Box>
      )}

      <ShipInfoDialog
        open={Boolean(detailShip)}
        ship={detailShip}
        onClose={handleCloseShipDetail}
      />

      {/* Prediction Dialog */}
      <Dialog open={predictDialogOpen} onClose={handleClosePredictDialog}>
        <DialogTitle>
            <FormattedMessage
              id="ships.predictDialog.title"
              defaultMessage="预测 {shipName} 价格"
              values={{ shipName: getShipDisplayName(selectedShip) || selectedShip?.name || '' }}
            />
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={intl.formatMessage({ id: 'ships.predictDialog.price', defaultMessage: '预测价格 (USD)' })}
            type="number"
            fullWidth
            variant="outlined"
            value={predictPrice}
            onChange={(e) => setPredictPrice(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 0 }
            }}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePredictDialog}>
            <FormattedMessage id="common.cancel" defaultMessage="取消" />
          </Button>
          <Button onClick={handleSavePrediction} variant="contained" color="primary">
            <FormattedMessage id="common.save" defaultMessage="保存" />
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
