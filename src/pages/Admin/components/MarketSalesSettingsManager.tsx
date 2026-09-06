import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { RefreshCw, Save } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { useAuthApi } from '@/hooks/swr/useApi';
import { RootState } from '@/store';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

interface MarketSalesCategory {
  key: string;
  enabled: boolean;
  listingCount: number;
}

interface MarketSalesSettingsResponse {
  success: boolean;
  data: {
    categories: MarketSalesCategory[];
    updatedAt: string | null;
  };
}

function getCategoryLabel(key: string) {
  switch (key) {
    case 'ccu': return 'admin.marketSales.category.ccu';
    case 'standalone_ship': return 'admin.marketSales.category.standaloneShip';
    case 'ship_package': return 'admin.marketSales.category.shipPackage';
    case 'paint': return 'admin.marketSales.category.paint';
    case 'subscriber_store': return 'admin.marketSales.category.subscriberStore';
    case 'other': return 'admin.marketSales.category.other';
    case 'credit': return 'admin.marketSales.category.credit';
    default: return null;
  }
}

export default function MarketSalesSettingsManager() {
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const { data, error, isLoading, mutate } = useAuthApi<MarketSalesSettingsResponse>('/api/admin/market/sales-settings');
  const [categories, setCategories] = useState<MarketSalesCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setCategories(data?.data.categories || []);
  }, [data]);

  const changed = useMemo(() => {
    const original = data?.data.categories || [];
    return categories.some((category) => original.find((item) => item.key === category.key)?.enabled !== category.enabled);
  }, [categories, data?.data.categories]);

  const updateCategory = (key: string, enabled: boolean) => {
    setCategories((current) => current.map((category) => category.key === key ? { ...category, enabled } : category));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/market/sales-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ categories: Object.fromEntries(categories.map((category) => [category.key, category.enabled])) }),
      });
      const result = await response.json().catch(() => null) as MarketSalesSettingsResponse | { error?: string } | null;
      if (!response.ok || !result || !('data' in result)) {
        throw new Error(result && 'error' in result ? result.error : 'Failed to save market sales settings');
      }
      await mutate(result, { revalidate: false });
      setMessage({ severity: 'success', text: intl.formatMessage({ id: 'admin.marketSales.saveSuccess', defaultMessage: 'Market sales settings saved.' }) });
    } catch (saveError) {
      setMessage({ severity: 'error', text: saveError instanceof Error ? saveError.message : intl.formatMessage({ id: 'admin.marketSales.saveError', defaultMessage: 'Failed to save market sales settings.' }) });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <Box display="flex" alignItems="center" gap={1}><CircularProgress size={20} /><Typography><FormattedMessage id="common.loading" defaultMessage="Loading..." /></Typography></Box>;
  }

  return (
    <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <FormattedMessage id="admin.marketSales.title" defaultMessage="Market Sales" />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <FormattedMessage id="admin.marketSales.description" defaultMessage="Choose which market product categories are currently available for sale." />
          </Typography>
        </Box>
        {error ? <Alert severity="error"><FormattedMessage id="admin.marketSales.loadError" defaultMessage="Failed to load market sales settings." /></Alert> : null}
        {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}
        <Divider />
        <Stack spacing={1}>
          {categories.map((category) => {
            const labelId = getCategoryLabel(category.key);
            return (
              <Box key={category.key} display="flex" alignItems="center" justifyContent="space-between" gap={2}>
                <Box>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {labelId ? <FormattedMessage id={labelId} defaultMessage={category.key} /> : category.key}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    <FormattedMessage id="admin.marketSales.listingCount" defaultMessage="{count} listings" values={{ count: category.listingCount }} />
                  </Typography>
                </Box>
                <FormControlLabel
                  control={<Switch checked={category.enabled} onChange={(event) => updateCategory(category.key, event.target.checked)} />}
                  label={category.enabled
                    ? intl.formatMessage({ id: 'admin.marketSales.enabled', defaultMessage: 'Selling' })
                    : intl.formatMessage({ id: 'admin.marketSales.disabled', defaultMessage: 'Not selling' })}
                />
              </Box>
            );
          })}
        </Stack>
        <Box display="flex" justifyContent="flex-end" gap={1}>
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => mutate()} disabled={saving}>
            <FormattedMessage id="admin.marketSales.refresh" defaultMessage="Refresh" />
          </Button>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save size={16} />} onClick={save} disabled={saving || !changed}>
            <FormattedMessage id="admin.marketSales.save" defaultMessage="Save settings" />
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
