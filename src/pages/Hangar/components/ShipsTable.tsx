import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Typography, TextField, InputAdornment, TableContainer, TableHead, TableRow, TableCell, TableBody, TablePagination, Box, Table, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";
import { Search, PlusCircle, XCircle, Edit } from "lucide-react";
import { Ship } from "../../../types";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../store";
import { addPredict, removePredict } from "../../../store/upgradesStore";

export default function ShipsTable({ ships }: { ships: Ship[] }) {
  const intl = useIntl();
  const dispatch = useDispatch();
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { locale } = intl;
  const [predictDialogOpen, setPredictDialogOpen] = useState(false);
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
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
    ship.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ship.manufacturer && ship.manufacturer.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // 按MSRP排序
  const sortedShips = [...filteredShips].sort((a, b) => (b.msrp || 0) - (a.msrp || 0));

  // 分页
  const paginatedShips = sortedShips.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

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
      <TextField
        fullWidth
        variant="outlined"
        placeholder={intl.formatMessage({ id: 'search.ships.placeholder', defaultMessage: '搜索舰船名称...' })}
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
      ) : (
        <Box sx={{ width: '100%', overflow: 'auto' }}>
          <TableContainer sx={{ mb: 2 }}>
            <Table aria-label="Ships table">
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
                    <FormattedMessage id="ships.msrp" defaultMessage="MSRP" />
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
                      {ship.medias && ship.medias.productThumbMediumAndSmall && (
                        <Box
                          component="img"
                          sx={{ width: 180, height: 100, objectFit: 'cover', maxWidth: '180px' }}
                          src={ship.medias.productThumbMediumAndSmall.replace('medium_and_small', 'large')}
                          alt={ship.name}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body1" fontWeight="bold">
                        {ship.name}
                      </Typography>
                    </TableCell>
                    <TableCell>{ship.manufacturer ? ship.manufacturer.name : '-'}</TableCell>
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
        </Box>
      )}

      {/* Prediction Dialog */}
      <Dialog open={predictDialogOpen} onClose={handleClosePredictDialog}>
        <DialogTitle>
          <FormattedMessage 
            id="ships.predictDialog.title" 
            defaultMessage="预测 {shipName} 价格" 
            values={{ shipName: selectedShip?.name || '' }} 
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