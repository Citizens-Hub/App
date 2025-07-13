import { useParams } from "react-router";
import { useState, useEffect } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  Box,
  Typography,
  Alert,
  CircularProgress,
  Container,
  Button,
  Snackbar,
  useTheme,
  Stack,
  Avatar,
  alpha,
  Card,
} from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { setImportItems, clearAllImportData } from "../../store/importStore";
import { RootState } from "../../store";
import { Ship } from "../../types";
import { useSharedData, useShipsData } from "../../hooks";

// Items displayed per page
const ITEMS_PER_PAGE = 6;

// TypeScript interface definitions
interface ProfileType {
  name: string | null;
  avatar?: string | null;
  sharedHangar: string | null;
}

interface StatisticsType {
  totalCCUs: number;
  totalValue: number;
}

interface ShipItemType {
  from: string | number;
  fromName?: string;
  to: string | number;
  toName?: string;
  price: number;
  name?: string;
}

const ProfileHeader = ({ profile }: { profile: ProfileType }) => {
  const theme = useTheme();

  return (
    <div className="mb-8 flex items-center">
      <Stack direction="row" spacing={3} alignItems="center">
        <Avatar
          src={profile?.avatar || ""}
          sx={{
            width: 80,
            height: 80,
            border: `3px solid ${theme.palette.primary.main}`,
            boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.3)}`
          }}
        />
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
          </Typography>
        </Box>
      </Stack>
      <span className="text-gray-500 dark:text-gray-400 flex flex-col items-start">
        <span className="text-4xl font-bold text-black dark:text-white">
          {profile?.name || "Unknown User"}
        </span>
        <FormattedMessage id="share.userHangar" defaultMessage="User's Shared Hangar" />
      </span>
    </div>
  );
};

// Statistics component
const Statistics = ({ statistics, currency }: { statistics: StatisticsType; currency: string }) => {
  const intl = useIntl();
  const locale = intl.locale;

  return (
    <div className="mb-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
            {statistics?.totalCCUs.toLocaleString()}
          </span>
          <span className="text-gray-700 dark:text-gray-300">
            <FormattedMessage id="share.totalCCUs" defaultMessage="Total CCU Count" />
          </span>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-6 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-2">
            {statistics?.totalValue.toLocaleString(locale, {
              style: 'currency',
              currency
            })}
          </span>
          <span className="text-gray-700 dark:text-gray-300">
            <FormattedMessage id="share.totalValue" defaultMessage="Total Value" />
          </span>
        </div>
      </div>
    </div>
  );
};

// Ships list component
const ShipsList = ({ items, getShipImageById, currency, getShipById, totalItems }: {
  items: ShipItemType[];
  getShipImageById: (id: number) => string | undefined;
  currency: string;
  getShipById: (id: number) => Ship | undefined;
  totalItems: number;
}) => {
  const intl = useIntl();
  const locale = intl.locale;

  return (
    <div className="mb-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item, index) => {
          // Get original price (if available)
          const fromShip = getShipById(Number(item.from));
          const toShip = getShipById(Number(item.to));
          const msrpDiff = toShip && fromShip ?
            ((toShip.msrp - fromShip.msrp) / 100) : null;

          return (
            <div
              key={index}
              className="relative border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm bg-white dark:bg-gray-800 overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer"
            >
              {item.price > 0 && (
                <div className="absolute top-0 right-0 bg-purple-600 text-white text-sm font-bold py-1 px-3 rounded-bl z-10">
                  <span className="text-white/70 line-through mr-2 font-medium">
                    {msrpDiff && msrpDiff.toLocaleString(locale, {
                      style: 'currency',
                      currency: 'USD'
                    })}
                  </span>
                  <span className="text-white">
                    {item.price.toLocaleString(locale, {
                      style: 'currency',
                      currency
                    })}
                  </span>
                </div>
              )}

              <div className="relative w-full h-48 overflow-hidden">
                <div className="absolute left-0 top-0 w-[35%] h-full">
                  <img
                    src={getShipImageById(Number(item.from))}
                    alt="From Ship"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="absolute right-0 top-0 w-[65%] h-full shadow-[-8px_0px_12px_-6px_rgba(0,0,0,0.3)]">
                  <img
                    src={getShipImageById(Number(item.to))}
                    alt="To Ship"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="absolute top-1/2 left-[35%] -translate-y-1/2 -translate-x-1/2 text-white z-10">
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 17L18 12L13 7M6 17L11 12L6 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center justify-center">
                  <span className="text-white text-sm truncate max-w-full">
                    {item.name}
                  </span>
                </div>
              </div>

              <div className="p-3 flex justify-between items-center text-sm">
                <div className="text-gray-600 dark:text-gray-400">
                  {fromShip?.name} → {toShip?.name}
                </div>
              </div>

              {
                totalItems > ITEMS_PER_PAGE && index === ITEMS_PER_PAGE - 1 && (
                  <div className="absolute z-10 bottom-0 left-0 right-0 p-2 w-full h-full bg-gray-600/30 backdrop-blur-sm grayscale-30 rounded-md flex items-center justify-center">
                    <span className="text-white text-sm truncate max-w-full">
                      + {totalItems - ITEMS_PER_PAGE} more
                    </span>
                  </div>
                )
              }
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Main component
export default function Share() {
  const { userId } = useParams();
  const intl = useIntl();
  const dispatch = useDispatch();
  const importState = useSelector((state: RootState) => state.import);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [prevPath, setPrevPath] = useState<string | null>(null);

  // Get shared data
  const { profile, hangarData, loading: loadingShareData, error: shareError } = useSharedData(userId || "");

  // Get ships data
  const {
    loading: loadingShipsData,
    error: shipsError,
    getShipImageById,
    getShipById,
  } = useShipsData();

  // Check if already imported and if update is needed
  const imported = importState.userId === userId;
  const needsUpdate = imported && importState.sharedHangarPath !== profile?.sharedHangar;

  const currentItems = hangarData ?
    hangarData.items.slice(0, ITEMS_PER_PAGE) :
    [];

  // Detect automatic updates
  useEffect(() => {
    if (imported && prevPath && prevPath !== importState.sharedHangarPath) {
      // Path changed but still shows as imported, indicating an automatic update
      setSuccessMessage(intl.formatMessage({ id: "share.autoUpdated" }));
    }

    setPrevPath(importState.sharedHangarPath);
  }, [importState.sharedHangarPath, prevPath, imported, intl]);

  // Import the entire shared hangar
  const handleImport = () => {
    if (hangarData && userId && profile?.sharedHangar) {
      // Save data to Redux, including user ID and shared hangar path
      dispatch(setImportItems({
        items: hangarData.items,
        currency: hangarData.currency,
        userId: userId,
        sharedHangarPath: profile.sharedHangar
      }));

      // Show success message
      setSuccessMessage(
        intl.formatMessage(
          needsUpdate ? { id: "share.successUpdate" } : { id: "share.successImportAll" }
        )
      );
    }
  };

  // 取消订阅，清空importStore
  const handleUnsubscribe = () => {
    // 清空Redux中的所有导入数据
    dispatch(clearAllImportData());

    // 显示成功消息
    setSuccessMessage(
      intl.formatMessage({ id: "share.successUnsubscribe", defaultMessage: "Successfully unsubscribed" })
    );
  };

  // Calculate statistics
  const statistics = hangarData ? {
    totalCCUs: hangarData.items.length,
    totalValue: hangarData.items.reduce((sum, item) => sum + item.price, 0)
  } : null;

  // Loading state
  const isLoading = loadingShareData || loadingShipsData;

  // Error state
  const error = shareError || shipsError;

  // If loading, show loading indicator
  if (isLoading) {
    return (
      <Box className="w-full min-h-[calc(100vh-65px)] pt-[65px]">
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            <CircularProgress size={60} thickness={4} />
            <Typography variant="h6" sx={{ ml: 3 }}>
              <FormattedMessage id="share.loading" defaultMessage="Loading shared data..." />
            </Typography>
          </Box>
        </Container>
      </Box>
    );
  }

  // If there's an error, show error message
  if (error) {
    return (
      <Box className="w-full min-h-[calc(100vh-65px)] pt-[65px]">
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Alert severity="error" sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6">
              <FormattedMessage id="share.errorTitle" defaultMessage="Loading Failed" />
            </Typography>
            <Typography variant="body1" sx={{ mt: 1 }}>
              <FormattedMessage id="share.error" defaultMessage="Error message" />: {error}
            </Typography>
          </Alert>
        </Container>
      </Box>
    );
  }

  // If no userId is provided, show message
  if (!userId) {
    return (
      <Box className="w-full min-h-[calc(100vh-65px)] pt-[65px]">
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Alert severity="warning" sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6">
              <FormattedMessage id="share.noUserIdTitle" defaultMessage="No User ID Provided" />
            </Typography>
            <Typography variant="body1" sx={{ mt: 1 }}>
              <FormattedMessage id="share.noUserId" defaultMessage="Please provide a valid user ID to view shared hangar" />
            </Typography>
          </Alert>
        </Container>
      </Box>
    );
  }

  return (
    <div className="w-screen h-[calc(100vh-65px)] mt-[65px] overflow-y-auto">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Card className="p-6 md:p-8 backdrop-blur-sm sm:mt-12" sx={{
          boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.1)'
        }}>
          {profile && <ProfileHeader profile={profile} />}

          <hr className="my-6 border-gray-200 dark:border-gray-700" />

          {statistics && (
            <Statistics
              statistics={statistics}
              currency={hangarData?.currency || 'USD'}
            />
          )}

          <hr className="my-6 border-gray-200 dark:border-gray-700" />

          {currentItems.length > 0 && (
            <ShipsList
              items={currentItems}
              getShipImageById={getShipImageById}
              currency={hangarData?.currency || 'USD'}
              getShipById={getShipById}
              totalItems={hangarData?.items.length || 0}
            />
          )}

          <hr className="my-6 border-gray-200 dark:border-gray-700" />

          <div className="pt-2">
            {imported && !needsUpdate ? (
              <Stack direction="row" spacing={2}>
                <Button
                  onClick={handleUnsubscribe}
                  fullWidth
                  variant="outlined"
                  color="error"
                >
                  <FormattedMessage id="share.unsubscribe" defaultMessage="Unsubscribe" />
                </Button>
              </Stack>
            ) : (
              <Button
                onClick={handleImport}
                fullWidth
                variant="contained"
                color="primary"
              >
                {needsUpdate ?
                  <FormattedMessage id="share.updateHangar" defaultMessage="Update Hangar" /> :
                  <FormattedMessage id="share.importHangar" defaultMessage="Subscribe" />
                }
              </Button>
            )}
          </div>
        </Card>

        <Snackbar
          open={!!successMessage}
          autoHideDuration={6000}
          onClose={() => setSuccessMessage(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSuccessMessage(null)}
            severity={successMessage?.includes("error") ? "error" : "success"}
            sx={{ width: '100%' }}
          >
            {successMessage}
          </Alert>
        </Snackbar>
      </div>
    </div>
  );
}