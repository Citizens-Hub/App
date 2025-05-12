import { useState, } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, clearUpgrades, setCurrency } from '../../store';
import {
  Typography,
  Button,
  Select,
  MenuItem,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  SelectChangeEvent,
  Alert,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';

const CURRENCIES = ['USD', 'EUR', 'CNY', 'GBP', 'JPY'];

enum Page {
  Preferences = 'preferences',
  LocalData = 'localData',
}

export default function Settings() {
  const intl = useIntl();
  const dispatch = useDispatch();
  const users = useSelector((state: RootState) => state.upgrades.users);

  const [currentPage, setCurrentPage] = useState<Page>(Page.Preferences);
  const { currency } = useSelector((state: RootState) => state.upgrades);
  const [clearAllDataDialog, setClearAllDataDialog] = useState(false);
  const [clearUserDataDialog, setClearUserDataDialog] = useState(false);
  const [selectedUserToClear, setSelectedUserToClear] = useState<number>(-1);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 处理货币变更
  const handleCurrencyChange = (event: SelectChangeEvent) => {
    const newCurrency = event.target.value as string;
    dispatch(setCurrency(newCurrency));

    setSuccessMessage(intl.formatMessage({
      id: 'settings.currencyUpdated',
      defaultMessage: '货币已更新为 {currency}'
    }, { currency: newCurrency }));

    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // 清除所有本地数据
  const handleClearAllData = () => {
    localStorage.clear();
    window.location.reload();
  };

  // 清除特定用户的数据
  const handleClearUserData = () => {
    if (selectedUserToClear !== -1) {
      dispatch(clearUpgrades(selectedUserToClear));

      setSuccessMessage(intl.formatMessage({
        id: 'settings.userDataCleared',
        defaultMessage: '用户数据已清除'
      }));

      setTimeout(() => setSuccessMessage(null), 3000);
    }
    setClearUserDataDialog(false);
  };

  return (
    <div className='absolute top-[65px] left-0 right-0 bottom-0 flex text-left flex-col md:flex-row justify-start'>
      {successMessage && (
        <div className='absolute bottom-5 left-0 right-0 flex justify-center items-center'>
          <Alert severity="success" sx={{ mb: 2 }}>
            {successMessage}
          </Alert>
        </div>
      )}

      <div className='flex flex-col text-left min-w-[300px] border-r border-b border-gray-200 dark:border-gray-800'>
        <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.Preferences ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.Preferences)}>
          <FormattedMessage id="settings.preferences" defaultMessage="Preferences" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="settings.preferencesDescription" defaultMessage="Manage your preferences and settings here." />
          </Typography>
        </div>
        <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.LocalData ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.LocalData)}>
          <FormattedMessage id="settings.localData" defaultMessage="Local Data" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="settings.localDataDescription" defaultMessage="Manage your local data here." />
          </Typography>
        </div>
      </div>

      <div className='w-full'>
        <div className='max-w-[700px] py-4 px-4 flex flex-col gap-6'>
          {
            currentPage === Page.Preferences && (
              <>
                <div className='text-2xl font-bold'>
                  <FormattedMessage id="settings.preferences" defaultMessage="Preferences" />
                </div>

                <div className='flex flex-row items-center gap-2 justify-between'>
                  <div>
                    <FormattedMessage id="settings.currency" defaultMessage="Preferred Currency" />
                    <Typography variant="body2" color='text.secondary'>
                      <FormattedMessage id="settings.currencyDescription" defaultMessage="The currency you prefer to use when setting up a link using third-party CCUs." />
                    </Typography>
                  </div>
                  <Select
                    labelId="currency-select-label"
                    value={currency}
                    onChange={handleCurrencyChange}
                    sx={{ width: '200px' }}
                    size='small'
                  >
                    {CURRENCIES.map((curr) => (
                      <MenuItem key={curr} value={curr}>
                        {curr}
                      </MenuItem>
                    ))}
                  </Select>
                </div>
              </>
            )}

          {
            currentPage === Page.LocalData && (
              <div className='flex flex-col gap-4'>
                <div className='text-2xl flex flex-row items-center gap-2 justify-between'>
                  <FormattedMessage id="settings.localData" defaultMessage="Local Data" />
                </div>
                <Typography variant="body1" gutterBottom>
                  <FormattedMessage id="settings.clearAllDataDescription" defaultMessage="Clear all local data, including all user data and settings. This action cannot be undone." />
                </Typography>
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => setClearAllDataDialog(true)}
                >
                  <FormattedMessage id="settings.clearAllData" defaultMessage="Clear All Data" />
                </Button>

                {users.length > 0 && (
                  <>
                    <Typography variant="body1" gutterBottom>
                      <FormattedMessage id="settings.clearUserDataDescription" defaultMessage="Clear the hangar data of a specific user. This action cannot be undone." />
                    </Typography>
                    <div className='flex flex-col gap-4'>
                      {
                        users.map((user) => (
                          <div key={user.id} className='flex flex-row items-center gap-2 justify-between'>
                            {user.nickname || user.username}
                            <Button variant="contained" color="error" onClick={() => {
                              setSelectedUserToClear(user.id);
                              setClearUserDataDialog(true);
                            }}>
                              <FormattedMessage id="settings.clearUserData" defaultMessage="Clear User Data" />
                            </Button>
                          </div>
                        ))
                      }
                    </div>
                  </>
                )}
              </div>
            )}
        </div>
      </div>

      {/* 清除所有数据确认对话框 */}
      <Dialog
        open={clearAllDataDialog}
        onClose={() => setClearAllDataDialog(false)}
      >
        <DialogTitle>
          <FormattedMessage id="settings.confirmClearAll" defaultMessage="Confirm Clear All Data?" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            <FormattedMessage id="settings.confirmClearAllDescription" defaultMessage="This action will clear all local storage data, including user information, settings, and preferences. This action cannot be undone." />
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearAllDataDialog(false)}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleClearAllData} color="error" autoFocus>
            <FormattedMessage id="common.confirm" defaultMessage="Confirm" />
          </Button>
        </DialogActions>
      </Dialog>

      {/* 清除用户数据确认对话框 */}
      <Dialog
        open={clearUserDataDialog}
        onClose={() => setClearUserDataDialog(false)}
      >
        <DialogTitle>
          <FormattedMessage id="settings.confirmClearUser" defaultMessage="Confirm Clear User Data?" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            <FormattedMessage id="settings.confirmClearUserDescription" defaultMessage="This action will clear all local storage data of the selected user. This action cannot be undone." />
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearUserDataDialog(false)}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleClearUserData} color="error" autoFocus>
            <FormattedMessage id="common.confirm" defaultMessage="Confirm" />
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
