import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Copy, Mail, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  AdminUserSearchItem,
  ListingItem,
  MarketingOffer,
  MarketingOfferResponse,
} from '@/types';
import { useAdminMarketSearch, useAdminMarketingOffers, useAdminUserSearch } from '@/hooks/swr/admin/useMarketingOffers';
import { formatUsdPrice } from '@/pages/Market/marketI18n';
import { getAvailableStock } from '@/pages/Market/marketUtils';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

interface SelectedOfferItem {
  item: ListingItem;
  quantity: number;
}

function getOfferStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  if (status === 'active') return 'success';
  if (status === 'creating') return 'info';
  if (status === 'used') return 'default';
  if (status === 'expired') return 'warning';
  if (status === 'failed' || status === 'canceled') return 'error';
  return 'default';
}

const marketingOfferStatusMessages: Record<string, { id: string; defaultMessage: string }> = {
  creating: { id: 'marketingOffer.status.creating', defaultMessage: 'Creating' },
  active: { id: 'marketingOffer.status.active', defaultMessage: 'Active' },
  failed: { id: 'marketingOffer.status.failed', defaultMessage: 'Failed' },
  canceled: { id: 'marketingOffer.status.canceled', defaultMessage: 'Canceled' },
  used: { id: 'marketingOffer.status.used', defaultMessage: 'Used' },
  expired: { id: 'marketingOffer.status.expired', defaultMessage: 'Expired' },
};

function getMarketingOfferStatusMessage(status: string) {
  return marketingOfferStatusMessages[status] || { id: 'marketingOffer.status.unknown', defaultMessage: 'Unknown' };
}

function defaultExpiresAt() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

export default function MarketingOffersManager() {
  const intl = useIntl();
  const { token } = useSelector((state: RootState) => state.user.user);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserSearchItem | null>(null);
  const [itemQuery, setItemQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedOfferItem[]>([]);
  const defaultOfferTitle = intl.formatMessage({
    id: 'admin.marketingOffers.defaultTitle',
    defaultMessage: 'Private bundle offer',
  });
  const [title, setTitle] = useState(defaultOfferTitle);
  const [amountOff, setAmountOff] = useState('5');
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt());
  const [serviceFeeEnabled, setServiceFeeEnabled] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [adminNote, setAdminNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: usersData, isLoading: usersLoading } = useAdminUserSearch(userQuery);
  const { data: marketData, isLoading: marketLoading } = useAdminMarketSearch({
    search: itemQuery,
    inStockOnly: true,
    groupCcus: false,
    itemTypes: ['ccu', 'package', 'misc'],
    page: 0,
    limit: 12,
  });
  const { data: offersData, isLoading: offersLoading, mutate } = useAdminMarketingOffers({
    page: 1,
    limit: 20,
    search,
  });

  const subtotal = selectedItems.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0);
  const discount = Math.min(Number(amountOff) || 0, subtotal);
  const serviceFee = serviceFeeEnabled && subtotal < 20 && subtotal > 0 ? 0.99 : 0;
  const total = Math.max(subtotal - discount, 0) + serviceFee;
  const userOptions = usersData?.users || [];
  const listingItems = marketData?.items || [];
  const itemOptions = listingItems.filter((item) => item.itemType !== 'credit');

  useEffect(() => {
    if (message) {
      const timeoutId = window.setTimeout(() => setMessage(null), 6000);
      return () => window.clearTimeout(timeoutId);
    }
  }, [message]);

  const selectedSkuIds = useMemo(() => new Set(selectedItems.map((entry) => entry.item.skuId)), [selectedItems]);

  const addItem = (item: ListingItem | null) => {
    if (!item || selectedSkuIds.has(item.skuId)) return;
    setSelectedItems((current) => [...current, { item, quantity: 1 }]);
    setItemQuery('');
  };

  const updateItemQuantity = (skuId: string, quantity: number) => {
    setSelectedItems((current) => current.map((entry) => entry.item.skuId === skuId
      ? { ...entry, quantity: Math.max(1, Math.min(quantity, getAvailableStock(entry.item))) }
      : entry));
  };

  const createOffer = async () => {
    if (!selectedUser || selectedItems.length === 0) {
      setMessage(intl.formatMessage({
        id: 'admin.marketingOffers.validationUserAndItem',
        defaultMessage: 'Please select a user and at least one item.',
      }));
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/marketing-offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          title,
          amountOff: Number(amountOff),
          expiresAt: new Date(expiresAt).toISOString(),
          serviceFeeEnabled,
          sendEmail,
          adminNote,
          items: selectedItems.map((entry) => ({
            skuId: entry.item.skuId,
            quantity: entry.quantity,
          })),
        }),
      });

      const result = await response.json().catch(() => null) as MarketingOfferResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error(result && 'error' in result && result.error
          ? result.error
          : intl.formatMessage({
            id: 'admin.marketingOffers.createError',
            defaultMessage: 'Failed to create offer.',
          }));
      }

      setSelectedItems([]);
      setSelectedUser(null);
      setUserQuery('');
      setTitle(defaultOfferTitle);
      setAmountOff('5');
      setExpiresAt(defaultExpiresAt());
      setAdminNote('');
      await mutate();
      setMessage(intl.formatMessage({
        id: 'admin.marketingOffers.createSuccess',
        defaultMessage: 'Marketing offer created.',
      }));
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : intl.formatMessage({
          id: 'admin.marketingOffers.createError',
          defaultMessage: 'Failed to create offer.',
        }));
    } finally {
      setCreating(false);
    }
  };

  const postOfferAction = async (offer: MarketingOffer, action: 'send-email' | 'cancel') => {
    setActionLoadingId(`${offer.id}:${action}`);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/marketing-offers/${encodeURIComponent(offer.id)}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || intl.formatMessage(
          {
            id: 'admin.marketingOffers.actionError',
            defaultMessage: 'Failed to {action}.',
          },
          {
            action: action === 'send-email'
              ? intl.formatMessage({ id: 'admin.marketingOffers.actionSendEmail', defaultMessage: 'send email' })
              : intl.formatMessage({ id: 'admin.marketingOffers.actionCancel', defaultMessage: 'cancel' }),
          },
        ));
      }

      await mutate();
      setMessage(action === 'send-email'
        ? intl.formatMessage({ id: 'admin.marketingOffers.emailQueued', defaultMessage: 'Email queued.' })
        : intl.formatMessage({ id: 'admin.marketingOffers.cancelSuccess', defaultMessage: 'Offer canceled.' }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : intl.formatMessage(
        {
          id: 'admin.marketingOffers.actionError',
          defaultMessage: 'Failed to {action}.',
        },
        {
          action: action === 'send-email'
            ? intl.formatMessage({ id: 'admin.marketingOffers.actionSendEmail', defaultMessage: 'send email' })
            : intl.formatMessage({ id: 'admin.marketingOffers.actionCancel', defaultMessage: 'cancel' }),
        },
      ));
    } finally {
      setActionLoadingId(null);
    }
  };

  const copyOfferLink = async (offer: MarketingOffer) => {
    await navigator.clipboard.writeText(offer.offerUrl);
    setMessage(intl.formatMessage({ id: 'admin.marketingOffers.linkCopied', defaultMessage: 'Offer link copied.' }));
  };

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              <FormattedMessage id="admin.marketingOffers.title" defaultMessage="Marketing Offers" />
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              <FormattedMessage
                id="admin.marketingOffers.description"
                defaultMessage="Create user-bound bundle discounts for existing market listings."
              />
            </Typography>
          </Box>

          {message && (
            <Alert severity={
              message === intl.formatMessage({
                id: 'admin.marketingOffers.createSuccess',
                defaultMessage: 'Marketing offer created.',
              })
              || message === intl.formatMessage({ id: 'admin.marketingOffers.emailQueued', defaultMessage: 'Email queued.' })
              || message === intl.formatMessage({ id: 'admin.marketingOffers.cancelSuccess', defaultMessage: 'Offer canceled.' })
              || message === intl.formatMessage({ id: 'admin.marketingOffers.linkCopied', defaultMessage: 'Offer link copied.' })
                ? 'success'
                : 'error'
            }>
              {message}
            </Alert>
          )}

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
            <Autocomplete
              value={selectedUser}
              options={userOptions}
              loading={usersLoading}
              getOptionLabel={(option) => `${option.email}${option.name ? ` (${option.name})` : ''}`}
              onChange={(_, value) => setSelectedUser(value)}
              inputValue={userQuery}
              onInputChange={(_, value) => setUserQuery(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={intl.formatMessage({ id: 'admin.marketingOffers.targetUser', defaultMessage: 'Target user' })}
                  placeholder={intl.formatMessage({ id: 'admin.marketingOffers.userPlaceholder', defaultMessage: 'email, name, or user ID' })}
                />
              )}
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingOffers.offerTitle', defaultMessage: 'Offer title' })}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Box>

          <Autocomplete
            value={null}
            options={itemOptions}
            loading={marketLoading}
            getOptionDisabled={(option) => selectedSkuIds.has(option.skuId)}
            getOptionLabel={(option) => intl.formatMessage(
              {
                id: 'admin.marketingOffers.itemOption',
                defaultMessage: '{name} · {price} · stock {stock}{visibility}',
              },
              {
                name: option.name,
                price: formatUsdPrice(intl.locale, option.price),
                stock: getAvailableStock(option),
                visibility: option.visibleInMarket === false
                  ? intl.formatMessage({
                    id: 'admin.marketingOffers.hiddenListingSuffix',
                    defaultMessage: ' · hidden',
                  })
                  : '',
              },
            )}
            onChange={(_, value) => addItem(value)}
            inputValue={itemQuery}
            onInputChange={(_, value) => setItemQuery(value)}
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'admin.marketingOffers.addItem', defaultMessage: 'Add market item' })}
                placeholder={intl.formatMessage({ id: 'admin.marketingOffers.itemPlaceholder', defaultMessage: 'Search market listings' })}
              />
            )}
          />

          {selectedItems.length > 0 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><FormattedMessage id="admin.marketingOffers.table.item" defaultMessage="Item" /></TableCell>
                    <TableCell width={120}><FormattedMessage id="admin.marketingOffers.table.unit" defaultMessage="Unit" /></TableCell>
                    <TableCell width={140}><FormattedMessage id="checkout.quantity" defaultMessage="Quantity" /></TableCell>
                    <TableCell width={120}><FormattedMessage id="checkout.subtotal" defaultMessage="Subtotal" /></TableCell>
                    <TableCell width={56} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedItems.map((entry) => (
                    <TableRow key={entry.item.skuId}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.item.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{entry.item.skuId}</Typography>
                        {entry.item.visibleInMarket === false && (
                          <Chip
                            size="small"
                            variant="outlined"
                            sx={{ ml: 1 }}
                            label={intl.formatMessage({
                              id: 'market.listing.hiddenFromMarket',
                              defaultMessage: 'Hidden from market list',
                            })}
                          />
                        )}
                      </TableCell>
                      <TableCell>{formatUsdPrice(intl.locale, entry.item.price)}</TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          type="number"
                          value={entry.quantity}
                          inputProps={{ min: 1, max: getAvailableStock(entry.item) }}
                          onChange={(event) => updateItemQuantity(entry.item.skuId, Number(event.target.value))}
                        />
                      </TableCell>
                      <TableCell>{formatUsdPrice(intl.locale, entry.item.price * entry.quantity)}</TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => setSelectedItems((current) => current.filter((item) => item.item.skuId !== entry.item.skuId))}>
                          <X className="h-4 w-4" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }} gap={2}>
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingOffers.amountOff', defaultMessage: 'Discount amount (USD)' })}
              type="number"
              value={amountOff}
              inputProps={{ min: 0.01, step: 0.01 }}
              onChange={(event) => setAmountOff(event.target.value)}
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingOffers.expiresAt', defaultMessage: 'Expires at' })}
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <FormControlLabel
              control={<Checkbox checked={serviceFeeEnabled} onChange={(event) => setServiceFeeEnabled(event.target.checked)} />}
              label={intl.formatMessage({ id: 'admin.marketingOffers.serviceFeeEnabled', defaultMessage: 'Charge software service fee' })}
            />
            <FormControlLabel
              control={<Checkbox checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />}
              label={intl.formatMessage({ id: 'admin.marketingOffers.sendEmail', defaultMessage: 'Send email now' })}
            />
          </Box>

          <TextField
            label={intl.formatMessage({ id: 'admin.marketingOffers.adminNote', defaultMessage: 'Admin note' })}
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            multiline
            minRows={2}
          />

          <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
            <Typography variant="body2">
              <FormattedMessage
                id="admin.marketingOffers.summarySubtotal"
                defaultMessage="Subtotal {amount}"
                values={{ amount: formatUsdPrice(intl.locale, subtotal) }}
              />
            </Typography>
            <Typography variant="body2">
              <FormattedMessage
                id="admin.marketingOffers.summaryDiscount"
                defaultMessage="Discount -{amount}"
                values={{ amount: formatUsdPrice(intl.locale, discount) }}
              />
            </Typography>
            <Typography variant="body2">
              <FormattedMessage
                id="admin.marketingOffers.summaryServiceFee"
                defaultMessage="Service fee {amount}"
                values={{ amount: formatUsdPrice(intl.locale, serviceFee) }}
              />
            </Typography>
            <Typography variant="subtitle2">
              <FormattedMessage
                id="admin.marketingOffers.summaryTotal"
                defaultMessage="Total {amount}"
                values={{ amount: formatUsdPrice(intl.locale, total) }}
              />
            </Typography>
            <Button
              variant="contained"
              startIcon={creating ? <CircularProgress size={16} /> : <Plus className="h-4 w-4" />}
              onClick={() => void createOffer()}
              disabled={creating}
            >
              <FormattedMessage id="admin.marketingOffers.createOffer" defaultMessage="Create offer" />
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
        <Stack spacing={2}>
          <Box display="flex" gap={2} alignItems="center" justifyContent="space-between" flexWrap="wrap">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              <FormattedMessage id="admin.marketingOffers.recentOffers" defaultMessage="Recent offers" />
            </Typography>
            <Box display="flex" gap={1}>
              <TextField
                size="small"
                placeholder={intl.formatMessage({ id: 'admin.marketingOffers.searchOffers', defaultMessage: 'Search offers' })}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Tooltip title={intl.formatMessage({ id: 'common.refresh', defaultMessage: 'Refresh' })}>
                <IconButton onClick={() => void mutate()}>
                  <RefreshCw className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          <Divider />

          {offersLoading ? (
            <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><FormattedMessage id="admin.marketingOffers.table.offer" defaultMessage="Offer" /></TableCell>
                    <TableCell><FormattedMessage id="admin.marketingOffers.table.user" defaultMessage="User" /></TableCell>
                    <TableCell><FormattedMessage id="orders.status" defaultMessage="Status" /></TableCell>
                    <TableCell><FormattedMessage id="admin.marketingOffers.table.value" defaultMessage="Value" /></TableCell>
                    <TableCell><FormattedMessage id="marketingOffer.expires" defaultMessage="Expires" /></TableCell>
                    <TableCell align="right"><FormattedMessage id="admin.marketingOffers.table.actions" defaultMessage="Actions" /></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(offersData?.offers || []).map((offer) => (
                    <TableRow key={offer.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{offer.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          <FormattedMessage
                            id="admin.marketingOffers.itemCount"
                            defaultMessage="{count, plural, one {# item} other {# items}}"
                            values={{ count: offer.items.length }}
                          />
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{offer.user?.email || '-'}</Typography>
                        {offer.user?.name && <Typography variant="caption" color="text.secondary">{offer.user.name}</Typography>}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={getOfferStatusColor(offer.status)}
                          label={intl.formatMessage(getMarketingOfferStatusMessage(offer.status))}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">-{formatUsdPrice(intl.locale, offer.discountAmount)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          <FormattedMessage
                            id="admin.marketingOffers.summaryTotal"
                            defaultMessage="Total {amount}"
                            values={{ amount: formatUsdPrice(intl.locale, offer.total) }}
                          />
                        </Typography>
                      </TableCell>
                      <TableCell>{new Date(offer.expiresAt).toLocaleString(intl.locale)}</TableCell>
                      <TableCell align="right">
                        <Tooltip title={intl.formatMessage({ id: 'admin.marketingOffers.copyLink', defaultMessage: 'Copy link' })}>
                          <IconButton size="small" onClick={() => void copyOfferLink(offer)}>
                            <Copy className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={intl.formatMessage({ id: 'admin.marketingOffers.sendEmailAction', defaultMessage: 'Send email' })}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={actionLoadingId === `${offer.id}:send-email`}
                              onClick={() => void postOfferAction(offer, 'send-email')}
                            >
                              <Mail className="h-4 w-4" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={intl.formatMessage({ id: 'admin.marketingOffers.cancelOffer', defaultMessage: 'Cancel offer' })}>
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              disabled={offer.status !== 'active' || actionLoadingId === `${offer.id}:cancel`}
                              onClick={() => void postOfferAction(offer, 'cancel')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
