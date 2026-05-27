import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Download } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useAdminResellerSearch } from '@/hooks/swr/admin/useMarketingOffers';
import { RootState } from '@/store';
import { AdminResellerSearchItem } from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return toDateInputValue(date);
}

function getDefaultEndDate() {
  return toDateInputValue(new Date());
}

function buildLocalDateRange(startDate: string, endDate: string) {
  const startAt = new Date(`${startDate}T00:00:00.000`);
  const endAt = new Date(`${endDate}T23:59:59.999`);
  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

export default function ResellerAccountingReportManager() {
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const [resellerQuery, setResellerQuery] = useState('');
  const [selectedReseller, setSelectedReseller] = useState<AdminResellerSearchItem | null>(null);
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(getDefaultEndDate);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const { data, isLoading } = useAdminResellerSearch(resellerQuery);

  const resellerOptions = data?.resellers || [];
  const canExport = Boolean(selectedReseller && startDate && endDate && startDate <= endDate && !downloading);
  const selectedRangeLabel = useMemo(() => {
    if (!startDate || !endDate) {
      return '-';
    }

    return `${startDate} - ${endDate}`;
  }, [startDate, endDate]);

  const handleDownload = async () => {
    if (!selectedReseller) {
      setMessage({
        severity: 'error',
        text: intl.formatMessage({
          id: 'admin.accountingReport.validation.reseller',
          defaultMessage: 'Select a reseller before exporting.',
        }),
      });
      return;
    }

    if (!startDate || !endDate || startDate > endDate) {
      setMessage({
        severity: 'error',
        text: intl.formatMessage({
          id: 'admin.accountingReport.validation.dateRange',
          defaultMessage: 'Choose a valid date range.',
        }),
      });
      return;
    }

    setDownloading(true);
    setMessage(null);
    try {
      const { startAt, endAt } = buildLocalDateRange(startDate, endDate);
      const searchParams = new URLSearchParams({
        resellerId: selectedReseller.id,
        startDate,
        endDate,
        startAt,
        endAt,
      });
      const response = await fetch(`${API_BASE_URL}/api/admin/accounting/reseller-report.csv?${searchParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || intl.formatMessage({
          id: 'admin.accountingReport.exportError',
          defaultMessage: 'Failed to export accounting report.',
        }));
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/i);
      const filename = filenameMatch?.[1] || `reseller-accounting_${startDate}_${endDate}.csv`;
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      setMessage({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.accountingReport.exportSuccess',
          defaultMessage: 'Accounting report export started.',
        }),
      });
    } catch (error) {
      setMessage({
        severity: 'error',
        text: error instanceof Error
          ? error.message
          : intl.formatMessage({
              id: 'admin.accountingReport.exportError',
              defaultMessage: 'Failed to export accounting report.',
            }),
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          <FormattedMessage id="admin.accountingReport.title" defaultMessage="Reseller Accounting Report" />
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          <FormattedMessage
            id="admin.accountingReport.description"
            defaultMessage="Export a CSV accounting report for one reseller and a selected sales date range."
          />
        </Typography>

        <Stack spacing={2.5} sx={{ mt: 3, maxWidth: 760 }}>
          <Autocomplete
            options={resellerOptions}
            value={selectedReseller}
            loading={isLoading}
            onChange={(_event, value) => setSelectedReseller(value)}
            inputValue={resellerQuery}
            onInputChange={(_event, value) => setResellerQuery(value)}
            getOptionLabel={(option) => option.name ? `${option.name} (${option.email})` : option.email}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({
                  id: 'admin.accountingReport.reseller',
                  defaultMessage: 'Reseller',
                })}
                placeholder={intl.formatMessage({
                  id: 'admin.accountingReport.resellerPlaceholder',
                  defaultMessage: 'Search by email, name, or user ID',
                })}
              />
            )}
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              type="date"
              label={intl.formatMessage({
                id: 'admin.accountingReport.startDate',
                defaultMessage: 'Start Date',
              })}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              type="date"
              label={intl.formatMessage({
                id: 'admin.accountingReport.endDate',
                defaultMessage: 'End Date',
              })}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>

          <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
            <Button
              variant="contained"
              startIcon={<Download size={18} />}
              disabled={!canExport}
              onClick={() => void handleDownload()}
            >
              {downloading
                ? <FormattedMessage id="admin.accountingReport.exporting" defaultMessage="Exporting..." />
                : <FormattedMessage id="admin.accountingReport.exportCsv" defaultMessage="Export CSV" />}
            </Button>
            <Typography variant="body2" color="text.secondary">
              <FormattedMessage
                id="admin.accountingReport.selectedRange"
                defaultMessage="Range: {range}"
                values={{ range: selectedRangeLabel }}
              />
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {message && (
        <Alert severity={message.severity}>
          {message.text}
        </Alert>
      )}
    </Box>
  );
}
