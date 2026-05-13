import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { NewUserCouponSettings } from '@/types';
import { useAdminNewUserCouponSettings } from '@/hooks/swr/useNewUserCoupon';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export default function NewUserCouponSettingsManager() {
  const intl = useIntl();
  const { token } = useSelector((state: RootState) => state.user.user);
  const { data, error, isLoading, mutate } = useAdminNewUserCouponSettings();
  const [settings, setSettings] = useState<NewUserCouponSettings>({
    enabled: false,
    currency: 'usd',
    tiers: [{ amountOff: 5, minimumAmount: 20, probability: 1 }],
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setSettings({
        ...data,
        tiers: data.tiers.map((tier) => ({
          ...tier,
          amountOff: tier.amountOff / 100,
          minimumAmount: tier.minimumAmount / 100,
        })),
      });
    }
  }, [data]);

  const updateTier = (index: number, key: 'amountOff' | 'minimumAmount' | 'probability', value: string) => {
    const numericValue = Number(value) || 0;
    setSettings((current) => ({
      ...current,
      tiers: current.tiers.map((tier, tierIndex) => tierIndex === index ? {
        ...tier,
        [key]: numericValue,
      } : tier),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        ...settings,
        currency: 'usd',
        tiers: settings.tiers.map((tier) => ({
          amountOff: Math.round(tier.amountOff * 100),
          minimumAmount: Math.round(tier.minimumAmount * 100),
          probability: tier.probability,
        })),
      };

      const response = await fetch(`${API_BASE_URL}/api/admin/new-user-coupon-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to save settings');
      }

      await mutate();
      setMessage(intl.formatMessage({ id: 'admin.newUserCoupon.saveSuccess', defaultMessage: 'Settings saved.' }));
    } catch (saveError) {
      console.error(saveError);
      setMessage(intl.formatMessage({ id: 'admin.newUserCoupon.saveError', defaultMessage: 'Failed to save settings.' }));
    } finally {
      setSaving(false);
    }
  };

  const handleResetUserCoupon = async () => {
    const trimmedTarget = resetTarget.trim();
    if (!trimmedTarget) {
      setResetMessage(intl.formatMessage({
        id: 'admin.newUserCoupon.resetValidation',
        defaultMessage: 'Please enter a user email or user ID.',
      }));
      return;
    }

    setResetting(true);
    setResetMessage(null);

    try {
      const payload = trimmedTarget.includes('@')
        ? { email: trimmedTarget }
        : { userId: trimmedTarget };

      const response = await fetch(`${API_BASE_URL}/api/admin/new-user-coupon-settings/reset-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to reset user coupon state');
      }

      setResetMessage(intl.formatMessage({
        id: 'admin.newUserCoupon.resetSuccess',
        defaultMessage: 'User coupon eligibility has been reset.',
      }));
      setResetTarget('');
    } catch (resetError) {
      console.error(resetError);
      setResetMessage(intl.formatMessage({
        id: 'admin.newUserCoupon.resetError',
        defaultMessage: 'Failed to reset user coupon eligibility.',
      }));
    } finally {
      setResetting(false);
    }
  };

  if (isLoading) {
    return <Typography><FormattedMessage id="common.loading" defaultMessage="Loading..." /></Typography>;
  }

  return (
    <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <FormattedMessage id="admin.newUserCoupon.title" defaultMessage="New User Coupon Settings" />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <FormattedMessage
              id="admin.newUserCoupon.description"
              defaultMessage="Configure the random 24-hour signup coupon. Amount and minimum spend use USD."
            />
          </Typography>
        </Box>

        {error && (
          <Alert severity="error">
            <FormattedMessage id="admin.newUserCoupon.loadError" defaultMessage="Failed to load settings." />
          </Alert>
        )}

        {message && (
          <Alert severity={message.includes('Failed') ? 'error' : 'success'}>
            {message}
          </Alert>
        )}

        <Box display="flex" alignItems="center" gap={2}>
          <Switch
            checked={settings.enabled}
            onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
          />
          <Typography>
            <FormattedMessage id="admin.newUserCoupon.enabled" defaultMessage="Enable new user coupon campaign" />
          </Typography>
        </Box>

        {settings.tiers.map((tier, index) => (
          <Box key={index} display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }} gap={2}>
            <TextField
              label={intl.formatMessage({ id: 'admin.newUserCoupon.amountOff', defaultMessage: 'Coupon Amount (USD)' })}
              type="number"
              value={tier.amountOff}
              onChange={(event) => updateTier(index, 'amountOff', event.target.value)}
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.newUserCoupon.minimumAmount', defaultMessage: 'Minimum Spend (USD)' })}
              type="number"
              value={tier.minimumAmount}
              onChange={(event) => updateTier(index, 'minimumAmount', event.target.value)}
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.newUserCoupon.probability', defaultMessage: 'Probability Weight' })}
              type="number"
              value={tier.probability}
              onChange={(event) => updateTier(index, 'probability', event.target.value)}
            />
            <Button
              color="error"
              variant="outlined"
              disabled={settings.tiers.length <= 1}
              onClick={() => setSettings((current) => ({
                ...current,
                tiers: current.tiers.filter((_, tierIndex) => tierIndex !== index),
              }))}
            >
              <FormattedMessage id="settings.deleteMcpToken" defaultMessage="Delete" />
            </Button>
          </Box>
        ))}

        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            onClick={() => setSettings((current) => ({
              ...current,
              tiers: [...current.tiers, { amountOff: 5, minimumAmount: 20, probability: 1 }],
            }))}
          >
            <FormattedMessage id="admin.newUserCoupon.addTier" defaultMessage="Add Tier" />
          </Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
            <FormattedMessage id="admin.newUserCoupon.save" defaultMessage="Save" />
          </Button>
        </Box>

        <Divider />

        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            <FormattedMessage id="admin.newUserCoupon.resetSectionTitle" defaultMessage="Reset User Coupon Eligibility" />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <FormattedMessage
              id="admin.newUserCoupon.resetSectionDescription"
              defaultMessage="Allow a specific user to claim a new signup coupon again by clearing their current new-user coupon state."
            />
          </Typography>
        </Box>

        {resetMessage && (
          <Alert severity={resetMessage.includes('Failed') || resetMessage.includes('Please') ? 'error' : 'success'}>
            {resetMessage}
          </Alert>
        )}

        <Box display="flex" gap={2} flexDirection={{ xs: 'column', md: 'row' }}>
          <TextField
            fullWidth
            label={intl.formatMessage({
              id: 'admin.newUserCoupon.resetTarget',
              defaultMessage: 'User email or user ID',
            })}
            value={resetTarget}
            onChange={(event) => setResetTarget(event.target.value)}
          />
          <Button
            variant="contained"
            color="warning"
            onClick={() => void handleResetUserCoupon()}
            disabled={resetting}
          >
            <FormattedMessage id="admin.newUserCoupon.resetAction" defaultMessage="Reset User Coupon" />
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
