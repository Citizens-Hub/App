import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import {
  Alert,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import { useAuthApi } from '@/hooks';
import type { AdminShipItemIdMappingListResponse } from '@/types';
import type { RootState } from '@/store';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

type FlashState = {
  severity: 'success' | 'error';
  text: string;
} | null;

function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatTimestamp(value: string | null | undefined, locale: string): string {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(locale);
}

export default function ShipItemIdMappingsManager() {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const [shipIdInput, setShipIdInput] = useState('');
  const [itemIdInput, setItemIdInput] = useState('');
  const [itemNameInput, setItemNameInput] = useState('');
  const [flash, setFlash] = useState<FlashState>(null);
  const [saving, setSaving] = useState(false);

  const query = useMemo(() => {
    const shipId = parsePositiveInt(shipIdInput);
    return shipId ? `?shipId=${shipId}` : '';
  }, [shipIdInput]);

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useAuthApi<AdminShipItemIdMappingListResponse>(`/api/admin/ship-item-id-mappings${query}`, {
    revalidateOnFocus: false,
  });

  const mappings = data?.data.mappings || [];

  const saveMapping = async () => {
    const itemId = parsePositiveInt(itemIdInput);
    const shipId = parsePositiveInt(shipIdInput);

    if (!itemId || !shipId) {
      setFlash({
        severity: 'error',
        text: intl.formatMessage({
          id: 'admin.shipItemIds.invalidInput',
          defaultMessage: 'Provide a valid item ID and ship ID.',
        }),
      });
      return;
    }

    setSaving(true);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ship-item-id-mappings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          itemId,
          shipId,
          itemName: itemNameInput.trim() || null,
          source: 'manual',
        }),
      });

      const payload = await response.json() as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to save ship item ID mapping');
      }

      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.shipItemIds.saveSuccess',
          defaultMessage: 'Ship item ID mapping saved.',
        }),
      });
      setItemIdInput('');
      setItemNameInput('');
      await mutate();
    } catch (saveError) {
      setFlash({
        severity: 'error',
        text: saveError instanceof Error ? saveError.message : String(saveError),
      });
    } finally {
      setSaving(false);
    }
  };

  const removeMapping = async (itemId: number) => {
    setSaving(true);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ship-item-id-mappings/${itemId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      const payload = await response.json() as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to delete ship item ID mapping');
      }

      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.shipItemIds.deleteSuccess',
          defaultMessage: 'Ship item ID mapping deleted.',
        }),
      });
      await mutate();
    } catch (deleteError) {
      setFlash({
        severity: 'error',
        text: deleteError instanceof Error ? deleteError.message : String(deleteError),
      });
    } finally {
      setSaving(false);
    }
  };

  const rebuildMappings = async () => {
    setSaving(true);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ship-item-id-mappings/rebuild`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      const payload = await response.json() as { success?: boolean; data?: { mappingCount?: number }; message?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to rebuild ship item ID mappings');
      }

      setFlash({
        severity: 'success',
        text: intl.formatMessage(
          {
            id: 'admin.shipItemIds.rebuildSuccess',
            defaultMessage: 'Rebuilt ship item ID mappings from current history. Candidates: {count}.',
          },
          { count: payload.data?.mappingCount ?? 0 },
        ),
      });
      await mutate();
    } catch (rebuildError) {
      setFlash({
        severity: 'error',
        text: rebuildError instanceof Error ? rebuildError.message : String(rebuildError),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h6">
          {intl.formatMessage({ id: 'admin.shipItemIds.title', defaultMessage: 'Ship Item IDs' })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'admin.shipItemIds.description',
            defaultMessage: 'Maintain crawler item ID fallback mappings for ship matching.',
          })}
        </Typography>
      </Stack>

      {flash ? <Alert severity={flash.severity}>{flash.text}</Alert> : null}
      {error ? (
        <Alert severity="error">
          {intl.formatMessage({ id: 'admin.shipItemIds.loadFailed', defaultMessage: 'Failed to load ship item ID mappings.' })}
        </Alert>
      ) : null}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField
          label={intl.formatMessage({ id: 'admin.shipItemIds.shipId', defaultMessage: 'Ship ID' })}
          value={shipIdInput}
          onChange={(event) => setShipIdInput(event.target.value)}
          size="small"
        />
        <TextField
          label={intl.formatMessage({ id: 'admin.shipItemIds.itemId', defaultMessage: 'Item ID' })}
          value={itemIdInput}
          onChange={(event) => setItemIdInput(event.target.value)}
          size="small"
        />
        <TextField
          label={intl.formatMessage({ id: 'admin.shipItemIds.itemName', defaultMessage: 'Item Name' })}
          value={itemNameInput}
          onChange={(event) => setItemNameInput(event.target.value)}
          size="small"
        />
        <Button variant="contained" onClick={saveMapping} disabled={saving}>
          {intl.formatMessage({ id: 'admin.shipItemIds.save', defaultMessage: 'Save Mapping' })}
        </Button>
        <Button variant="outlined" onClick={rebuildMappings} disabled={saving}>
          {intl.formatMessage({ id: 'admin.shipItemIds.rebuild', defaultMessage: 'Rebuild From History' })}
        </Button>
      </Stack>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{intl.formatMessage({ id: 'admin.shipItemIds.table.itemId', defaultMessage: 'Item ID' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.shipItemIds.table.itemName', defaultMessage: 'Item Name' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.shipItemIds.table.shipId', defaultMessage: 'Ship ID' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.shipItemIds.table.ship', defaultMessage: 'Ship' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.shipItemIds.table.source', defaultMessage: 'Source' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.shipItemIds.table.updatedAt', defaultMessage: 'Updated' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.shipItemIds.table.actions', defaultMessage: 'Actions' })}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!isLoading && mappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  {intl.formatMessage({ id: 'admin.shipItemIds.empty', defaultMessage: 'No mappings found.' })}
                </TableCell>
              </TableRow>
            ) : null}
            {mappings.map((mapping) => (
              <TableRow key={mapping.itemId}>
                <TableCell>{mapping.itemId}</TableCell>
                <TableCell>{mapping.itemName || '-'}</TableCell>
                <TableCell>{mapping.shipId}</TableCell>
                <TableCell>{mapping.shipName || '-'}</TableCell>
                <TableCell>
                  <Chip size="small" label={mapping.source} color={mapping.source === 'manual' ? 'primary' : 'default'} />
                </TableCell>
                <TableCell>{formatTimestamp(mapping.updatedAt, intl.locale)}</TableCell>
                <TableCell>
                  <Button size="small" color="error" onClick={() => removeMapping(mapping.itemId)} disabled={saving}>
                    {intl.formatMessage({ id: 'admin.shipItemIds.delete', defaultMessage: 'Delete' })}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
