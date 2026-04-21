import { useEffect, useMemo, useState } from 'react';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Collapse,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

interface CreditInventoryResponse {
  item: {
    id: number;
    balance: number;
    discountRateBps: number;
    discountRate: number;
    maxOrderAmount: number;
    createdAt: string;
    updatedAt: string;
  } | null;
}

interface CreditInventoryCardProps {
  defaultExpanded?: boolean;
}

export default function CreditInventoryCard({ defaultExpanded = false }: CreditInventoryCardProps) {
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [balance, setBalance] = useState('0');
  const [discountRate, setDiscountRate] = useState('0.85');

  useEffect(() => {
    let active = true;

    const loadInventory = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/credits/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to load credit inventory');
        }

        const payload = await response.json() as CreditInventoryResponse;
        if (!active) {
          return;
        }

        if (payload.item) {
          setBalance(String(payload.item.balance));
          setDiscountRate(String(payload.item.discountRate));
        }
      } catch (loadError) {
        if (!active) {
          return;
        }

        console.error(loadError);
        setError(intl.formatMessage({
          id: 'reseller.creditInventory.loadError',
          defaultMessage: 'Failed to load credit inventory settings.',
        }));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadInventory();

    return () => {
      active = false;
    };
  }, [intl, token]);

  const parsedBalance = Math.max(0, Math.trunc(Number(balance) || 0));
  const parsedDiscountRate = Number(discountRate) || 0;

  const quotePreview = useMemo(() => {
    if (!Number.isFinite(parsedDiscountRate) || parsedDiscountRate <= 0) {
      return 'US$20 + invalid multiplier x (credit amount - US$20)';
    }

    return `US$20 + ${parsedDiscountRate.toFixed(2)} x (credit amount - US$20)`;
  }, [parsedDiscountRate]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/market/credits/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          balance: parsedBalance,
          discountRate: parsedDiscountRate,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save credit inventory');
      }

      const payload = await response.json() as CreditInventoryResponse;
      if (payload.item) {
        setBalance(String(payload.item.balance));
        setDiscountRate(String(payload.item.discountRate));
      }

      setSuccess(intl.formatMessage({
        id: 'reseller.creditInventory.saveSuccess',
        defaultMessage: 'Credit inventory settings saved.',
      }));
    } catch (saveError) {
      console.error(saveError);
      setError(intl.formatMessage({
        id: 'reseller.creditInventory.saveError',
        defaultMessage: 'Failed to save credit inventory settings.',
      }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <FormattedMessage id="reseller.creditInventory.title" defaultMessage="Credit Inventory" />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 720 }}>
            <FormattedMessage
              id="reseller.creditInventory.description"
              defaultMessage="Set how much credit you can sell and the multiplier used for centralized credit quotes. Orders are assigned after payment and never split across multiple sellers."
            />
          </Typography>
        </div>
        <Button
          variant="text"
          onClick={() => setExpanded((current) => !current)}
          endIcon={expanded ? <ExpandLess /> : <ExpandMore />}
          aria-expanded={expanded}
        >
          {intl.formatMessage(
            expanded
              ? { id: 'common.collapse', defaultMessage: 'Collapse' }
              : { id: 'common.expand', defaultMessage: 'Expand' },
          )}
        </Button>
      </Box>

      <Collapse in={expanded} timeout="auto">
        {loading ? (
          <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            <Box sx={{ mt: 3, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
              <TextField
                label={intl.formatMessage({ id: 'reseller.creditInventory.balance', defaultMessage: 'Balance' })}
                type="number"
                value={balance}
                onChange={(event) => setBalance(event.target.value)}
                inputProps={{ min: 0, step: 1 }}
                helperText={intl.formatMessage({
                  id: 'reseller.creditInventory.balanceHelp',
                  defaultMessage: 'Supports credit amounts up to your balance plus US$20.',
                })}
              />
              <TextField
                label={intl.formatMessage({ id: 'reseller.creditInventory.discountRate', defaultMessage: 'Discount Multiplier' })}
                type="number"
                value={discountRate}
                onChange={(event) => setDiscountRate(event.target.value)}
                inputProps={{ min: 0.01, max: 1, step: 0.01 }}
                helperText={intl.formatMessage({
                  id: 'reseller.creditInventory.discountRateHelp',
                  defaultMessage: 'Example: 0.85 means US$20 + 0.85 x (amount - US$20).',
                })}
              />
            </Box>

            <Box sx={{ mt: 3, display: 'grid', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <FormattedMessage
                  id="reseller.creditInventory.maxOrder"
                  defaultMessage="Maximum supported face value: US${amount}"
                  values={{ amount: parsedBalance + 20 }}
                />
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <FormattedMessage
                  id="reseller.creditInventory.quotePreview"
                  defaultMessage="Quote preview: {quote}"
                  values={{ quote: quotePreview }}
                />
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mt: 3 }}>
                {error}
              </Alert>
            )}

            {success && (
              <Alert severity="success" sx={{ mt: 3 }}>
                {success}
              </Alert>
            )}

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" onClick={handleSave} disabled={saving}>
                <FormattedMessage id="common.save" defaultMessage="Save" />
              </Button>
            </Box>
          </>
        )}
      </Collapse>
    </Paper>
  );
}
