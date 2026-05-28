import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState, } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router';
import { clearUpgrades, setCurrency, setHangarSyncPreferences } from '@/store/upgradesStore';
import { clearAllImportData } from '@/store/importStore';
import { login } from '@/store/userStore';
import { RootState } from '@/store';
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
  Slider,
  Switch,
  FormControlLabel,
  Chip,
  TextField,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { ProfileData, UserRole } from '@/types';
import CcuPriorityList from './components/CcuPriorityList';
import { useAuthApi, useProfileData } from '@/hooks';
import { Camera, Move } from 'lucide-react';
import ResponsiveSectionLayout, { type ResponsiveSectionLayoutItem } from '@/components/ResponsiveSectionLayout';
import {
  clearShipImageCacheEntries,
  clearModelCacheEntries,
  formatModelCacheSize,
  listShipImageCacheEntries,
  listModelCacheEntries,
  type ModelCacheEntrySummary,
  type ModelCacheListResult,
  type ModelCacheType,
  type ShipImageCacheEntrySummary,
  type ShipImageCacheListResult,
  type ShipImageCacheSource,
} from '@/utils/modelCache';

const CURRENCIES = ['USD', 'EUR', 'CNY', 'GBP', 'JPY'];
const AVATAR_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_CROP_OUTPUT_SIZE = 512;
const DEFAULT_AVATAR_CROP_PREVIEW_SIZE = 320;

enum Page {
  Preferences = 'preferences',
  LocalData = 'localData',
  Profile = 'profile',
}

type McpTokenItem = {
  id: string;
  name: string;
  tokenPreview: string;
  lastUsedAt: string | null;
  createdAt: string;
};

type McpTokenListResponse = {
  success?: boolean;
  tokens?: McpTokenItem[];
  message?: string;
};

type CreateMcpTokenResponse = {
  success?: boolean;
  token?: McpTokenItem;
  plainTextToken?: string;
  message?: string;
};

type AvatarCropSource = {
  file: File;
  url: string;
  width: number;
  height: number;
};

type CropOffset = {
  x: number;
  y: number;
};

type RsiBindingStatusResponse = {
  success?: boolean;
  data?: {
    bound: boolean;
    pending: boolean;
    locked: boolean;
    code: string | null;
    pendingHandle: string | null;
    pendingGeneratedAt: string | null;
    profileUrl: string | null;
    profileEditUrl: string | null;
    citizen: {
      handle: string | null;
      displayName: string | null;
      avatar: string | null;
      bio: string | null;
      website: string | null;
      enlisted: string | null;
      verifiedAt: string | null;
    };
  };
};

function resolveLocalizedMessage(
  intl: ReturnType<typeof useIntl>,
  message: string | null | undefined,
  fallback: { id: string; defaultMessage: string },
): string {
  if (message?.startsWith('message.') || message?.startsWith('settings.') || message?.startsWith('tickets.')) {
    return intl.formatMessage({ id: message, defaultMessage: fallback.defaultMessage });
  }

  if (message) {
    return message;
  }

  return intl.formatMessage(fallback);
}

const EMPTY_MODEL_CACHE_SUMMARY: ModelCacheListResult = {
  supported: true,
  entries: [],
  totalBytes: 0,
  bytesByType: {
    glb: 0,
    sog: 0,
  },
  countsByType: {
    glb: 0,
    sog: 0,
  },
};

const EMPTY_SHIP_IMAGE_CACHE_SUMMARY: ShipImageCacheListResult = {
  supported: true,
  entries: [],
  totalBytes: 0,
  bytesBySource: {
    app: 0,
    worker: 0,
    workerShipImage: 0,
    r2: 0,
    unknown: 0,
  },
  countsBySource: {
    app: 0,
    worker: 0,
    workerShipImage: 0,
    r2: 0,
    unknown: 0,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getAvatarCropMetrics(source: AvatarCropSource, previewSize: number, zoom: number) {
  const safePreviewSize = Math.max(previewSize, 1);
  const safeZoom = Math.max(zoom, 1);
  const baseScale = Math.max(safePreviewSize / source.width, safePreviewSize / source.height);
  const scale = baseScale * safeZoom;
  const displayWidth = source.width * scale;
  const displayHeight = source.height * scale;

  return {
    scale,
    displayWidth,
    displayHeight,
    maxOffsetX: Math.max(0, (displayWidth - safePreviewSize) / 2),
    maxOffsetY: Math.max(0, (displayHeight - safePreviewSize) / 2),
  };
}

function clampCropOffset(source: AvatarCropSource, previewSize: number, zoom: number, offset: CropOffset): CropOffset {
  const metrics = getAvatarCropMetrics(source, previewSize, zoom);
  return {
    x: clamp(offset.x, -metrics.maxOffsetX, metrics.maxOffsetX),
    y: clamp(offset.y, -metrics.maxOffsetY, metrics.maxOffsetY),
  };
}

function getAvatarOutputType(file: File) {
  if (file.type === 'image/png' || file.type === 'image/webp') {
    return file.type;
  }

  return 'image/jpeg';
}

function getAvatarOutputName(file: File, mimeType: string) {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'avatar';
  return `${baseName}-avatar.${extension}`;
}

export default function Settings() {
  const intl = useIntl();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const apiBaseUrl = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const avatarCropFrameRef = useRef<HTMLDivElement | null>(null);
  const avatarCropImageRef = useRef<HTMLImageElement | null>(null);
  const avatarCropDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const users = useSelector((state: RootState) => state.upgrades.users);
  const { user } = useSelector((state: RootState) => state.user);
  const isAdmin = user.role === UserRole.Admin;

  const { profile, loading } = useProfileData(user.id);
  const { data: rsiBindingResponse, mutate: mutateRsiBinding } = useAuthApi<RsiBindingStatusResponse>(
    user.token ? '/api/user/rsi-binding' : null
  );

  const [profileData, setProfileData] = useState<ProfileData>({
    name: null,
    avatar: null,
    description: null,
    contacts: null,
    homepage: null,
    sharedHangar: null,
    marketingEmailConsent: null,
    marketingEmailConsentRegion: null,
    marketingEmailConsentSource: null,
    marketingEmailConsentAt: null,
    adsAudienceConsent: false,
    adsConsentRegion: null,
    adsConsentAt: null,
    rsiHandle: null,
    rsiDisplayName: null,
    rsiAvatar: null,
    rsiBio: null,
    rsiWebsite: null,
    rsiEnlisted: null,
    rsiVerifiedAt: null,

    // immutable
    email: null,
    emailVerified: false,
  });

  useEffect(() => {
    if (profile) {
      setProfileData(profile);
    }
  }, [profile]);

  const rsiBinding = rsiBindingResponse?.data;

  useEffect(() => {
    if (rsiBinding?.pendingHandle) {
      setRsiHandleInput(rsiBinding.pendingHandle);
      return;
    }

    if (rsiBinding?.citizen.handle) {
      setRsiHandleInput(rsiBinding.citizen.handle);
    }
  }, [rsiBinding?.citizen.handle, rsiBinding?.pendingHandle]);

  const [currentPage, setCurrentPage] = useState<Page>(user.role === UserRole.Guest ? Page.Preferences : Page.Profile);
  const { currency } = useSelector((state: RootState) => state.upgrades);
  const {
    syncPreferences,
    syncStatus,
    syncError,
    remoteHangarUpdatedAt,
    lastSyncedAt,
  } = useSelector((state: RootState) => state.upgrades);
  const [clearAllDataDialog, setClearAllDataDialog] = useState(false);
  const [clearUserDataDialog, setClearUserDataDialog] = useState(false);
  const [selectedUserToClear, setSelectedUserToClear] = useState<number>(-1);
  
  // 新增状态
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [clearImportDialog, setClearImportDialog] = useState(false);
  const [mcpTokens, setMcpTokens] = useState<McpTokenItem[]>([]);
  const [mcpTokenName, setMcpTokenName] = useState('');
  const [isLoadingMcpTokens, setIsLoadingMcpTokens] = useState(false);
  const [isCreatingMcpToken, setIsCreatingMcpToken] = useState(false);
  const [mcpTokenActionId, setMcpTokenActionId] = useState<string | null>(null);
  const [newMcpToken, setNewMcpToken] = useState<string | null>(null);
  const [newMcpTokenDialogOpen, setNewMcpTokenDialogOpen] = useState(false);
  const [avatarCropSource, setAvatarCropSource] = useState<AvatarCropSource | null>(null);
  const [avatarCropZoom, setAvatarCropZoom] = useState(1);
  const [avatarCropOffset, setAvatarCropOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [avatarCropPreviewSize, setAvatarCropPreviewSize] = useState(DEFAULT_AVATAR_CROP_PREVIEW_SIZE);
  const [isAvatarCropDragging, setIsAvatarCropDragging] = useState(false);
  const [rsiHandleInput, setRsiHandleInput] = useState('');
  const [isStartingRsiBinding, setIsStartingRsiBinding] = useState(false);
  const [isConfirmingRsiBinding, setIsConfirmingRsiBinding] = useState(false);
  const [modelCacheSummary, setModelCacheSummary] = useState<ModelCacheListResult>(EMPTY_MODEL_CACHE_SUMMARY);
  const [isLoadingModelCache, setIsLoadingModelCache] = useState(false);
  const [modelCacheActionKey, setModelCacheActionKey] = useState<string | null>(null);
  const [shipImageCacheSummary, setShipImageCacheSummary] = useState<ShipImageCacheListResult>(EMPTY_SHIP_IMAGE_CACHE_SUMMARY);
  const [isLoadingShipImageCache, setIsLoadingShipImageCache] = useState(false);
  const [shipImageCacheActionKey, setShipImageCacheActionKey] = useState<string | null>(null);
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [isSendingEmailVerificationCode, setIsSendingEmailVerificationCode] = useState(false);
  const [isVerifyingEmailCode, setIsVerifyingEmailCode] = useState(false);
  const autoSendEmailVerificationCodeRef = useRef(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const avatarCropMetrics = avatarCropSource
    ? getAvatarCropMetrics(avatarCropSource, avatarCropPreviewSize, avatarCropZoom)
    : null;
  const avatarCropImageLeft = avatarCropMetrics
    ? (avatarCropPreviewSize - avatarCropMetrics.displayWidth) / 2 + avatarCropOffset.x
    : 0;
  const avatarCropImageTop = avatarCropMetrics
    ? (avatarCropPreviewSize - avatarCropMetrics.displayHeight) / 2 + avatarCropOffset.y
    : 0;

  useEffect(() => {
    if (searchParams.get('verifyEmail') === '1') {
      setCurrentPage(Page.Profile);
    }
  }, [searchParams]);

  const loadMcpTokens = async () => {
    if (!user.token || !isAdmin) {
      setMcpTokens([]);
      return;
    }

    setIsLoadingMcpTokens(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/user/mcp-tokens`, {
        headers: {
          'Authorization': `Bearer ${user.token}`,
        },
      });

      const result = await response.json().catch(() => null) as McpTokenListResponse | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Failed to load MCP tokens');
      }

      setMcpTokens(result.tokens || []);
    } catch (error) {
      console.error(error);
      setErrorMessage(intl.formatMessage({
        id: 'settings.mcpTokensLoadFailed',
        defaultMessage: 'Failed to load MCP tokens'
      }));
      setSnackbarOpen(true);
    } finally {
      setIsLoadingMcpTokens(false);
    }
  };

  useEffect(() => {
    void loadMcpTokens();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl, isAdmin, user.id, user.role, user.token]);

  useEffect(() => {
    if (!avatarCropSource) {
      return;
    }

    return () => {
      URL.revokeObjectURL(avatarCropSource.url);
    };
  }, [avatarCropSource]);

  useEffect(() => {
    const frame = avatarCropFrameRef.current;
    if (!frame || !avatarCropSource) {
      return;
    }

    const updatePreviewSize = () => {
      setAvatarCropPreviewSize(frame.clientWidth || DEFAULT_AVATAR_CROP_PREVIEW_SIZE);
    };

    updatePreviewSize();
    const observer = new ResizeObserver(updatePreviewSize);
    observer.observe(frame);
    window.addEventListener('resize', updatePreviewSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePreviewSize);
    };
  }, [avatarCropSource]);

  useEffect(() => {
    if (!avatarCropSource) {
      return;
    }

    setAvatarCropOffset((prev) => clampCropOffset(avatarCropSource, avatarCropPreviewSize, avatarCropZoom, prev));
  }, [avatarCropPreviewSize, avatarCropSource, avatarCropZoom]);

  useEffect(() => {
    if (currentPage !== Page.LocalData) {
      return;
    }

    void refreshModelCacheSummary();
    void refreshShipImageCacheSummary();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

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

  const handleHangarSyncToggle = (event: ChangeEvent<HTMLInputElement>) => {
    dispatch(setHangarSyncPreferences({
      hangar: event.target.checked,
    }));

    showSuccessMessage(intl.formatMessage({
      id: event.target.checked ? 'settings.syncHangarEnabled' : 'settings.syncHangarDisabled',
      defaultMessage: event.target.checked ? 'Hangar sync enabled.' : 'Hangar sync disabled.',
    }));
  };

  const getHangarSyncStatusLabel = () => {
    switch (syncStatus) {
      case 'bootstrapping':
        return intl.formatMessage({ id: 'settings.syncStatusBootstrapping', defaultMessage: 'Bootstrapping' });
      case 'syncing':
        return intl.formatMessage({ id: 'settings.syncStatusSyncing', defaultMessage: 'Syncing' });
      case 'conflict':
        return intl.formatMessage({ id: 'settings.syncStatusConflict', defaultMessage: 'Conflict' });
      case 'error':
        return intl.formatMessage({ id: 'settings.syncStatusError', defaultMessage: 'Error' });
      default:
        return intl.formatMessage({ id: 'settings.syncStatusIdle', defaultMessage: 'Idle' });
    }
  };

  // 处理Snackbar关闭
  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  const validatePassword = (value: string) => value.length >= 6 && !/^\d+$/.test(value);

  const handleSendEmailVerificationCode = async () => {
    setIsSendingEmailVerificationCode(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user.token}`,
        },
      });

      const result = await response.json().catch(() => null) as {
        success?: boolean;
        message?: string;
        expiresInMinutes?: number;
      } | null;

      if (!response.ok || !result?.success) {
        throw new Error(resolveLocalizedMessage(
          intl,
          result?.message,
          {
            id: 'settings.verificationEmailFailed',
            defaultMessage: 'Failed to send verification code.'
          },
        ));
      }

      showSuccessMessage(intl.formatMessage(
        {
          id: 'settings.verificationCodeSent',
          defaultMessage: 'Verification code sent. It expires in {minutes} minutes.',
        },
        { minutes: result.expiresInMinutes || 15 },
      ));
    } catch (error) {
      console.error(error);
      showErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : intl.formatMessage({
              id: 'settings.verificationEmailFailed',
              defaultMessage: 'Failed to send verification code.'
            })
      );
    } finally {
      setIsSendingEmailVerificationCode(false);
    }
  };

  useEffect(() => {
    if (
      searchParams.get('verifyEmail') !== '1'
      || autoSendEmailVerificationCodeRef.current
      || !user.token
      || loading
      || profileData.emailVerified
    ) {
      return;
    }

    autoSendEmailVerificationCodeRef.current = true;
    void handleSendEmailVerificationCode();
    setSearchParams((next) => {
      next.delete('verifyEmail');
      return next;
    }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profileData.emailVerified, searchParams, setSearchParams, user.token]);

  const handleVerifyEmailCode = async () => {
    setIsVerifyingEmailCode(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          code: emailVerificationCode,
        }),
      });

      const result = await response.json().catch(() => null) as {
        success?: boolean;
        message?: string;
        user?: {
          emailVerified?: boolean;
        };
      } | null;

      if (!response.ok || !result?.success) {
        throw new Error(resolveLocalizedMessage(
          intl,
          result?.message,
          {
            id: 'settings.emailVerificationFailed',
            defaultMessage: 'Failed to verify email.'
          },
        ));
      }

      setProfileData((prev) => ({
        ...prev,
        emailVerified: true,
      }));
      dispatch(login({
        ...user,
        emailVerified: true,
      }));
      setEmailVerificationCode('');
      showSuccessMessage(intl.formatMessage({
        id: 'settings.emailVerified',
        defaultMessage: 'Email verified successfully.'
      }));
    } catch (error) {
      console.error(error);
      showErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : intl.formatMessage({
              id: 'settings.emailVerificationFailed',
              defaultMessage: 'Failed to verify email.'
            })
      );
    } finally {
      setIsVerifyingEmailCode(false);
    }
  };

  const handleChangePassword = async () => {
    if (!validatePassword(newPassword)) {
      showErrorMessage(intl.formatMessage({
        id: 'login.passwordStrengthError',
        defaultMessage: 'Password must be at least 6 characters and not all numbers'
      }));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      showErrorMessage(intl.formatMessage({
        id: 'login.passwordsNotMatch',
        defaultMessage: 'Passwords do not match'
      }));
      return;
    }

    setIsChangingPassword(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/password/change`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const result = await response.json().catch(() => null) as {
        success?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !result?.success) {
        throw new Error(resolveLocalizedMessage(
          intl,
          result?.message,
          {
            id: 'settings.passwordChangeFailed',
            defaultMessage: 'Failed to change password.'
          },
        ));
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      showSuccessMessage(resolveLocalizedMessage(
        intl,
        result.message,
        {
          id: 'settings.passwordChanged',
          defaultMessage: 'Password changed successfully.'
        },
      ));
    } catch (error) {
      console.error(error);
      showErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : intl.formatMessage({
              id: 'settings.passwordChangeFailed',
              defaultMessage: 'Failed to change password.'
            })
      );
    } finally {
      setIsChangingPassword(false);
    }
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
        defaultMessage: 'User data has been cleared.'
      }));

      setTimeout(() => setSuccessMessage(null), 3000);
    }
    setClearUserDataDialog(false);
  };

  const handleClearImportData = () => {
    dispatch(clearAllImportData());
    
    setSuccessMessage(intl.formatMessage({
      id: 'settings.importDataCleared',
      defaultMessage: 'Clear all imported hangar data.'
    }));
    setSnackbarOpen(true);
    
    setClearImportDialog(false);
  };

  const buildProfileUpdatePayload = () => {
    const marketingEmailConsent = profileData.marketingEmailConsent;
    const payload: Partial<ProfileData> = {
      name: profileData.name,
      avatar: profileData.avatar,
      description: profileData.description,
      contacts: profileData.contacts,
      homepage: profileData.homepage,
      sharedHangar: profileData.sharedHangar,
      marketingEmailConsent: profileData.marketingEmailConsent,
      marketingEmailConsentRegion: profileData.marketingEmailConsentRegion,
      adsAudienceConsent: profileData.adsAudienceConsent,
      adsConsentRegion: profileData.adsConsentRegion || Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    };

    if (marketingEmailConsent === null || marketingEmailConsent === undefined) {
      delete payload.marketingEmailConsent;
      delete payload.marketingEmailConsentRegion;
      return payload;
    }

    payload.marketingEmailConsentRegion = profileData.marketingEmailConsentRegion
      || Intl.DateTimeFormat().resolvedOptions().timeZone
      || null;
    return payload;
  };

  const handleSaveProfile = async () => {
    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/user/profile`, {
        method: 'PUT',
        body: JSON.stringify(buildProfileUpdatePayload()),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (!response.ok) {
        throw new Error('保存失败');
      }

      await response.json();

      if (profileData.avatar) {
        dispatch(login({
          ...user,
          avatar: profileData.avatar,
        }));
      }

      if (profileData.marketingEmailConsent !== null && profileData.marketingEmailConsent !== undefined) {
        setProfileData((prev) => ({
          ...prev,
          marketingEmailConsentRegion: prev.marketingEmailConsentRegion || Intl.DateTimeFormat().resolvedOptions().timeZone || null,
          marketingEmailConsentSource: 'settings',
          marketingEmailConsentAt: new Date().toISOString(),
        }));
      }

      setErrorMessage(null);
      setSuccessMessage(intl.formatMessage({
        id: 'settings.profileSaved',
        defaultMessage: '个人资料保存成功'
      }));
      setSnackbarOpen(true);
    } catch (err) {
      setSuccessMessage(null);
      setErrorMessage(intl.formatMessage({
        id: 'settings.profileSaveFailed',
        defaultMessage: '个人资料保存失败'
      }));
      setSnackbarOpen(true);
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const showSuccessMessage = (message: string) => {
    setErrorMessage(null);
    setSuccessMessage(message);
    setSnackbarOpen(true);
  };

  const showErrorMessage = (message: string) => {
    setSuccessMessage(null);
    setErrorMessage(message);
    setSnackbarOpen(true);
  };

  const refreshModelCacheSummary = async () => {
    setIsLoadingModelCache(true);

    try {
      const summary = await listModelCacheEntries();
      setModelCacheSummary(summary);
    } catch (error) {
      console.error(error);
      showErrorMessage(intl.formatMessage({
        id: 'settings.modelCacheLoadFailed',
        defaultMessage: 'Failed to load model cache.'
      }));
    } finally {
      setIsLoadingModelCache(false);
    }
  };

  const refreshShipImageCacheSummary = async () => {
    setIsLoadingShipImageCache(true);

    try {
      const summary = await listShipImageCacheEntries();
      setShipImageCacheSummary(summary);
    } catch (error) {
      console.error(error);
      showErrorMessage(intl.formatMessage({
        id: 'settings.shipImageCacheLoadFailed',
        defaultMessage: 'Failed to load ship image cache.'
      }));
    } finally {
      setIsLoadingShipImageCache(false);
    }
  };

  const handleClearModelCache = async (scope: 'all' | ModelCacheType | ModelCacheEntrySummary, label: string) => {
    const confirmed = window.confirm(intl.formatMessage({
      id: 'settings.modelCacheClearConfirm',
      defaultMessage: 'Clear {label} model cache?'
    }, { label }));

    if (!confirmed) {
      return;
    }

    const actionKey = typeof scope === 'string' ? scope : scope.id;
    setModelCacheActionKey(actionKey);

    try {
      const result = typeof scope === 'string'
        ? await clearModelCacheEntries(scope === 'all' ? {} : { type: scope })
        : await clearModelCacheEntries({ id: scope.id });

      await refreshModelCacheSummary();
      showSuccessMessage(intl.formatMessage({
        id: 'settings.modelCacheCleared',
        defaultMessage: 'Cleared {count} cached model files.'
      }, { count: result.deletedCount }));
    } catch (error) {
      console.error(error);
      showErrorMessage(intl.formatMessage({
        id: 'settings.modelCacheClearFailed',
        defaultMessage: 'Failed to clear model cache.'
      }));
    } finally {
      setModelCacheActionKey(null);
    }
  };

  const getShipImageCacheSourceLabel = (source: ShipImageCacheSource) => {
    switch (source) {
      case 'workerShipImage':
        return intl.formatMessage({
          id: 'settings.shipImageCacheSourceWorkerShipImage',
          defaultMessage: 'Worker Ship Images'
        });
      case 'r2':
        return 'R2';
      case 'worker':
        return 'Worker';
      case 'app':
        return intl.formatMessage({
          id: 'settings.shipImageCacheSourceApp',
          defaultMessage: 'App Assets'
        });
      default:
        return intl.formatMessage({
          id: 'settings.shipImageCacheSourceUnknown',
          defaultMessage: 'Other'
        });
    }
  };

  const handleClearShipImageCache = async (
    scope: 'all' | ShipImageCacheSource | ShipImageCacheEntrySummary,
    label: string,
  ) => {
    const confirmed = window.confirm(intl.formatMessage({
      id: 'settings.shipImageCacheClearConfirm',
      defaultMessage: 'Clear {label} ship image cache?'
    }, { label }));

    if (!confirmed) {
      return;
    }

    const actionKey = typeof scope === 'string' ? scope : scope.id;
    setShipImageCacheActionKey(actionKey);

    try {
      const result = typeof scope === 'string'
        ? await clearShipImageCacheEntries(scope === 'all' ? {} : { source: scope })
        : await clearShipImageCacheEntries({ id: scope.id });

      await refreshShipImageCacheSummary();
      showSuccessMessage(intl.formatMessage({
        id: 'settings.shipImageCacheCleared',
        defaultMessage: 'Cleared {count} cached ship images.'
      }, { count: result.deletedCount }));
    } catch (error) {
      console.error(error);
      showErrorMessage(intl.formatMessage({
        id: 'settings.shipImageCacheClearFailed',
        defaultMessage: 'Failed to clear ship image cache.'
      }));
    } finally {
      setShipImageCacheActionKey(null);
    }
  };

  const uploadAvatarFile = async (file: File) => {
    setIsAvatarUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiBaseUrl}/api/user/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`
        },
        body: formData,
      });

      const result = await response.json().catch(() => null) as {
        success?: boolean;
        message?: string;
        avatar?: string;
        avatarUrl?: string;
      } | null;

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || intl.formatMessage({
          id: 'settings.avatarUploadFailed',
          defaultMessage: 'Avatar upload failed'
        }));
      }

      const nextAvatar = result.avatarUrl || result.avatar;
      if (!nextAvatar) {
        throw new Error(intl.formatMessage({
          id: 'settings.avatarUploadFailed',
          defaultMessage: 'Avatar upload failed'
        }));
      }

      setProfileData((prev) => ({
        ...prev,
        avatar: nextAvatar
      }));
      dispatch(login({
        ...user,
        avatar: nextAvatar,
      }));

      setErrorMessage(null);
      setSuccessMessage(intl.formatMessage({
        id: 'settings.avatarUploadSuccess',
        defaultMessage: 'Avatar uploaded successfully'
      }));
      setSnackbarOpen(true);
      return true;
    } catch (error) {
      console.error(error);
      setSuccessMessage(null);
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : intl.formatMessage({
              id: 'settings.avatarUploadFailed',
              defaultMessage: 'Avatar upload failed'
            })
      );
      setSnackbarOpen(true);
      return false;
    } finally {
      setIsAvatarUploading(false);
    }
  };

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
      setSuccessMessage(null);
      setErrorMessage(intl.formatMessage({
        id: 'settings.avatarFileTooLarge',
        defaultMessage: 'Image must be 5MB or smaller.'
      }));
      setSnackbarOpen(true);
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      setAvatarCropSource({
        file,
        url: imageUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      setAvatarCropZoom(1);
      setAvatarCropOffset({ x: 0, y: 0 });
      setAvatarCropPreviewSize(DEFAULT_AVATAR_CROP_PREVIEW_SIZE);
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      setSuccessMessage(null);
      setErrorMessage(intl.formatMessage({
        id: 'settings.avatarUploadFailed',
        defaultMessage: 'Avatar upload failed'
      }));
      setSnackbarOpen(true);
    };

    image.src = imageUrl;
  };

  const handleCloseAvatarCrop = () => {
    if (isAvatarUploading) {
      return;
    }

    setAvatarCropSource(null);
    setAvatarCropZoom(1);
    setAvatarCropOffset({ x: 0, y: 0 });
    avatarCropDragRef.current = null;
    setIsAvatarCropDragging(false);
  };

  const handleResetAvatarCrop = () => {
    setAvatarCropZoom(1);
    setAvatarCropOffset({ x: 0, y: 0 });
  };

  const handleAvatarCropPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!avatarCropSource || isAvatarUploading) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    avatarCropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: avatarCropOffset.x,
      originY: avatarCropOffset.y,
    };
    setIsAvatarCropDragging(true);
  };

  const handleAvatarCropPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!avatarCropSource || !avatarCropDragRef.current || avatarCropDragRef.current.pointerId !== event.pointerId) {
      return;
    }

    const nextOffset = clampCropOffset(avatarCropSource, avatarCropPreviewSize, avatarCropZoom, {
      x: avatarCropDragRef.current.originX + event.clientX - avatarCropDragRef.current.startX,
      y: avatarCropDragRef.current.originY + event.clientY - avatarCropDragRef.current.startY,
    });

    setAvatarCropOffset(nextOffset);
  };

  const handleAvatarCropPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (avatarCropDragRef.current?.pointerId === event.pointerId) {
      avatarCropDragRef.current = null;
      setIsAvatarCropDragging(false);
    }
  };

  const createCroppedAvatarFile = async () => {
    if (!avatarCropSource || !avatarCropMetrics || !avatarCropImageRef.current) {
      throw new Error(intl.formatMessage({
        id: 'settings.avatarUploadFailed',
        defaultMessage: 'Avatar upload failed'
      }));
    }

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_CROP_OUTPUT_SIZE;
    canvas.height = AVATAR_CROP_OUTPUT_SIZE;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(intl.formatMessage({
        id: 'settings.avatarUploadFailed',
        defaultMessage: 'Avatar upload failed'
      }));
    }

    const sourceSize = Math.min(
      avatarCropSource.width,
      avatarCropSource.height,
      avatarCropPreviewSize / avatarCropMetrics.scale
    );
    const sourceX = clamp(-avatarCropImageLeft / avatarCropMetrics.scale, 0, avatarCropSource.width - sourceSize);
    const sourceY = clamp(-avatarCropImageTop / avatarCropMetrics.scale, 0, avatarCropSource.height - sourceSize);

    context.drawImage(
      avatarCropImageRef.current,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      AVATAR_CROP_OUTPUT_SIZE,
      AVATAR_CROP_OUTPUT_SIZE
    );

    const mimeType = getAvatarOutputType(avatarCropSource.file);

    return await new Promise<File>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error(intl.formatMessage({
            id: 'settings.avatarUploadFailed',
            defaultMessage: 'Avatar upload failed'
          })));
          return;
        }

        resolve(new File([blob], getAvatarOutputName(avatarCropSource.file, mimeType), {
          type: mimeType,
          lastModified: Date.now(),
        }));
      }, mimeType, mimeType === 'image/jpeg' ? 0.92 : undefined);
    });
  };

  const handleConfirmAvatarCrop = async () => {
    try {
      const croppedFile = await createCroppedAvatarFile();
      const uploaded = await uploadAvatarFile(croppedFile);
      if (uploaded) {
        handleCloseAvatarCrop();
      }
    } catch (error) {
      console.error(error);
      setSuccessMessage(null);
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : intl.formatMessage({
              id: 'settings.avatarUploadFailed',
              defaultMessage: 'Avatar upload failed'
            })
      );
      setSnackbarOpen(true);
    }
  };

  const handleCreateMcpToken = async () => {
    if (!isAdmin) {
      return;
    }

    setIsCreatingMcpToken(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/user/mcp-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          name: mcpTokenName,
        }),
      });

      const result = await response.json().catch(() => null) as CreateMcpTokenResponse | null;
      if (!response.ok || !result?.success || !result.plainTextToken || !result.token) {
        throw new Error(result?.message || 'Failed to create MCP token');
      }

      setMcpTokens((prev) => [result.token as McpTokenItem, ...prev]);
      setMcpTokenName('');
      setNewMcpToken(result.plainTextToken);
      setNewMcpTokenDialogOpen(true);
      setErrorMessage(null);
      setSuccessMessage(intl.formatMessage({
        id: 'settings.mcpTokenCreated',
        defaultMessage: 'MCP token created'
      }));
      setSnackbarOpen(true);
    } catch (error) {
      console.error(error);
      setSuccessMessage(null);
      setErrorMessage(intl.formatMessage({
        id: 'settings.mcpTokenCreateFailed',
        defaultMessage: 'Failed to create MCP token'
      }));
      setSnackbarOpen(true);
    } finally {
      setIsCreatingMcpToken(false);
    }
  };

  const handleDeleteMcpToken = async (tokenId: string) => {
    if (!isAdmin) {
      return;
    }

    if (!window.confirm(intl.formatMessage({
      id: 'settings.mcpTokenDeleteConfirm',
      defaultMessage: 'Delete this MCP token? Existing MCP sessions that already used it may need to log out manually.'
    }))) {
      return;
    }

    setMcpTokenActionId(tokenId);

    try {
      const response = await fetch(`${apiBaseUrl}/api/user/mcp-tokens/${tokenId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${user.token}`,
        },
      });

      const result = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Failed to delete MCP token');
      }

      setMcpTokens((prev) => prev.filter((token) => token.id !== tokenId));
      setErrorMessage(null);
      setSuccessMessage(intl.formatMessage({
        id: 'settings.mcpTokenDeleted',
        defaultMessage: 'MCP token deleted'
      }));
      setSnackbarOpen(true);
    } catch (error) {
      console.error(error);
      setSuccessMessage(null);
      setErrorMessage(intl.formatMessage({
        id: 'settings.mcpTokenDeleteFailed',
        defaultMessage: 'Failed to delete MCP token'
      }));
      setSnackbarOpen(true);
    } finally {
      setMcpTokenActionId(null);
    }
  };

  const handleCopyMcpToken = async () => {
    if (!newMcpToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(newMcpToken);
      setErrorMessage(null);
      setSuccessMessage(intl.formatMessage({
        id: 'settings.mcpTokenCopied',
        defaultMessage: 'MCP token copied'
      }));
      setSnackbarOpen(true);
    } catch (error) {
      console.error(error);
      setSuccessMessage(null);
      setErrorMessage(intl.formatMessage({
        id: 'settings.mcpTokenCopyFailed',
        defaultMessage: 'Failed to copy MCP token'
      }));
      setSnackbarOpen(true);
    }
  };

  const closeNewMcpTokenDialog = () => {
    setNewMcpTokenDialogOpen(false);
    setNewMcpToken(null);
  };

  const handleStartRsiBinding = async () => {
    setIsStartingRsiBinding(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/user/rsi-binding/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          handle: rsiHandleInput,
        }),
      });

      const result = await response.json().catch(() => null) as {
        success?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !result?.success) {
        throw new Error(resolveLocalizedMessage(
          intl,
          result?.message,
          {
            id: 'settings.rsiBindingStartFailed',
            defaultMessage: 'Failed to generate RSI verification code.'
          },
        ));
      }

      await mutateRsiBinding();
      showSuccessMessage(resolveLocalizedMessage(
        intl,
        result?.message,
        {
          id: 'settings.rsiBindingStartSuccess',
          defaultMessage: 'Verification code generated. Add it to your RSI bio, then confirm binding.'
        },
      ));
    } catch (error) {
      console.error(error);
      showErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : intl.formatMessage({
              id: 'settings.rsiBindingStartFailed',
              defaultMessage: 'Failed to generate RSI verification code.'
            })
      );
    } finally {
      setIsStartingRsiBinding(false);
    }
  };

  const handleConfirmRsiBinding = async () => {
    setIsConfirmingRsiBinding(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/user/rsi-binding/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`,
        },
      });

      const result = await response.json().catch(() => null) as {
        success?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !result?.success) {
        throw new Error(resolveLocalizedMessage(
          intl,
          result?.message,
          {
            id: 'settings.rsiBindingConfirmFailed',
            defaultMessage: 'Failed to verify RSI bio.'
          },
        ));
      }

      await mutateRsiBinding();
      showSuccessMessage(resolveLocalizedMessage(
        intl,
        result?.message,
        {
          id: 'settings.rsiBindingConfirmSuccess',
          defaultMessage: 'RSI account bound successfully.'
        },
      ));
    } catch (error) {
      console.error(error);
      showErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : intl.formatMessage({
              id: 'settings.rsiBindingConfirmFailed',
              defaultMessage: 'Failed to verify RSI bio.'
            })
      );
    } finally {
      setIsConfirmingRsiBinding(false);
    }
  };

  const handleCopyRsiVerificationCode = async () => {
    if (!rsiBinding?.code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(rsiBinding.code);
      showSuccessMessage(intl.formatMessage({
        id: 'settings.rsiBindingCodeCopied',
        defaultMessage: 'Verification code copied.'
      }));
    } catch (error) {
      console.error(error);
      showErrorMessage(intl.formatMessage({
        id: 'settings.rsiBindingCodeCopyFailed',
        defaultMessage: 'Failed to copy verification code.'
      }));
    }
  };

  const openRsiBindingSupportTicket = () => {
    const params = new URLSearchParams({
      subject: 'RSI Account Binding Change',
      content: `I need help to modify my bound RSI account.\n\nCurrent RSI handle: ${rsiBinding?.citizen.handle || ''}\n\nReason: `,
    });

    navigate(`/tickets/create?${params.toString()}`);
  };

  const normalizedRsiHandleInput = rsiHandleInput.trim();
  const isRsiPendingHandleChanged = Boolean(
    rsiBinding?.pending
    && rsiBinding.pendingHandle
    && normalizedRsiHandleInput
    && normalizedRsiHandleInput !== rsiBinding.pendingHandle
  );

  const layoutItems: ResponsiveSectionLayoutItem[] = [];

  if (user.role !== UserRole.Guest) {
    layoutItems.push({
      id: Page.Profile,
      title: <FormattedMessage id="settings.profile" defaultMessage="Profile" />,
      description: <FormattedMessage id="settings.profileDescription" defaultMessage="Manage your profile here." />,
      ariaLabel: intl.formatMessage({ id: 'settings.profile', defaultMessage: 'Profile' }),
      active: currentPage === Page.Profile,
      onSelect: () => setCurrentPage(Page.Profile),
    });
  }

  layoutItems.push(
    {
      id: Page.Preferences,
      title: <FormattedMessage id="settings.preferences" defaultMessage="Preferences" />,
      description: <FormattedMessage id="settings.preferencesDescription" defaultMessage="Manage your preferences and settings here." />,
      ariaLabel: intl.formatMessage({ id: 'settings.preferences', defaultMessage: 'Preferences' }),
      active: currentPage === Page.Preferences,
      onSelect: () => setCurrentPage(Page.Preferences),
    },
    {
      id: Page.LocalData,
      title: <FormattedMessage id="settings.localData" defaultMessage="Local Data" />,
      description: <FormattedMessage id="settings.localDataDescription" defaultMessage="Manage your local data here." />,
      ariaLabel: intl.formatMessage({ id: 'settings.localData', defaultMessage: 'Local Data' }),
      active: currentPage === Page.LocalData,
      onSelect: () => setCurrentPage(Page.LocalData),
    },
  );

  return (
    <>
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

      <Dialog open={newMcpTokenDialogOpen} onClose={closeNewMcpTokenDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          <FormattedMessage id="settings.mcpTokenCreatedTitle" defaultMessage="New MCP Token" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            <FormattedMessage
              id="settings.mcpTokenCreatedDescription"
              defaultMessage="This token will only be shown once. Copy it now and store it safely."
            />
          </DialogContentText>
          <div className='rounded-md border border-gray-200 bg-gray-50 p-3 break-all font-mono text-sm'>
            {newMcpToken}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCopyMcpToken}>
            <FormattedMessage id="settings.copyMcpToken" defaultMessage="Copy" />
          </Button>
          <Button variant="contained" onClick={closeNewMcpTokenDialog}>
            <FormattedMessage id="settings.close" defaultMessage="Close" />
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(avatarCropSource)}
        onClose={handleCloseAvatarCrop}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          <FormattedMessage id="settings.avatarCropTitle" defaultMessage="Crop Avatar" />
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            <FormattedMessage
              id="settings.avatarCropDescription"
              defaultMessage="Drag the image and adjust the zoom to choose a square area for your avatar."
            />
          </Typography>

          {avatarCropSource && avatarCropMetrics && (
            <div className="flex flex-col items-center gap-5">
              <div
                ref={avatarCropFrameRef}
                className={`relative overflow-hidden rounded-xl border border-gray-300 bg-black touch-none select-none ${isAvatarCropDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{
                  width: 'min(320px, calc(100vw - 96px))',
                  aspectRatio: '1 / 1',
                }}
                onPointerDown={handleAvatarCropPointerDown}
                onPointerMove={handleAvatarCropPointerMove}
                onPointerUp={handleAvatarCropPointerEnd}
                onPointerCancel={handleAvatarCropPointerEnd}
              >
                <img
                  ref={avatarCropImageRef}
                  src={avatarCropSource.url}
                  alt=""
                  draggable={false}
                  className="absolute max-w-none select-none"
                  style={{
                    width: avatarCropMetrics.displayWidth,
                    height: avatarCropMetrics.displayHeight,
                    left: avatarCropImageLeft,
                    top: avatarCropImageTop,
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,.24) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.24) 1px, transparent 1px)',
                    backgroundSize: '33.333% 33.333%',
                  }}
                />
                <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset ring-white/90 shadow-[inset_0_0_0_9999px_rgba(0,0,0,0.08)]" />
              </div>

              <div className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
                <Move size={16} />
                <FormattedMessage
                  id="settings.avatarCropDragHint"
                  defaultMessage="Drag the image inside the square to adjust the crop."
                />
              </div>

              <div className="w-full">
                <Typography gutterBottom>
                  <FormattedMessage id="settings.avatarCropZoom" defaultMessage="Zoom" />
                </Typography>
                <Slider
                  value={avatarCropZoom}
                  min={1}
                  max={3}
                  step={0.01}
                  onChange={(_, value) => {
                    const nextZoom = Array.isArray(value) ? value[0] : value;
                    setAvatarCropZoom(nextZoom);
                    setAvatarCropOffset((prev) => clampCropOffset(avatarCropSource, avatarCropPreviewSize, nextZoom, prev));
                  }}
                  aria-label={intl.formatMessage({
                    id: 'settings.avatarCropZoom',
                    defaultMessage: 'Zoom'
                  })}
                />
              </div>

              <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Typography gutterBottom>
                    <FormattedMessage id="settings.avatarCropHorizontal" defaultMessage="Horizontal position" />
                  </Typography>
                  <Slider
                    value={avatarCropOffset.x}
                    min={-avatarCropMetrics.maxOffsetX}
                    max={avatarCropMetrics.maxOffsetX}
                    step={1}
                    disabled={avatarCropMetrics.maxOffsetX === 0}
                    onChange={(_, value) => {
                      const nextX = Array.isArray(value) ? value[0] : value;
                      setAvatarCropOffset((prev) => clampCropOffset(avatarCropSource, avatarCropPreviewSize, avatarCropZoom, {
                        ...prev,
                        x: nextX,
                      }));
                    }}
                    aria-label={intl.formatMessage({
                      id: 'settings.avatarCropHorizontal',
                      defaultMessage: 'Horizontal position'
                    })}
                  />
                </div>
                <div>
                  <Typography gutterBottom>
                    <FormattedMessage id="settings.avatarCropVertical" defaultMessage="Vertical position" />
                  </Typography>
                  <Slider
                    value={avatarCropOffset.y}
                    min={-avatarCropMetrics.maxOffsetY}
                    max={avatarCropMetrics.maxOffsetY}
                    step={1}
                    disabled={avatarCropMetrics.maxOffsetY === 0}
                    onChange={(_, value) => {
                      const nextY = Array.isArray(value) ? value[0] : value;
                      setAvatarCropOffset((prev) => clampCropOffset(avatarCropSource, avatarCropPreviewSize, avatarCropZoom, {
                        ...prev,
                        y: nextY,
                      }));
                    }}
                    aria-label={intl.formatMessage({
                      id: 'settings.avatarCropVertical',
                      defaultMessage: 'Vertical position'
                    })}
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleResetAvatarCrop} disabled={isAvatarUploading}>
            <FormattedMessage id="settings.avatarCropReset" defaultMessage="Reset Crop" />
          </Button>
          <Button onClick={handleCloseAvatarCrop} disabled={isAvatarUploading}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleConfirmAvatarCrop()}
            disabled={isAvatarUploading || !avatarCropSource}
          >
            {isAvatarUploading ? (
              <>
                <CircularProgress size={16} color="inherit" sx={{ mr: 1 }} />
                <FormattedMessage id="settings.avatarUploading" defaultMessage="Uploading..." />
              </>
            ) : (
              <FormattedMessage id="settings.avatarCropUpload" defaultMessage="Crop and Upload" />
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <ResponsiveSectionLayout
        items={layoutItems}
        mobileMenuLabel={<FormattedMessage id="settings.switchSection" defaultMessage="切换" />}
        mobileMenuTitle={<FormattedMessage id="settings.sections" defaultMessage="应用设置" />}
        contentClassName="min-h-0 flex-1 overflow-y-auto"
      >
        <div className='flex max-w-[700px] flex-col gap-6 px-4 py-4'>
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
                    <div className='flex flex-col items-end gap-2'>
                      <input
                        ref={avatarInputRef}
                        className="hidden"
                        accept="image/*"
                        type="file"
                        onChange={handleAvatarFileChange}
                        disabled={isAvatarUploading}
                      />
                      <button
                        type="button"
                        className="group relative !rounded-full !border-0 !bg-transparent !p-0 !outline-none disabled:cursor-not-allowed disabled:opacity-70"
                        aria-label={intl.formatMessage({
                          id: "settings.uploadAvatar",
                          defaultMessage: "Upload Avatar"
                        })}
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={isAvatarUploading}
                      >
                        <Avatar
                          src={profileData?.avatar || ''}
                          sx={{
                            width: '72px',
                            height: '72px',
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        />
                        <span className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-white transition-opacity ${isAvatarUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
                          {isAvatarUploading ? (
                            <CircularProgress size={22} color="inherit" />
                          ) : (
                            <Camera size={24} />
                          )}
                        </span>
                      </button>
                      <Typography variant="caption" color='text.secondary'>
                        <FormattedMessage
                          id="settings.avatarUploadHint"
                          defaultMessage="Supports JPG, PNG, and WebP images up to 5MB."
                        />
                      </Typography>
                    </div>
                  </div>
                  <div className='flex flex-row items-center gap-2 justify-between'>
                    <div>
                      <FormattedMessage id="settings.displayName" defaultMessage="Display Name" />
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage id="settings.displayNameDescription" defaultMessage="The name you want to display to others." />
                      </Typography>
                    </div>
                    <Input
                      value={profileData?.name || ""}
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
                    <div className="flex flex-col items-end gap-4">
                      <Input
                        value={user?.email}
                        disabled
                        sx={{ width: '250px' }}
                        size='small'
                      />
                      {!profileData?.emailVerified && (
                        <div className="flex w-full max-w-[250px] flex-col gap-2">
                          <Button
                            variant="outlined"
                            size="small"
                            aria-label={intl.formatMessage({ id: "settings.sendVerification", defaultMessage: "Send Verification Code" })}
                            onClick={() => void handleSendEmailVerificationCode()}
                            disabled={isSendingEmailVerificationCode || isVerifyingEmailCode}
                          >
                            {isSendingEmailVerificationCode ? (
                              <CircularProgress size={16} />
                            ) : (
                              <FormattedMessage id="settings.sendVerification" defaultMessage="Send Verification Code" />
                            )}
                          </Button>
                          <TextField
                            size="small"
                            fullWidth
                            label={<FormattedMessage id="verify.codeLabel" defaultMessage="6-digit code" />}
                            value={emailVerificationCode}
                            onChange={(event) => setEmailVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputProps={{
                              inputMode: 'numeric',
                              pattern: '\\d{6}',
                              maxLength: 6,
                            }}
                          />
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => void handleVerifyEmailCode()}
                            disabled={isVerifyingEmailCode || emailVerificationCode.length !== 6}
                          >
                            {isVerifyingEmailCode ? (
                              <CircularProgress size={16} color="inherit" />
                            ) : (
                              <FormattedMessage id="settings.verifyEmailCode" defaultMessage="Verify Code" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
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
                  <div className='flex flex-col gap-3 rounded-md border border-gray-200 p-4 dark:border-gray-800'>
                    <div>
                      <FormattedMessage id="settings.marketingEmailConsent" defaultMessage="Marketing Broadcast Emails" />
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage
                          id="settings.marketingEmailConsentDescription"
                          defaultMessage="Control whether Citizens Hub may send you marketing broadcast emails, including product updates, offers, and announcements."
                        />
                      </Typography>
                    </div>
                    <FormControlLabel
                      control={(
                        <Switch
                          checked={profileData.marketingEmailConsent === true}
                          onChange={(event) => {
                            setProfileData((prev) => ({
                              ...prev,
                              marketingEmailConsent: event.target.checked,
                            }));
                          }}
                        />
                      )}
                      label={(
                        <FormattedMessage
                          id="settings.marketingEmailConsentToggle"
                          defaultMessage="Receive marketing broadcast emails"
                        />
                      )}
                    />
                    {profileData.marketingEmailConsent === null && (
                      <Alert severity="info">
                        <FormattedMessage
                          id="settings.marketingEmailConsentPending"
                          defaultMessage="You have not selected a marketing email preference yet."
                        />
                      </Alert>
                    )}
                    <Typography variant="caption" color='text.secondary'>
                      <FormattedMessage
                        id="settings.marketingEmailConsentMeta"
                        defaultMessage="Last updated: {date}. Region hint: {region}."
                        values={{
                          date: profileData.marketingEmailConsentAt ? new Date(profileData.marketingEmailConsentAt).toLocaleString(intl.locale) : '-',
                          region: profileData.marketingEmailConsentRegion || (Intl.DateTimeFormat().resolvedOptions().timeZone || '-'),
                        }}
                      />
                    </Typography>
                  </div>
                  <div className='flex flex-col gap-3 rounded-md border border-gray-200 p-4 dark:border-gray-800'>
                    <div>
                      <FormattedMessage id="settings.password" defaultMessage="Password" />
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage
                          id="settings.passwordDescription"
                          defaultMessage="Change the password used for email login."
                        />
                      </Typography>
                    </div>
                    <TextField
                      size="small"
                      fullWidth
                      type="password"
                      autoComplete="current-password"
                      label={<FormattedMessage id="settings.currentPassword" defaultMessage="Current Password" />}
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                    />
                    <TextField
                      size="small"
                      fullWidth
                      type="password"
                      autoComplete="new-password"
                      label={<FormattedMessage id="settings.newPassword" defaultMessage="New Password" />}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      helperText={<FormattedMessage id="login.passwordStrengthError" defaultMessage="Password must be at least 6 characters and not all numbers" />}
                    />
                    <TextField
                      size="small"
                      fullWidth
                      type="password"
                      autoComplete="new-password"
                      label={<FormattedMessage id="settings.confirmNewPassword" defaultMessage="Confirm New Password" />}
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                    />
                    <div className='flex justify-end'>
                      <Button
                        variant="contained"
                        onClick={() => void handleChangePassword()}
                        disabled={isChangingPassword || !currentPassword || !newPassword || !confirmNewPassword}
                      >
                        {isChangingPassword ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <FormattedMessage id="settings.changePassword" defaultMessage="Change Password" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className='flex flex-col gap-3 rounded-md border border-gray-200 p-4 dark:border-gray-800'>
                    <div>
                      <FormattedMessage id="settings.adsConsent" defaultMessage="Advertising Audience Consent" />
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage
                          id="settings.adsConsentDescription"
                          defaultMessage="Control whether Citizens Hub may share your email and related first-party purchase data with advertising platforms such as Google to build or refresh customer audiences."
                        />
                      </Typography>
                    </div>
                    <FormControlLabel
                      control={(
                        <Switch
                          checked={Boolean(profileData.adsAudienceConsent)}
                          onChange={(event) => {
                            setProfileData((prev) => ({
                              ...prev,
                              adsAudienceConsent: event.target.checked,
                            }));
                          }}
                        />
                      )}
                      label={(
                        <FormattedMessage
                          id="settings.adsAudienceConsent"
                          defaultMessage="Allow sharing my email and related first-party purchase data with Google and similar advertising platforms for customer audience matching and advertising targeting where permitted by law."
                        />
                      )}
                    />
                    <Typography variant="caption" color='text.secondary'>
                      <FormattedMessage
                        id="settings.adsConsentMeta"
                        defaultMessage="Last updated: {date}. Region hint: {region}."
                        values={{
                          date: profileData.adsConsentAt ? new Date(profileData.adsConsentAt).toLocaleString(intl.locale) : '-',
                          region: profileData.adsConsentRegion || (Intl.DateTimeFormat().resolvedOptions().timeZone || '-'),
                        }}
                      />
                    </Typography>
                  </div>

                  <Button 
                    variant="contained" 
                    color="primary" 
                    disabled={isSubmitting || isAvatarUploading}
                    aria-label={intl.formatMessage({ id: "settings.save", defaultMessage: "Save" })}
                    onClick={() => void handleSaveProfile()}
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

                  <Divider sx={{ my: 2 }} />

                  <div className='flex flex-col gap-4'>
                    <div>
                      <Typography variant="h6">
                        <FormattedMessage id="settings.rsiBinding" defaultMessage="RSI Account Binding" />
                      </Typography>
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage
                          id="settings.rsiBindingDescription"
                          defaultMessage="Bind your RSI account by placing a generated verification code in your RSI bio."
                        />
                      </Typography>
                    </div>

                    {rsiBinding?.profileEditUrl && (
                      <div className='rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900/60 dark:bg-blue-950/30'>
                        <Typography variant="body2" color='text.secondary'>
                          <FormattedMessage
                            id="settings.rsiBindingProfileLinkLabel"
                            defaultMessage="Go to this RSI page to edit your bio for binding:"
                          />
                        </Typography>
                        <a
                          href={rsiBinding.profileEditUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className='mt-1 block break-all text-blue-700 underline underline-offset-2 dark:text-blue-300'
                        >
                          {rsiBinding.profileEditUrl}
                        </a>
                      </div>
                    )}

                    {rsiBinding?.bound ? (
                      <>
                        <Alert severity="success">
                          <FormattedMessage
                            id="settings.rsiBindingLocked"
                            defaultMessage="This RSI account is already bound and cannot be changed here. Submit a support ticket if you need to modify it."
                          />
                        </Alert>

                        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                          <div className='rounded-md border border-gray-200 p-3 dark:border-gray-800'>
                            <Typography variant="caption" color='text.secondary'>
                              <FormattedMessage id="settings.rsiHandle" defaultMessage="RSI Handle" />
                            </Typography>
                            <Typography variant="body1">{rsiBinding.citizen.handle || '-'}</Typography>
                          </div>
                          <div className='rounded-md border border-gray-200 p-3 dark:border-gray-800'>
                            <Typography variant="caption" color='text.secondary'>
                              <FormattedMessage id="settings.rsiDisplayName" defaultMessage="Display Name" />
                            </Typography>
                            <Typography variant="body1">{rsiBinding.citizen.displayName || '-'}</Typography>
                          </div>
                          <div className='rounded-md border border-gray-200 p-3 dark:border-gray-800'>
                            <Typography variant="caption" color='text.secondary'>
                              <FormattedMessage id="settings.rsiEnlisted" defaultMessage="Enlisted" />
                            </Typography>
                            <Typography variant="body1">{rsiBinding.citizen.enlisted || '-'}</Typography>
                          </div>
                          <div className='rounded-md border border-gray-200 p-3 dark:border-gray-800'>
                            <Typography variant="caption" color='text.secondary'>
                              <FormattedMessage id="settings.rsiWebsite" defaultMessage="Website" />
                            </Typography>
                            <Typography variant="body1" className='break-all'>{rsiBinding.citizen.website || '-'}</Typography>
                          </div>
                        </div>

                        <div className='rounded-md border border-gray-200 p-3 dark:border-gray-800'>
                          <Typography variant="caption" color='text.secondary'>
                            <FormattedMessage id="settings.rsiBio" defaultMessage="Bio" />
                          </Typography>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                            {rsiBinding.citizen.bio || '-'}
                          </Typography>
                        </div>

                        <div className='flex flex-wrap gap-2'>
                          {rsiBinding.profileUrl && (
                            <Button
                              variant="outlined"
                              onClick={() => window.open(rsiBinding.profileUrl || '', '_blank', 'noopener,noreferrer')}
                            >
                              <FormattedMessage id="settings.rsiOpenProfile" defaultMessage="Open RSI Profile" />
                            </Button>
                          )}
                          <Button variant="contained" onClick={openRsiBindingSupportTicket}>
                            <FormattedMessage id="settings.rsiSubmitTicket" defaultMessage="Submit Ticket" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
                          <div>
                            <Typography variant="body1">
                              <FormattedMessage id="settings.rsiHandle" defaultMessage="RSI Handle" />
                            </Typography>
                            <Typography variant="body2" color='text.secondary'>
                              <FormattedMessage
                                id="settings.rsiHandleDescription"
                                defaultMessage="Enter the RSI handle shown on your public citizen profile."
                              />
                            </Typography>
                          </div>
                          <Input
                            value={rsiHandleInput}
                            onChange={(event) => setRsiHandleInput(event.target.value)}
                            sx={{ width: '250px' }}
                            size='small'
                          />
                        </div>

                        <div className='flex flex-wrap gap-2'>
                          <Button
                            variant="contained"
                            onClick={() => void handleStartRsiBinding()}
                            disabled={isStartingRsiBinding || !normalizedRsiHandleInput}
                          >
                            {isStartingRsiBinding ? (
                              <>
                                <CircularProgress size={16} color="inherit" sx={{ mr: 1 }} />
                                <FormattedMessage id="settings.rsiGeneratingCode" defaultMessage="Generating..." />
                              </>
                            ) : (
                              <FormattedMessage id="settings.rsiGenerateCode" defaultMessage="Generate Verification Code" />
                            )}
                          </Button>
                          {rsiBinding?.profileEditUrl && (
                            <Button
                              variant="outlined"
                              onClick={() => window.open(rsiBinding.profileEditUrl || '', '_blank', 'noopener,noreferrer')}
                            >
                              <FormattedMessage id="settings.rsiOpenProfileEdit" defaultMessage="Open RSI Profile Settings" />
                            </Button>
                          )}
                        </div>

                        {rsiBinding?.pending && (
                          <>
                            <Alert severity="info">
                              <FormattedMessage
                                id="settings.rsiBindingPending"
                                defaultMessage="Copy the verification code below, paste it into your RSI bio, save the bio on RSI, then click Confirm Binding."
                              />
                            </Alert>

                            <div className='rounded-md border border-dashed border-gray-300 p-4 dark:border-gray-700'>
                              <Typography variant="caption" color='text.secondary'>
                                <FormattedMessage id="settings.rsiVerificationCode" defaultMessage="Verification Code" />
                              </Typography>
                              <div className='mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                                <Typography variant="h6" className='break-all'>
                                  {rsiBinding.code}
                                </Typography>
                                <Button variant="outlined" onClick={() => void handleCopyRsiVerificationCode()}>
                                  <FormattedMessage id="common.copy" defaultMessage="Copy" />
                                </Button>
                              </div>
                            </div>

                            {isRsiPendingHandleChanged && (
                              <Alert severity="warning">
                                <FormattedMessage
                                  id="settings.rsiHandleChangedRequiresRegenerate"
                                  defaultMessage="The RSI handle has changed. Generate a new verification code before confirming binding."
                                />
                              </Alert>
                            )}

                            <div className='flex flex-wrap gap-2'>
                              {rsiBinding.profileUrl && (
                                <Button
                                  variant="outlined"
                                  onClick={() => window.open(rsiBinding.profileUrl || '', '_blank', 'noopener,noreferrer')}
                                >
                                  <FormattedMessage id="settings.rsiOpenProfile" defaultMessage="Open RSI Profile" />
                                </Button>
                              )}
                              <Button
                                variant="contained"
                                onClick={() => void handleConfirmRsiBinding()}
                                disabled={isConfirmingRsiBinding || isRsiPendingHandleChanged}
                              >
                                {isConfirmingRsiBinding ? (
                                  <>
                                    <CircularProgress size={16} color="inherit" sx={{ mr: 1 }} />
                                    <FormattedMessage id="settings.rsiConfirming" defaultMessage="Confirming..." />
                                  </>
                                ) : (
                                  <FormattedMessage id="settings.rsiConfirmBinding" defaultMessage="Confirm Binding" />
                                )}
                              </Button>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {isAdmin ? (
                    <>
                      <Divider sx={{ my: 2 }} />

                      <div className='flex flex-col gap-4'>
                        <div>
                          <Typography variant="h6">
                            <FormattedMessage id="settings.mcpTokens" defaultMessage="MCP Tokens" />
                          </Typography>
                          <Typography variant="body2" color='text.secondary'>
                            <FormattedMessage
                              id="settings.mcpTokensDescription"
                              defaultMessage="Create dedicated tokens for MCP clients."
                            />
                          </Typography>
                        </div>

                        <div className='flex flex-row items-center gap-2 justify-between'>
                          <Input
                            placeholder={intl.formatMessage({
                              id: 'settings.mcpTokenNamePlaceholder',
                              defaultMessage: 'Optional token name'
                            })}
                            value={mcpTokenName}
                            onChange={(e) => setMcpTokenName(e.target.value)}
                            sx={{ width: '250px' }}
                            size='small'
                          />
                          <Button
                            variant="contained"
                            onClick={() => void handleCreateMcpToken()}
                            disabled={isCreatingMcpToken}
                          >
                            {isCreatingMcpToken ? (
                              <>
                                <CircularProgress size={16} color="inherit" sx={{ mr: 1 }} />
                                <FormattedMessage id="settings.creatingMcpToken" defaultMessage="Creating..." />
                              </>
                            ) : (
                              <FormattedMessage id="settings.createMcpToken" defaultMessage="Create Token" />
                            )}
                          </Button>
                        </div>

                        {isLoadingMcpTokens ? (
                          <div className='flex flex-row items-center gap-2 text-sm text-gray-500'>
                            <CircularProgress size={16} />
                            <FormattedMessage id="settings.loadingMcpTokens" defaultMessage="Loading MCP tokens..." />
                          </div>
                        ) : mcpTokens.length === 0 ? (
                          <Typography variant="body2" color='text.secondary'>
                            <FormattedMessage id="settings.noMcpTokens" defaultMessage="No MCP tokens created yet." />
                          </Typography>
                        ) : (
                          <div className='flex flex-col gap-3'>
                            {mcpTokens.map((token) => (
                              <div key={token.id} className='flex flex-row items-start gap-4 justify-between rounded-md border border-gray-200 p-3'>
                                <div className='flex flex-col gap-1'>
                                  <Typography variant="body1">{token.name}</Typography>
                                  <Typography variant="body2" color='text.secondary'>
                                    {token.tokenPreview}
                                  </Typography>
                                  <Typography variant="caption" color='text.secondary'>
                                    <FormattedMessage
                                      id="settings.mcpTokenCreatedAt"
                                      defaultMessage="Created: {date}"
                                      values={{ date: new Date(token.createdAt).toLocaleString() }}
                                    />
                                  </Typography>
                                  <Typography variant="caption" color='text.secondary'>
                                    <FormattedMessage
                                      id="settings.mcpTokenLastUsedAt"
                                      defaultMessage="Last used: {date}"
                                      values={{ date: token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : intl.formatMessage({ id: 'settings.never', defaultMessage: 'Never' }) }}
                                    />
                                  </Typography>
                                </div>
                                <Button
                                  variant="outlined"
                                  color="error"
                                  disabled={mcpTokenActionId === token.id}
                                  onClick={() => void handleDeleteMcpToken(token.id)}
                                >
                                  {mcpTokenActionId === token.id ? (
                                    <CircularProgress size={16} color="inherit" />
                                  ) : (
                                    <FormattedMessage id="settings.deleteMcpToken" defaultMessage="Delete" />
                                  )}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}
                </>)
              }
              <Divider sx={{ my: 2 }} />
            <div>
              <Typography variant="h6">
                <FormattedMessage id="settings.deleteAccount" defaultMessage="Delete Account" />
              </Typography>
              <Typography variant="body2" color='text.secondary' sx={{ mb: 2 }}>
                <FormattedMessage id="settings.deleteAccountDescription" defaultMessage="Deleting your account will disable login immediately. Your account will be marked as deleted, and you can reply to the deletion email within 14 days to contact support for recovery." />
              </Typography>
              <Button 
                variant="contained" 
                color="error"
                fullWidth
                aria-label={intl.formatMessage({ id: "settings.deleteAccount", defaultMessage: "Delete Account" })}
                onClick={() => {
                  if (window.confirm(intl.formatMessage({
                    id: 'settings.deleteAccountConfirm',
                    defaultMessage: 'Are you sure you want to delete your account? You will be logged out immediately. The account will be marked as deleted, and you can contact support within 14 days to recover it.'
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
                      localStorage.removeItem('user');
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

                <Divider sx={{ my: 2 }} />

                <div className='flex flex-col gap-4'>
                  <div>
                    <Typography variant="h6">
                      <FormattedMessage id="settings.syncScopes" defaultMessage="Sync Content" />
                    </Typography>
                    <Typography variant="body2" color='text.secondary'>
                      <FormattedMessage
                        id="settings.syncScopesDescription"
                        defaultMessage="Choose which data should sync automatically across your devices. Sync is enabled by default for supported content."
                      />
                    </Typography>
                  </div>

                  <div className='rounded-md border border-gray-200 p-4 dark:border-gray-800'>
                    <div className='flex flex-row items-start justify-between gap-4'>
                      <div className='flex flex-col gap-1'>
                        <Typography variant="subtitle1">
                          <FormattedMessage id="settings.syncHangar" defaultMessage="Hangar" />
                        </Typography>
                        <Typography variant="body2" color='text.secondary'>
                          <FormattedMessage
                            id="settings.syncHangarDescription"
                            defaultMessage="Automatically sync your private hangar snapshot, including ships, CCUs, bundles, and related hangar preferences."
                          />
                        </Typography>
                        <div className='flex flex-wrap items-center gap-2 pt-2'>
                          <Chip size="small" label={getHangarSyncStatusLabel()} />
                          {remoteHangarUpdatedAt && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={intl.formatMessage(
                                { id: 'settings.syncVersion', defaultMessage: 'Hangar version {date}' },
                                { date: new Date(remoteHangarUpdatedAt).toLocaleString() },
                              )}
                            />
                          )}
                        </div>
                        {lastSyncedAt && (
                          <Typography variant="caption" color='text.secondary'>
                            <FormattedMessage
                              id="settings.syncLastSyncedAt"
                              defaultMessage="Last synced: {date}"
                              values={{ date: new Date(lastSyncedAt).toLocaleString() }}
                            />
                          </Typography>
                        )}
                        {syncError && (
                          <Typography variant="caption" color='error'>
                            {syncError}
                          </Typography>
                        )}
                      </div>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={syncPreferences.hangar}
                            onChange={handleHangarSyncToggle}
                            disabled={user.role === UserRole.Guest}
                          />
                        }
                        label=""
                        sx={{ m: 0 }}
                      />
                    </div>
                  </div>
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
                  aria-label={intl.formatMessage({ id: "settings.clearAllData", defaultMessage: "Clear All Data" })}
                  onClick={() => setClearAllDataDialog(true)}
                >
                  <FormattedMessage id="settings.clearAllData" defaultMessage="Clear All Data" />
                </Button>

                <Typography variant="body1" gutterBottom>
                  <FormattedMessage id="settings.clearImportDataDescription" defaultMessage="Clear all imported hangar data. This action cannot be undone." />
                </Typography>
                <Button
                  variant="contained"
                  color="error"
                  aria-label={intl.formatMessage({ id: "settings.clearImportData", defaultMessage: "Clear Imported Data" })}
                  onClick={() => setClearImportDialog(true)}
                >
                  <FormattedMessage id="settings.clearImportData" defaultMessage="Clear Imported Data" />
                </Button>

                <Divider sx={{ my: 2 }} />

                <div className='flex flex-col gap-4'>
                  <div className='flex flex-row items-start gap-4 justify-between'>
                    <div>
                      <Typography variant="h6">
                        <FormattedMessage id="settings.modelCache" defaultMessage="Model Cache" />
                      </Typography>
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage
                          id="settings.modelCacheDescription"
                          defaultMessage="Manage locally cached GLB and SOG ship models."
                        />
                      </Typography>
                    </div>
                    <Button
                      variant="outlined"
                      disabled={isLoadingModelCache}
                      onClick={() => void refreshModelCacheSummary()}
                    >
                      {isLoadingModelCache ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <FormattedMessage id="settings.modelCacheRefresh" defaultMessage="Refresh" />
                      )}
                    </Button>
                  </div>

                  {!modelCacheSummary.supported ? (
                    <Alert severity="info">
                      <FormattedMessage
                        id="settings.modelCacheUnsupported"
                        defaultMessage="Model cache management is unavailable in this browser context."
                      />
                    </Alert>
                  ) : (
                    <>
                      <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
                        <div className='rounded-md border border-gray-200 p-3 dark:border-gray-800'>
                          <Typography variant="caption" color='text.secondary'>
                            <FormattedMessage id="settings.modelCacheTotal" defaultMessage="Total" />
                          </Typography>
                          <Typography variant="h6">{formatModelCacheSize(modelCacheSummary.totalBytes)}</Typography>
                          <Typography variant="body2" color='text.secondary'>
                            <FormattedMessage
                              id="settings.modelCacheFiles"
                              defaultMessage="{count} files"
                              values={{ count: modelCacheSummary.entries.length }}
                            />
                          </Typography>
                        </div>
                        <div className='rounded-md border border-gray-200 p-3 dark:border-gray-800'>
                          <Typography variant="caption" color='text.secondary'>GLB</Typography>
                          <Typography variant="h6">{formatModelCacheSize(modelCacheSummary.bytesByType.glb)}</Typography>
                          <Typography variant="body2" color='text.secondary'>
                            <FormattedMessage
                              id="settings.modelCacheFiles"
                              defaultMessage="{count} files"
                              values={{ count: modelCacheSummary.countsByType.glb }}
                            />
                          </Typography>
                        </div>
                        <div className='rounded-md border border-gray-200 p-3 dark:border-gray-800'>
                          <Typography variant="caption" color='text.secondary'>SOG</Typography>
                          <Typography variant="h6">{formatModelCacheSize(modelCacheSummary.bytesByType.sog)}</Typography>
                          <Typography variant="body2" color='text.secondary'>
                            <FormattedMessage
                              id="settings.modelCacheFiles"
                              defaultMessage="{count} files"
                              values={{ count: modelCacheSummary.countsByType.sog }}
                            />
                          </Typography>
                        </div>
                      </div>

                      <div className='flex flex-wrap gap-2'>
                        <Button
                          variant="outlined"
                          color="error"
                          disabled={modelCacheSummary.entries.length === 0 || modelCacheActionKey !== null}
                          onClick={() => void handleClearModelCache('all', intl.formatMessage({
                            id: 'settings.modelCacheAll',
                            defaultMessage: 'all'
                          }))}
                        >
                          {modelCacheActionKey === 'all' ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <FormattedMessage id="settings.modelCacheClearAll" defaultMessage="Clear All Model Cache" />
                          )}
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          disabled={modelCacheSummary.countsByType.glb === 0 || modelCacheActionKey !== null}
                          onClick={() => void handleClearModelCache('glb', 'GLB')}
                        >
                          {modelCacheActionKey === 'glb' ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <FormattedMessage id="settings.modelCacheClearGlb" defaultMessage="Clear GLB" />
                          )}
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          disabled={modelCacheSummary.countsByType.sog === 0 || modelCacheActionKey !== null}
                          onClick={() => void handleClearModelCache('sog', 'SOG')}
                        >
                          {modelCacheActionKey === 'sog' ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <FormattedMessage id="settings.modelCacheClearSog" defaultMessage="Clear SOG" />
                          )}
                        </Button>
                      </div>

                      {isLoadingModelCache ? (
                        <div className='flex flex-row items-center gap-2 text-sm text-gray-500'>
                          <CircularProgress size={16} />
                          <FormattedMessage id="settings.modelCacheLoading" defaultMessage="Loading model cache..." />
                        </div>
                      ) : modelCacheSummary.entries.length === 0 ? (
                        <Typography variant="body2" color='text.secondary'>
                          <FormattedMessage id="settings.modelCacheEmpty" defaultMessage="No cached models yet." />
                        </Typography>
                      ) : (
                        <div className='flex flex-col gap-3'>
                          {modelCacheSummary.entries.map((entry) => (
                            <div key={entry.id} className='flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-800 md:flex-row md:items-start md:justify-between'>
                              <div className='min-w-0 flex-1'>
                                <div className='flex flex-wrap items-center gap-2'>
                                  <span className='rounded border border-gray-200 px-2 py-0.5 text-xs font-semibold uppercase dark:border-gray-700'>
                                    {entry.type}
                                  </span>
                                  <Typography variant="body1">
                                    <FormattedMessage
                                      id="settings.modelCacheShip"
                                      defaultMessage="Ship #{shipId}"
                                      values={{ shipId: entry.shipId }}
                                    />
                                  </Typography>
                                  <Typography variant="body2" color='text.secondary'>
                                    {formatModelCacheSize(entry.size)}
                                  </Typography>
                                </div>
                                <Typography variant="body2" color='text.secondary' className='break-all'>
                                  {entry.modelKey}
                                </Typography>
                                <Typography variant="caption" color='text.secondary'>
                                  <FormattedMessage
                                    id="settings.modelCacheUpdatedAt"
                                    defaultMessage="Updated: {date}"
                                    values={{ date: new Date(entry.updatedAt).toLocaleString() }}
                                  />
                                </Typography>
                              </div>
                              <Button
                                variant="outlined"
                                color="error"
                                disabled={modelCacheActionKey !== null}
                                onClick={() => void handleClearModelCache(entry, `${entry.type.toUpperCase()} ${entry.modelKey}`)}
                              >
                                {modelCacheActionKey === entry.id ? (
                                  <CircularProgress size={16} color="inherit" />
                                ) : (
                                  <FormattedMessage id="settings.modelCacheDeleteEntry" defaultMessage="Delete" />
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <Divider sx={{ my: 2 }} />

                <div className='flex flex-col gap-4'>
                  <div className='flex flex-row items-start gap-4 justify-between'>
                    <div>
                      <Typography variant="h6">
                        <FormattedMessage id="settings.shipImageCache" defaultMessage="Ship Image Cache" />
                      </Typography>
                      <Typography variant="body2" color='text.secondary'>
                        <FormattedMessage
                          id="settings.shipImageCacheDescription"
                          defaultMessage="Manage locally cached ship images fetched from CitizensHub worker and R2."
                        />
                      </Typography>
                    </div>
                    <Button
                      variant="outlined"
                      disabled={isLoadingShipImageCache}
                      onClick={() => void refreshShipImageCacheSummary()}
                    >
                      {isLoadingShipImageCache ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <FormattedMessage id="settings.shipImageCacheRefresh" defaultMessage="Refresh" />
                      )}
                    </Button>
                  </div>

                  {!shipImageCacheSummary.supported ? (
                    <Alert severity="info">
                      <FormattedMessage
                        id="settings.shipImageCacheUnsupported"
                        defaultMessage="Ship image cache management is unavailable in this browser context."
                      />
                    </Alert>
                  ) : (
                    <>
                      <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
                        <div className='rounded-md border border-gray-200 p-3 dark:border-gray-800'>
                          <Typography variant="caption" color='text.secondary'>
                            <FormattedMessage id="settings.shipImageCacheTotal" defaultMessage="Total" />
                          </Typography>
                          <Typography variant="h6">{formatModelCacheSize(shipImageCacheSummary.totalBytes)}</Typography>
                          <Typography variant="body2" color='text.secondary'>
                            <FormattedMessage
                              id="settings.shipImageCacheFiles"
                              defaultMessage="{count} files"
                              values={{ count: shipImageCacheSummary.entries.length }}
                            />
                          </Typography>
                        </div>
                        <div className='rounded-md border border-gray-200 p-3 dark:border-gray-800'>
                          <Typography variant="caption" color='text.secondary'>
                            <FormattedMessage id="settings.shipImageCacheWorkerShipImage" defaultMessage="Worker Ship Images" />
                          </Typography>
                          <Typography variant="h6">{formatModelCacheSize(shipImageCacheSummary.bytesBySource.workerShipImage)}</Typography>
                          <Typography variant="body2" color='text.secondary'>
                            <FormattedMessage
                              id="settings.shipImageCacheFiles"
                              defaultMessage="{count} files"
                              values={{ count: shipImageCacheSummary.countsBySource.workerShipImage }}
                            />
                          </Typography>
                        </div>
                        <div className='rounded-md border border-gray-200 p-3 dark:border-gray-800'>
                          <Typography variant="caption" color='text.secondary'>R2</Typography>
                          <Typography variant="h6">{formatModelCacheSize(shipImageCacheSummary.bytesBySource.r2)}</Typography>
                          <Typography variant="body2" color='text.secondary'>
                            <FormattedMessage
                              id="settings.shipImageCacheFiles"
                              defaultMessage="{count} files"
                              values={{ count: shipImageCacheSummary.countsBySource.r2 }}
                            />
                          </Typography>
                        </div>
                      </div>

                      <div className='flex flex-wrap gap-2'>
                        <Button
                          variant="outlined"
                          color="error"
                          disabled={shipImageCacheSummary.entries.length === 0 || shipImageCacheActionKey !== null}
                          onClick={() => void handleClearShipImageCache('all', intl.formatMessage({
                            id: 'settings.shipImageCacheAll',
                            defaultMessage: 'all'
                          }))}
                        >
                          {shipImageCacheActionKey === 'all' ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <FormattedMessage id="settings.shipImageCacheClearAll" defaultMessage="Clear All Ship Image Cache" />
                          )}
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          disabled={shipImageCacheSummary.countsBySource.workerShipImage === 0 || shipImageCacheActionKey !== null}
                          onClick={() => void handleClearShipImageCache('workerShipImage', intl.formatMessage({
                            id: 'settings.shipImageCacheSourceWorkerShipImage',
                            defaultMessage: 'Worker Ship Images'
                          }))}
                        >
                          {shipImageCacheActionKey === 'workerShipImage' ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <FormattedMessage id="settings.shipImageCacheClearWorkerShipImage" defaultMessage="Clear Worker Ship Images" />
                          )}
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          disabled={shipImageCacheSummary.countsBySource.r2 === 0 || shipImageCacheActionKey !== null}
                          onClick={() => void handleClearShipImageCache('r2', 'R2')}
                        >
                          {shipImageCacheActionKey === 'r2' ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <FormattedMessage id="settings.shipImageCacheClearR2" defaultMessage="Clear R2 Images" />
                          )}
                        </Button>
                      </div>

                      {isLoadingShipImageCache ? (
                        <div className='flex flex-row items-center gap-2 text-sm text-gray-500'>
                          <CircularProgress size={16} />
                          <FormattedMessage id="settings.shipImageCacheLoading" defaultMessage="Loading ship image cache..." />
                        </div>
                      ) : shipImageCacheSummary.entries.length === 0 ? (
                        <Typography variant="body2" color='text.secondary'>
                          <FormattedMessage id="settings.shipImageCacheEmpty" defaultMessage="No cached ship images yet." />
                        </Typography>
                      ) : (
                        <div className='flex flex-col gap-3'>
                          {shipImageCacheSummary.entries.map((entry) => (
                            <div key={entry.id} className='flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-800 md:flex-row md:items-start md:justify-between'>
                              <div className='min-w-0 flex-1'>
                                <div className='flex flex-wrap items-center gap-2'>
                                  <span className='rounded border border-gray-200 px-2 py-0.5 text-xs font-semibold dark:border-gray-700'>
                                    {getShipImageCacheSourceLabel(entry.source)}
                                  </span>
                                  <Typography variant="body2" color='text.secondary'>
                                    {formatModelCacheSize(entry.size)}
                                  </Typography>
                                </div>
                                <Typography variant="body2" className='break-all'>
                                  {entry.pathname}
                                </Typography>
                                <Typography variant="caption" color='text.secondary' className='break-all'>
                                  {entry.host}
                                </Typography>
                                <Typography variant="caption" color='text.secondary'>
                                  <FormattedMessage
                                    id="settings.shipImageCacheUpdatedAt"
                                    defaultMessage="Cached: {date}"
                                    values={{ date: new Date(entry.cachedAt).toLocaleString() }}
                                  />
                                </Typography>
                              </div>
                              <Button
                                variant="outlined"
                                color="error"
                                disabled={shipImageCacheActionKey !== null}
                                onClick={() => void handleClearShipImageCache(entry, `${getShipImageCacheSourceLabel(entry.source)} ${entry.pathname}`)}
                              >
                                {shipImageCacheActionKey === entry.id ? (
                                  <CircularProgress size={16} color="inherit" />
                                ) : (
                                  <FormattedMessage id="settings.shipImageCacheDeleteEntry" defaultMessage="Delete" />
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {users.length > 0 && (
                  <>
                    <Typography variant="body1" gutterBottom>
                      <FormattedMessage id="settings.clearUserDataDescription" defaultMessage="Clear the hangar data of a specific user. This action cannot be undone." />
                    </Typography>
                    <div className='flex flex-col gap-4'>
                      {
                        users.map((user) => (
                          <div key={user.id} className='flex flex-row items-center gap-2 justify-between'>
                            <span>{user.nickname || user.username}</span>
                            <Button variant="contained" color="error" aria-label={intl.formatMessage({ id: "settings.clearUserData", defaultMessage: "Clear User Data" }, { userName: user.nickname || user.username })} onClick={() => {
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
      </ResponsiveSectionLayout>

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
          <Button onClick={() => setClearAllDataDialog(false)} aria-label={intl.formatMessage({ id: "common.cancel", defaultMessage: "Cancel" })}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleClearAllData} color="error" autoFocus aria-label={intl.formatMessage({ id: "common.confirm", defaultMessage: "Confirm" })}>
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
          <Button onClick={() => setClearUserDataDialog(false)} aria-label={intl.formatMessage({ id: "common.cancel", defaultMessage: "Cancel" })}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleClearUserData} color="error" autoFocus aria-label={intl.formatMessage({ id: "common.confirm", defaultMessage: "Confirm" })}>
            <FormattedMessage id="common.confirm" defaultMessage="Confirm" />
          </Button>
        </DialogActions>
      </Dialog>

      {/* 清除导入数据确认对话框 */}
      <Dialog
        open={clearImportDialog}
        onClose={() => setClearImportDialog(false)}
      >
        <DialogTitle>
          <FormattedMessage id="settings.confirmClearImport" defaultMessage="Confirm Clear Imported Data?" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            <FormattedMessage id="settings.confirmClearImportDescription" defaultMessage="This action will clear all imported hangar data. This action cannot be undone." />
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearImportDialog(false)} aria-label={intl.formatMessage({ id: "common.cancel", defaultMessage: "Cancel" })}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleClearImportData} color="error" autoFocus aria-label={intl.formatMessage({ id: "common.confirm", defaultMessage: "Confirm" })}>
            <FormattedMessage id="common.confirm" defaultMessage="Confirm" />
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
