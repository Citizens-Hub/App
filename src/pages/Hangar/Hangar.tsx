import { Typography } from '@mui/material';
import { FormattedMessage } from 'react-intl';
import { useState } from 'react';
import HangarTable from './components/HangarTable';
import useHangarData from './hooks/useHangarData';
import ShipsTable from './components/ShipsTable';
import ShareTable from './components/ShareTable';

enum Page {
  Hangar = 'hangar',
  Ships = 'ships',
  Shared = 'shared',
}

export default function Hangar() {
  const [currentPage, setCurrentPage] = useState<Page>(Page.Hangar);
  const { ships, loading, exchangeRates } = useHangarData();

  return (
    <div className='absolute top-[65px] h-[calc(100vh-65px)] left-0 right-0 bottom-0 flex text-left flex-col md:flex-row justify-start'>
      <div className='flex flex-col text-left min-w-[300px] border-r border-b border-gray-200 dark:border-gray-800'>
        {/* Commented out price prediction section - to be implemented in future updates
          <Typography variant="h6" sx={{ mb: 2 }}>
            <FormattedMessage id="hangar.predictions" defaultMessage="Ship Price Prediction" />
          </Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="ship-select-label">
              <FormattedMessage id="hangar.selectShip" defaultMessage="Select Ship" />
            </InputLabel>
            <Select
              labelId="ship-select-label"
              value={selectedShip}
              onChange={(e) => setSelectedShip(e.target.value as number)}
              label={intl.formatMessage({ id: "hangar.selectShip", defaultMessage: "Select Ship" })}
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
              label={intl.formatMessage({ id: "hangar.predictPrice", defaultMessage: "Predict Price" })}
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
            <FormattedMessage id="hangar.currentPredictions" defaultMessage="Current Predictions" />
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
                <ListItemText primary={intl.formatMessage({ id: "hangar.noPredictions", defaultMessage: "No price predictions yet" })} />
              </ListItem>
            )}
          </List>
        </div> */}

        <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.Hangar ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.Hangar)}>
          <FormattedMessage id="hangar.hangar" defaultMessage="Hangar" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="hangar.hangarDescription" defaultMessage="View items in your hangar here" />
          </Typography>
        </div>
        <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.Ships ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.Ships)}>
          <FormattedMessage id="hangar.ships" defaultMessage="Ships" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="hangar.shipsDescription" defaultMessage="View ships and set predictions here" />
          </Typography>
        </div>
        <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.Shared ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.Shared)}>
          <FormattedMessage id="hangar.shared" defaultMessage="Shared" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="hangar.sharedDescription" defaultMessage="View shared content here" />
          </Typography>
        </div>
      </div>

      <div className='sm:mt-28 p-4 w-full h-[calc(100vh-128px-65px)] overflow-y-auto'>
        {loading ? <Typography align="center"><FormattedMessage id="loading" defaultMessage="Loading..." /></Typography> : (<>
          {currentPage === Page.Hangar && <HangarTable ships={ships} />}
          {currentPage === Page.Ships && <ShipsTable ships={ships} />}
          {currentPage === Page.Shared && <ShareTable ships={ships} exchangeRates={exchangeRates} />}
        </>)}
      </div>
    </div>
  );
}
