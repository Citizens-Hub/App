import { useEffect, useState, } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { clearUpgrades, setCurrency } from '../../store/upgradesStore';
import { RootState } from '../../store';
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
  Skeleton,
  Input,
  Avatar,
  Snackbar,
  CircularProgress,
  Divider,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { UserRole } from '../../store/userStore';
import useProfileData from './hooks/useProfileData';
import { ProfileData } from '../../types';
import CcuPriorityList from './components/CcuPriorityList';

const CURRENCIES = ['USD', 'EUR', 'CNY', 'GBP', 'JPY'];

enum Page {
  Preferences = 'preferences',
  LocalData = 'localData',
  Profile = 'profile',
}

export default function Settings() {
  const intl = useIntl();
  const dispatch = useDispatch();
  const users = useSelector((state: RootState) => state.upgrades.users);
  const { user } = useSelector((state: RootState) => state.user);

  const { profile, loading } = useProfileData(user.id);

  const [profileData, setProfileData] = useState<ProfileData>({
    name: null,
    avatar: null,
    description: null,
    contacts: null,
    homepage: null,
    sharedHangar: null,

    // immutable
    email: null,
    emailVerified: 0,
  });

  useEffect(() => {
    if (profile) {
      setProfileData(profile);
    }
  }, [profile]);

  const [currentPage, setCurrentPage] = useState<Page>(user.role === UserRole.Guest ? Page.Preferences : Page.Profile);
  const { currency } = useSelector((state: RootState) => state.upgrades);
  const [clearAllDataDialog, setClearAllDataDialog] = useState(false);
  const [clearUserDataDialog, setClearUserDataDialog] = useState(false);
  const [selectedUserToClear, setSelectedUserToClear] = useState<number>(-1);
  
  // 新增状态
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  // 处理货币变更
  const handleCurrencyChange = (event: SelectChangeEvent) => {
    const newCurrency = event.target.value as string;
    dispatch(setCurrency(newCurrency));

    setSuccessMessage(intl.formatMessage({
      id: 'settings.currencyUpdated',
      defaultMessage: '货币已更新为 {currency}'
    }, { currency: newCurrency }));
    setSnackbarOpen(true);

    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // 处理Snackbar关闭
  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
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
    <div className='absolute top-[65px] h-[calc(100vh-65px)] overflow-y-scroll left-0 right-0 bottom-0 flex text-left flex-col md:flex-row justify-start'>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleSnackbarClose} 
          severity={errorMessage ? "error" : "success"}
          sx={{ width: '100%' }}
        >
          {errorMessage || successMessage}
        </Alert>
      </Snackbar>

      <div className='flex flex-col text-left min-w-[300px] border-r border-b border-gray-200 dark:border-gray-800'>
        {
          user.role !== UserRole.Guest && <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.Profile ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.Profile)}>
            <FormattedMessage id="settings.profile" defaultMessage="Profile" />
            <Typography variant='body2' color='text.secondary'>
              <FormattedMessage id="settings.profileDescription" defaultMessage="Manage your profile here." />
            </Typography>
          </div>
        }
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
            currentPage === Page.Profile && (<>
              <div className='text-2xl font-bold'>
                <FormattedMessage id="settings.profile" defaultMessage="Profile" />
              </div>
              {
                loading ? (<h1 className="flex flex-col items-center gap-4 px-8">
                  <Skeleton variant="text" width="100%" height={40} />
                  <Skeleton variant="text" width="100%" height={40} />
                  <Skeleton variant="text" width="100%" height={40} />
                  <Skeleton variant="text" width="100%" height={40} />
                </h1>) : (<>
                  <Alert severity="info">
                    <FormattedMessage id="settings.stillDeveloping" defaultMessage="The account system is still under development, you may not be able to sync your settings across devices yet." />
                  </Alert>
                  <div className='flex flex-row items-center gap-2 justify-between'>
                    <div>
                      <FormattedMessage id="settings.avatar" defaultMessage="Avatar" />
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage id="settings.avatarDescription" defaultMessage="The avatar you want to display to others." />
                      </Typography>
                    </div>
                    <Avatar
                      src={profileData?.avatar || ''}
                      sx={{ width: '40px', height: '40px' }}
                    />
                  </div>
                  <div className='flex flex-row items-center gap-2 justify-between'>
                    <div>
                      <FormattedMessage id="settings.displayName" defaultMessage="Display Name" />
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage id="settings.displayNameDescription" defaultMessage="The name you want to display to others." />
                      </Typography>
                    </div>
                    <Input
                      value={profileData?.name}
                      onChange={(e) => {
                        setProfileData(prev => ({
                          ...prev,
                          name: e.target.value
                        }));
                      }}
                      sx={{ width: '250px' }}
                      size='small'
                    />
                  </div>
                  <div className='flex flex-row items-center gap-2 justify-between'>
                    <div>
                      <FormattedMessage id="settings.email" defaultMessage="Email" />
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage id="settings.emailDescription" defaultMessage="Your email address." />
                      </Typography>
                    </div>
                    <Input
                      value={profileData?.email}
                      disabled
                      sx={{ width: '250px' }}
                      size='small'
                    />
                  </div>
                  <div className='flex flex-row items-center gap-2 justify-between'>
                    <div>
                      <FormattedMessage id="settings.description" defaultMessage="Description" />
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage id="settings.descriptionDescription" defaultMessage="A short description about yourself." />
                      </Typography>
                    </div>
                    <Input
                      value={profileData?.description}
                      multiline
                      
                      rows={5}
                      onChange={(e) => {
                        setProfileData(prev => ({
                          ...prev,
                          description: e.target.value
                        }));
                      }}
                      sx={{ width: '250px' }}
                      size='small'
                    />
                  </div>
                  <div className='flex flex-row items-center gap-2 justify-between'>
                    <div>
                      <FormattedMessage id="settings.contacts" defaultMessage="Contacts" />
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage id="settings.contactsDescription" defaultMessage="Your contacts." />
                      </Typography>
                    </div>
                    <Input
                      value={profileData?.contacts}
                      disabled
                      sx={{ width: '250px' }}
                      size='small'
                    />
                  </div>

                  <Button 
                    variant="contained" 
                    color="primary" 
                    disabled={isSubmitting}
                    onClick={() => {
                      setIsSubmitting(true);
                      fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/user/profile`, {
                        method: 'PUT',
                        body: JSON.stringify(profileData),
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${user.token}`
                        }
                      })
                      .then(res => {
                        if (!res.ok) {
                          throw new Error('保存失败');
                        }
                        return res.json();
                      })
                      .then(() => {
                        setSuccessMessage(intl.formatMessage({
                          id: 'settings.profileSaved',
                          defaultMessage: '个人资料保存成功'
                        }));
                        setSnackbarOpen(true);
                      })
                      .catch(err => {
                        setErrorMessage(intl.formatMessage({
                          id: 'settings.profileSaveFailed',
                          defaultMessage: '个人资料保存失败'
                        }));
                        setSnackbarOpen(true);
                        console.error(err);
                      })
                      .finally(() => {
                        setIsSubmitting(false);
                      });
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <CircularProgress size={24} color="inherit" sx={{ mr: 1 }} />
                        <FormattedMessage id="settings.saving" defaultMessage="Saving..." />
                      </>
                    ) : (
                      <FormattedMessage id="settings.save" defaultMessage="Save" />
                    )}
                  </Button>
                </>)
              }
              <Divider sx={{ my: 2 }} />
            <div>
              <Typography variant="h6">
                <FormattedMessage id="settings.deleteAccount" defaultMessage="Delete Account" />
              </Typography>
              <Typography variant="body2" color='text.secondary' sx={{ mb: 2 }}>
                <FormattedMessage id="settings.deleteAccountDescription" defaultMessage="Deleting your account will permanently remove all data associated with your account. This action cannot be undone." />
              </Typography>
              <Button 
                variant="contained" 
                color="error"
                fullWidth
                onClick={() => {
                  if (window.confirm(intl.formatMessage({
                    id: 'settings.deleteAccountConfirm',
                    defaultMessage: 'Are you sure you want to delete your account? This action cannot be undone, and all data associated with your account will be permanently deleted.'
                  }))) {
                    setIsSubmitting(true);
                    fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/user/account`, {
                      method: 'DELETE',
                      headers: {
                        'Authorization': `Bearer ${user.token}`
                      }
                    })
                    .then(res => {
                      if (!res.ok) {
                        throw new Error('Delete account failed');
                      }
                      localStorage.clear();
                      window.location.href = '/';
                    })
                    .catch(err => {
                      setErrorMessage(intl.formatMessage({
                        id: 'settings.deleteAccountFailed',
                        defaultMessage: 'Delete account failed'
                      }));
                      setSnackbarOpen(true);
                      console.error(err);
                    })
                    .finally(() => {
                      setIsSubmitting(false);
                    });
                  }
                }}
              >
                <FormattedMessage id="settings.deleteAccount" defaultMessage="Delete Account" />
              </Button>
            </div>
            </>)
          }
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

                <Divider sx={{ my: 2 }} />

                <div>
                  <Typography variant="h6">
                    <FormattedMessage id="settings.ccuPriority" defaultMessage="CCU Source Priority" />
                  </Typography>
                  <Typography variant="body2" color='text.secondary' sx={{ mb: 2 }}>
                    <FormattedMessage id="settings.ccuPriorityDescription" defaultMessage="Set the priority order of CCUs' sources. Types with higher priority will be considered first for upgrade paths." />
                  </Typography>
                  <CcuPriorityList />
                </div>
              </>
            )}

          {
            currentPage === Page.LocalData && (
              <div className='flex flex-col gap-4'>
                <div className='text-2xl font-bold flex flex-row items-center gap-2 justify-between'>
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
