import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState, } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { clearUpgrades, setCurrency } from '@/store/upgradesStore';
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
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { ProfileData, UserRole } from '@/types';
import CcuPriorityList from './components/CcuPriorityList';
import { useProfileData } from '@/hooks';
import { Camera, Move } from 'lucide-react';

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
    emailVerified: false,
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
  const avatarCropMetrics = avatarCropSource
    ? getAvatarCropMetrics(avatarCropSource, avatarCropPreviewSize, avatarCropZoom)
    : null;
  const avatarCropImageLeft = avatarCropMetrics
    ? (avatarCropPreviewSize - avatarCropMetrics.displayWidth) / 2 + avatarCropOffset.x
    : 0;
  const avatarCropImageTop = avatarCropMetrics
    ? (avatarCropPreviewSize - avatarCropMetrics.displayHeight) / 2 + avatarCropOffset.y
    : 0;

  const loadMcpTokens = async () => {
    if (!user.token || user.role === UserRole.Guest) {
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
  }, [apiBaseUrl, user.id, user.role, user.token]);

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

      <div className='flex flex-col text-left min-w-[300px] border-r border-b border-gray-200 dark:border-gray-800'>
        {
          user.role !== UserRole.Guest && <div role="button" tabIndex={0} aria-label={intl.formatMessage({ id: "settings.profile", defaultMessage: "Profile" })} className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.Profile ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.Profile)}>
            <FormattedMessage id="settings.profile" defaultMessage="Profile" />
            <Typography variant='body2' color='text.secondary'>
              <FormattedMessage id="settings.profileDescription" defaultMessage="Manage your profile here." />
            </Typography>
          </div>
        }
        <div role="button" tabIndex={0} aria-label={intl.formatMessage({ id: "settings.preferences", defaultMessage: "Preferences" })} className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.Preferences ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.Preferences)}>
          <FormattedMessage id="settings.preferences" defaultMessage="Preferences" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="settings.preferencesDescription" defaultMessage="Manage your preferences and settings here." />
          </Typography>
        </div>
        <div role="button" tabIndex={0} aria-label={intl.formatMessage({ id: "settings.localData", defaultMessage: "Local Data" })} className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.LocalData ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.LocalData)}>
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
                        value={profileData?.email}
                        disabled
                        sx={{ width: '250px' }}
                        size='small'
                      />
                      {!profileData?.emailVerified && (
                        <Button
                          variant="outlined"
                          size="small"
                          aria-label={intl.formatMessage({ id: "settings.sendVerification", defaultMessage: "Send Verification Email" })}
                          onClick={() => {
                            setIsSubmitting(true);
                            fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/verify`, {
                              method: 'GET',
                              headers: {
                                'Authorization': `Bearer ${user.token}`
                              }
                            })
                            .then(res => {
                              if (!res.ok) {
                                throw new Error('发送验证邮件失败');
                              }
                              return res.json();
                            })
                            .then(() => {
                              setSuccessMessage(intl.formatMessage({
                                id: 'settings.verificationEmailSent',
                                defaultMessage: 'Verification email has been sent, please check your inbox'
                              }));
                              setSnackbarOpen(true);
                            })
                            .catch(err => {
                              setErrorMessage(intl.formatMessage({
                                id: 'settings.verificationEmailFailed',
                                defaultMessage: 'Failed to send verification email'
                              }));
                              setSnackbarOpen(true);
                              console.error(err);
                            })
                            .finally(() => {
                              setIsSubmitting(false);
                            });
                          }}
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <CircularProgress size={16} />
                          ) : (
                            <FormattedMessage id="settings.sendVerification" defaultMessage="Send Verification Email" />
                          )}
                        </Button>
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

                  <Button 
                    variant="contained" 
                    color="primary" 
                    disabled={isSubmitting || isAvatarUploading}
                    aria-label={intl.formatMessage({ id: "settings.save", defaultMessage: "Save" })}
                    onClick={() => {
                      setIsSubmitting(true);
                      fetch(`${apiBaseUrl}/api/user/profile`, {
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
                        if (profileData.avatar) {
                          dispatch(login({
                            ...user,
                            avatar: profileData.avatar,
                          }));
                        }
                        setErrorMessage(null);
                        setSuccessMessage(intl.formatMessage({
                          id: 'settings.profileSaved',
                          defaultMessage: '个人资料保存成功'
                        }));
                        setSnackbarOpen(true);
                      })
                      .catch(err => {
                        setSuccessMessage(null);
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
                aria-label={intl.formatMessage({ id: "settings.deleteAccount", defaultMessage: "Delete Account" })}
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
    </div>
  );
}
