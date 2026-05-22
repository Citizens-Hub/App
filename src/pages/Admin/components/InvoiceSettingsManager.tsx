import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { InvoiceSettings } from '@/types';
import { useAdminInvoiceSettings } from '@/hooks/swr';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

const DEFAULT_SETTINGS: InvoiceSettings = {
  enabled: true,
  storeName: 'CitizensHub',
  companyName: '',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  companyWebsite: '',
  companyRegistrationNumber: '',
  companyTaxLabel: 'Business Registration No.',
  companyTaxNumber: '',
  bankDetails: '',
  paymentTerms: 'Paid in full',
  notes: 'This invoice is generated based on the actual Stripe payment result, including discounts and taxes where applicable.',
  footer: 'This is a computer-generated invoice.',
  locale: 'en-HK',
  currency: 'USD',
};

export default function InvoiceSettingsManager() {
  const intl = useIntl();
  const { token } = useSelector((state: RootState) => state.user.user);
  const { data, error, isLoading, mutate } = useAdminInvoiceSettings();
  const [settings, setSettings] = useState<InvoiceSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setSettings({
        ...DEFAULT_SETTINGS,
        ...data,
      });
    }
  }, [data]);

  const updateField = <K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/invoice-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to save invoice settings');
      }

      await mutate(result, { revalidate: false });
      setMessage({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.invoiceSettings.saveSuccess',
          defaultMessage: 'Invoice settings saved.',
        }),
      });
    } catch (saveError) {
      console.error(saveError);
      setMessage({
        severity: 'error',
        text: intl.formatMessage({
          id: 'admin.invoiceSettings.saveError',
          defaultMessage: 'Failed to save invoice settings.',
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/invoice-settings/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Failed to preview invoice settings');
      }

      const blob = await response.blob();
      const previewUrl = window.URL.createObjectURL(blob);
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(previewUrl), 60_000);
    } catch (previewError) {
      console.error(previewError);
      setMessage({
        severity: 'error',
        text: intl.formatMessage({
          id: 'admin.invoiceSettings.previewError',
          defaultMessage: 'Failed to generate invoice preview.',
        }),
      });
    } finally {
      setPreviewing(false);
    }
  };

  if (isLoading) {
    return <Typography><FormattedMessage id="common.loading" defaultMessage="Loading..." /></Typography>;
  }

  return (
    <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <FormattedMessage id="admin.invoiceSettings.title" defaultMessage="Invoice Settings" />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <FormattedMessage
              id="admin.invoiceSettings.description"
              defaultMessage="Configure the company issuer details and Hong Kong invoice defaults used for self-generated order invoices stored in the dedicated invoices R2 bucket."
            />
          </Typography>
        </Box>

        {error && (
          <Alert severity="error">
            <FormattedMessage id="admin.invoiceSettings.loadError" defaultMessage="Failed to load invoice settings." />
          </Alert>
        )}

        {message && (
          <Alert severity={message.severity}>
            {message.text}
          </Alert>
        )}

        <Box display="flex" alignItems="center" gap={2}>
          <Switch
            checked={settings.enabled}
            onChange={(event) => updateField('enabled', event.target.checked)}
          />
          <Typography>
            <FormattedMessage id="admin.invoiceSettings.enabled" defaultMessage="Enable self-hosted invoices" />
          </Typography>
        </Box>

        <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={2}>
          <TextField
            label={intl.formatMessage({ id: 'admin.invoiceSettings.storeName', defaultMessage: 'Store / Brand Name' })}
            value={settings.storeName}
            onChange={(event) => updateField('storeName', event.target.value)}
            helperText={intl.formatMessage({
              id: 'admin.invoiceSettings.storeNameHelp',
              defaultMessage: 'Shown as the store brand. The legal company name remains the invoice issuer.',
            })}
            fullWidth
          />
          <TextField
            label={intl.formatMessage({ id: 'admin.invoiceSettings.companyName', defaultMessage: 'Company Name' })}
            value={settings.companyName}
            onChange={(event) => updateField('companyName', event.target.value)}
            helperText={intl.formatMessage({
              id: 'admin.invoiceSettings.companyNameHelp',
              defaultMessage: 'Legal invoice issuer name, e.g. the Hong Kong company or registered business name.',
            })}
            fullWidth
          />
          <TextField
            label={intl.formatMessage({ id: 'admin.invoiceSettings.companyRegistrationNumber', defaultMessage: 'Business Registration No.' })}
            value={settings.companyRegistrationNumber}
            onChange={(event) => updateField('companyRegistrationNumber', event.target.value)}
            fullWidth
          />
          <TextField
            label={intl.formatMessage({ id: 'admin.invoiceSettings.companyEmail', defaultMessage: 'Company Email' })}
            value={settings.companyEmail}
            onChange={(event) => updateField('companyEmail', event.target.value)}
            fullWidth
          />
          <TextField
            label={intl.formatMessage({ id: 'admin.invoiceSettings.companyPhone', defaultMessage: 'Company Phone' })}
            value={settings.companyPhone}
            onChange={(event) => updateField('companyPhone', event.target.value)}
            fullWidth
          />
          <TextField
            label={intl.formatMessage({ id: 'admin.invoiceSettings.companyWebsite', defaultMessage: 'Company Website' })}
            value={settings.companyWebsite}
            onChange={(event) => updateField('companyWebsite', event.target.value)}
            fullWidth
          />
          <TextField
            label={intl.formatMessage({ id: 'admin.invoiceSettings.locale', defaultMessage: 'Locale' })}
            value={settings.locale}
            onChange={(event) => updateField('locale', event.target.value)}
            fullWidth
          />
          <TextField
            label={intl.formatMessage({ id: 'admin.invoiceSettings.currency', defaultMessage: 'Currency' })}
            value={settings.currency}
            onChange={(event) => updateField('currency', event.target.value.toUpperCase())}
            fullWidth
          />
          <TextField
            label={intl.formatMessage({ id: 'admin.invoiceSettings.companyTaxLabel', defaultMessage: 'Tax Label' })}
            value={settings.companyTaxLabel}
            onChange={(event) => updateField('companyTaxLabel', event.target.value)}
            fullWidth
          />
          <TextField
            label={intl.formatMessage({ id: 'admin.invoiceSettings.companyTaxNumber', defaultMessage: 'Tax Number' })}
            value={settings.companyTaxNumber}
            onChange={(event) => updateField('companyTaxNumber', event.target.value)}
            fullWidth
          />
          <TextField
            label={intl.formatMessage({ id: 'admin.invoiceSettings.paymentTerms', defaultMessage: 'Payment Terms' })}
            value={settings.paymentTerms}
            onChange={(event) => updateField('paymentTerms', event.target.value)}
            fullWidth
          />
        </Box>

        <TextField
          label={intl.formatMessage({ id: 'admin.invoiceSettings.companyAddress', defaultMessage: 'Company Address' })}
          value={settings.companyAddress}
          onChange={(event) => updateField('companyAddress', event.target.value)}
          multiline
          minRows={3}
          fullWidth
        />

        <TextField
          label={intl.formatMessage({ id: 'admin.invoiceSettings.bankDetails', defaultMessage: 'Bank Details' })}
          value={settings.bankDetails}
          onChange={(event) => updateField('bankDetails', event.target.value)}
          multiline
          minRows={3}
          fullWidth
        />

        <TextField
          label={intl.formatMessage({ id: 'admin.invoiceSettings.notes', defaultMessage: 'Invoice Notes' })}
          value={settings.notes}
          onChange={(event) => updateField('notes', event.target.value)}
          multiline
          minRows={4}
          fullWidth
        />

        <TextField
          label={intl.formatMessage({ id: 'admin.invoiceSettings.footer', defaultMessage: 'Footer' })}
          value={settings.footer}
          onChange={(event) => updateField('footer', event.target.value)}
          multiline
          minRows={2}
          fullWidth
        />

        <Box display="flex" justifyContent="flex-end" gap={1.5}>
          <Button variant="outlined" onClick={() => void handlePreview()} disabled={previewing || saving}>
            {previewing
              ? intl.formatMessage({ id: 'admin.invoiceSettings.previewing', defaultMessage: 'Generating...' })
              : intl.formatMessage({ id: 'admin.invoiceSettings.preview', defaultMessage: 'Preview PDF' })}
          </Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
            <FormattedMessage id="admin.invoiceSettings.save" defaultMessage="Save" />
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
