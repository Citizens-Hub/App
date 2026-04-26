import { useMemo, useState, type ChangeEvent } from 'react';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { CloudUpload, Delete, Save, Settings } from '@mui/icons-material';

import { useAuthApi } from '@/hooks';
import type {
  AdminShipSogModelListItem,
  AdminShipSogModelListResponse,
  ShipSogModelMutationResponse,
} from '@/types';
import type { RootState } from '@/store';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

type FlashState = {
  severity: 'success' | 'error';
  text: string;
} | null;

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '-';

  if (bytes >= 1024 * 1024) {
    const value = bytes / (1024 * 1024);
    return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} MB`;
  }

  if (bytes >= 1024) {
    const value = bytes / 1024;
    return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} KB`;
  }

  return `${bytes} B`;
}

function formatTimestamp(value: string | null | undefined, locale: string): string {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(locale);
}

function parseRotationInput(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function radiansToDegrees(value: number): number {
  return value * RAD_TO_DEG;
}

function degreesToRadians(value: string): number {
  return parseRotationInput(value) * DEG_TO_RAD;
}

function formatRotationDegree(value: number): string {
  const degrees = radiansToDegrees(value);
  if (Math.abs(degrees) >= 100) return degrees.toFixed(1);
  if (Math.abs(degrees) >= 10) return degrees.toFixed(2);
  return degrees.toFixed(3);
}

function formatRotationDegreeInput(value: number | undefined): string {
  return String(Number(formatRotationDegree(value ?? 0)));
}

export default function ShipSogModelsManager() {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const [query, setQuery] = useState('');
  const [selectedShip, setSelectedShip] = useState<AdminShipSogModelListItem | null>(null);
  const [modelPath, setModelPath] = useState('');
  const [rotationX, setRotationX] = useState('0');
  const [rotationY, setRotationY] = useState('0');
  const [rotationZ, setRotationZ] = useState('0');
  const [enabled, setEnabled] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useAuthApi<AdminShipSogModelListResponse>('/api/admin/ship-sog-models', {
    revalidateOnFocus: false,
  });

  const filteredShipModels = useMemo(() => {
    const list = data?.data.shipModels ?? [];
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return list;
    }

    return list.filter((ship) => [
      String(ship.shipId),
      ship.name,
      ship.slug,
      ship.model?.modelPath,
      ship.model?.originalFileName,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery)));
  }, [data?.data.shipModels, query]);

  const openEditor = (ship: AdminShipSogModelListItem) => {
    setSelectedShip(ship);
    setModelPath(ship.model?.modelPath ?? '');
    setRotationX(formatRotationDegreeInput(ship.model?.rotation?.[0]));
    setRotationY(formatRotationDegreeInput(ship.model?.rotation?.[1]));
    setRotationZ(formatRotationDegreeInput(ship.model?.rotation?.[2]));
    setEnabled(ship.model?.enabled ?? true);
    setFile(null);
    setFlash(null);
  };

  const closeEditor = () => {
    setSelectedShip(null);
    setFile(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
  };

  const handleSaveConfig = async () => {
    if (!selectedShip) return;

    setSaving(true);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ship-sog-models/${selectedShip.shipId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: user.token ? `Bearer ${user.token}` : '',
        },
        body: JSON.stringify({
          modelPath,
          rotation: [
            degreesToRadians(rotationX),
            degreesToRadians(rotationY),
            degreesToRadians(rotationZ),
          ],
          enabled,
        }),
      });
      const payload = await response.json() as ShipSogModelMutationResponse & { message?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || intl.formatMessage({
          id: 'admin.shipSogModels.saveFailed',
          defaultMessage: 'Failed to save SOG model config.',
        }));
      }

      await mutate();
      setSelectedShip((current) => current ? { ...current, model: payload.data.model } : current);
      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.shipSogModels.saved',
          defaultMessage: 'SOG model config saved.',
        }),
      });
    } catch (saveError) {
      setFlash({
        severity: 'error',
        text: saveError instanceof Error ? saveError.message : intl.formatMessage({
          id: 'admin.shipSogModels.saveFailed',
          defaultMessage: 'Failed to save SOG model config.',
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedShip || !file) return;

    setSaving(true);
    setFlash(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('rotationX', String(degreesToRadians(rotationX)));
      formData.append('rotationY', String(degreesToRadians(rotationY)));
      formData.append('rotationZ', String(degreesToRadians(rotationZ)));
      formData.append('enabled', String(enabled));

      const response = await fetch(`${API_BASE_URL}/api/admin/ship-sog-models/${selectedShip.shipId}/upload`, {
        method: 'POST',
        headers: {
          Authorization: user.token ? `Bearer ${user.token}` : '',
        },
        body: formData,
      });
      const payload = await response.json() as ShipSogModelMutationResponse & { message?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || intl.formatMessage({
          id: 'admin.shipSogModels.uploadFailed',
          defaultMessage: 'Failed to upload SOG model.',
        }));
      }

      await mutate();
      setSelectedShip((current) => current ? { ...current, model: payload.data.model } : current);
      setModelPath(payload.data.model?.modelPath ?? '');
      setFile(null);
      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.shipSogModels.uploaded',
          defaultMessage: 'SOG model uploaded.',
        }),
      });
    } catch (uploadError) {
      setFlash({
        severity: 'error',
        text: uploadError instanceof Error ? uploadError.message : intl.formatMessage({
          id: 'admin.shipSogModels.uploadFailed',
          defaultMessage: 'Failed to upload SOG model.',
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedShip || !selectedShip.model) return;

    const confirmed = window.confirm(intl.formatMessage({
      id: 'admin.shipSogModels.deleteConfirm',
      defaultMessage: 'Delete this SOG model config and its managed R2 object?',
    }));

    if (!confirmed) return;

    setSaving(true);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ship-sog-models/${selectedShip.shipId}`, {
        method: 'DELETE',
        headers: {
          Authorization: user.token ? `Bearer ${user.token}` : '',
        },
      });
      const payload = await response.json() as { success: boolean; message?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || intl.formatMessage({
          id: 'admin.shipSogModels.deleteFailed',
          defaultMessage: 'Failed to delete SOG model.',
        }));
      }

      await mutate();
      closeEditor();
    } catch (deleteError) {
      setFlash({
        severity: 'error',
        text: deleteError instanceof Error ? deleteError.message : intl.formatMessage({
          id: 'admin.shipSogModels.deleteFailed',
          defaultMessage: 'Failed to delete SOG model.',
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom>
          {intl.formatMessage({
            id: 'admin.shipSogModels.title',
            defaultMessage: 'Ship SOG Models',
          })}
        </Typography>
        <Typography color="text.secondary">
          {intl.formatMessage({
            id: 'admin.shipSogModels.description',
            defaultMessage: 'Upload and configure SOG Gaussian model files.',
          })}
        </Typography>
      </Box>

      <TextField
        label={intl.formatMessage({
          id: 'admin.shipSogModels.search',
          defaultMessage: 'Search by ship ID, name, slug, file, or path',
        })}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        fullWidth
      />

      {error && (
        <Alert severity="error">
          {error instanceof Error ? error.message : intl.formatMessage({
            id: 'admin.shipSogModels.loadFailed',
            defaultMessage: 'Failed to load SOG model configs.',
          })}
        </Alert>
      )}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                {intl.formatMessage({ id: 'admin.shipSogModels.id', defaultMessage: 'ID' })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({ id: 'admin.shipSogModels.ship', defaultMessage: 'Ship' })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({ id: 'admin.shipSogModels.status', defaultMessage: 'Status' })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({ id: 'admin.shipSogModels.path', defaultMessage: 'Relative path' })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({ id: 'admin.shipSogModels.rotation', defaultMessage: 'Rotation (deg)' })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({ id: 'admin.shipSogModels.size', defaultMessage: 'Size' })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({ id: 'admin.shipSogModels.updatedAt', defaultMessage: 'Updated' })}
              </TableCell>
              <TableCell align="right">
                {intl.formatMessage({ id: 'admin.shipSogModels.actions', defaultMessage: 'Actions' })}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && !data?.data.shipModels.length ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography align="center">
                    {intl.formatMessage({ id: 'loading', defaultMessage: 'Loading...' })}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}

            {!isLoading && filteredShipModels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography align="center" color="text.secondary">
                    {intl.formatMessage({ id: 'admin.shipSogModels.empty', defaultMessage: 'No ships found.' })}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}

            {filteredShipModels.map((ship) => (
              <TableRow key={ship.shipId} hover>
                <TableCell>{ship.shipId}</TableCell>
                <TableCell>
                  <Stack spacing={0.25}>
                    <Typography fontWeight={600}>{ship.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{ship.slug || '-'}</Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  {ship.model ? (
                    <Chip
                      size="small"
                      color={ship.model.enabled ? 'success' : 'default'}
                      label={ship.model.enabled
                        ? intl.formatMessage({ id: 'admin.shipSogModels.enabled', defaultMessage: 'Enabled' })
                        : intl.formatMessage({ id: 'admin.shipSogModels.disabled', defaultMessage: 'Disabled' })}
                    />
                  ) : (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={intl.formatMessage({ id: 'admin.shipSogModels.notConfigured', defaultMessage: 'Not configured' })}
                    />
                  )}
                </TableCell>
                <TableCell sx={{ maxWidth: 340 }}>
                  <Typography variant="body2" className="break-all">
                    {ship.model?.modelPath || '-'}
                  </Typography>
                </TableCell>
                <TableCell>
                  {ship.model ? ship.model.rotation.map(formatRotationDegree).join(', ') : '-'}
                </TableCell>
                <TableCell>{formatBytes(ship.model?.fileSize)}</TableCell>
                <TableCell>{formatTimestamp(ship.model?.updatedAt, intl.locale)}</TableCell>
                <TableCell align="right">
                  <Button size="small" startIcon={<Settings />} onClick={() => openEditor(ship)}>
                    {intl.formatMessage({ id: 'admin.shipSogModels.manage', defaultMessage: 'Manage' })}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(selectedShip)} onClose={saving ? undefined : closeEditor} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedShip
            ? `${selectedShip.shipId} - ${selectedShip.name}`
            : intl.formatMessage({ id: 'admin.shipSogModels.manage', defaultMessage: 'Manage' })}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {flash && <Alert severity={flash.severity}>{flash.text}</Alert>}

            <TextField
              label={intl.formatMessage({ id: 'admin.shipSogModels.relativePath', defaultMessage: 'R2 relative path' })}
              value={modelPath}
              onChange={(event) => setModelPath(event.target.value)}
              placeholder="ships/sog/312/auroramk2.sog"
              fullWidth
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label={intl.formatMessage({ id: 'admin.shipSogModels.rotationX', defaultMessage: 'Rotation X (deg)' })}
                value={rotationX}
                onChange={(event) => setRotationX(event.target.value)}
                type="number"
                fullWidth
              />
              <TextField
                label={intl.formatMessage({ id: 'admin.shipSogModels.rotationY', defaultMessage: 'Rotation Y (deg)' })}
                value={rotationY}
                onChange={(event) => setRotationY(event.target.value)}
                type="number"
                fullWidth
              />
              <TextField
                label={intl.formatMessage({ id: 'admin.shipSogModels.rotationZ', defaultMessage: 'Rotation Z (deg)' })}
                value={rotationZ}
                onChange={(event) => setRotationZ(event.target.value)}
                type="number"
                fullWidth
              />
            </Stack>

            <FormControlLabel
              control={<Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />}
              label={intl.formatMessage({ id: 'admin.shipSogModels.enableModel', defaultMessage: 'Enable SOG model' })}
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
              <Button component="label" variant="outlined" startIcon={<CloudUpload />}>
                {intl.formatMessage({ id: 'admin.shipSogModels.chooseFile', defaultMessage: 'Choose .sog file' })}
                <input hidden type="file" accept=".sog" onChange={handleFileChange} />
              </Button>
              <Typography color="text.secondary" className="min-w-0 break-all">
                {file ? `${file.name} (${formatBytes(file.size)})` : intl.formatMessage({
                  id: 'admin.shipSogModels.noFile',
                  defaultMessage: 'No file selected',
                })}
              </Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditor} disabled={saving}>
            {intl.formatMessage({ id: 'cancel', defaultMessage: 'Cancel' })}
          </Button>
          <Button
            color="error"
            startIcon={<Delete />}
            onClick={handleDelete}
            disabled={saving || !selectedShip?.model}
          >
            {intl.formatMessage({ id: 'delete', defaultMessage: 'Delete' })}
          </Button>
          <Button
            startIcon={<Save />}
            onClick={handleSaveConfig}
            disabled={saving || !modelPath.trim()}
          >
            {intl.formatMessage({ id: 'admin.shipSogModels.saveConfig', defaultMessage: 'Save config' })}
          </Button>
          <Button
            variant="contained"
            startIcon={<CloudUpload />}
            onClick={handleUpload}
            disabled={saving || !file}
          >
            {intl.formatMessage({ id: 'admin.shipSogModels.upload', defaultMessage: 'Upload' })}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
