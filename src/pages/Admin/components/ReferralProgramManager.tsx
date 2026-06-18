import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useAdminReferrals } from '@/hooks';
import { AdminReferralListItem, AdminReferralTierProgress } from '@/types';
import { formatUsdPrice } from '@/pages/Market/marketI18n';

function formatDateTime(value?: string | null, locale = 'en') {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale);
}

function getUserLabel(user: { email: string; name?: string | null }) {
  return user.name?.trim() || user.email;
}

function ReferralUserBlock({
  user,
  extra,
}: {
  user: { id: string; email: string; name?: string | null; referralCode?: string | null };
  extra?: string;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {getUserLabel(user)}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
        {user.email}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
        {user.id}
      </Typography>
      {user.referralCode ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {user.referralCode}
        </Typography>
      ) : null}
      {extra ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {extra}
        </Typography>
      ) : null}
    </Box>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 2, minHeight: 92 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ mt: 0.75, fontWeight: 800 }}>
        {value}
      </Typography>
    </Paper>
  );
}

function TierProgress({
  tier,
  locale,
}: {
  tier: AdminReferralTierProgress;
  locale: string;
}) {
  return (
    <Box sx={{ display: 'grid', gap: 0.5, minWidth: 220 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          {formatUsdPrice(locale, tier.thresholdAmount)}
        </Typography>
        <Chip
          size="small"
          color={tier.achieved ? tier.available ? 'success' : 'warning' : 'default'}
          variant={tier.achieved ? 'filled' : 'outlined'}
          label={tier.achieved
            ? tier.available
              ? <FormattedMessage id="admin.referrals.status.available" defaultMessage="Available" />
              : <FormattedMessage id="admin.referrals.status.pending" defaultMessage="Pending" />
            : <FormattedMessage id="admin.referrals.status.inProgress" defaultMessage="In progress" />}
          sx={{ height: 22 }}
        />
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.max(0, Math.min(100, tier.progressPercent))}
        sx={{ height: 7, borderRadius: 0 }}
      />
      <Typography variant="caption" color="text.secondary">
        <FormattedMessage
          id="admin.referrals.tierReward"
          defaultMessage="{progress} / {threshold}, reward {reward}"
          values={{
            progress: formatUsdPrice(locale, tier.progressAmount),
            threshold: formatUsdPrice(locale, tier.thresholdAmount),
            reward: formatUsdPrice(locale, tier.rewardAmount),
          }}
        />
      </Typography>
      {tier.earnedAt ? (
        <Typography variant="caption" color="text.secondary">
          <FormattedMessage
            id="admin.referrals.tierEarned"
            defaultMessage="Earned {earnedAt}, available {availableAt}"
            values={{
              earnedAt: formatDateTime(tier.earnedAt, locale),
              availableAt: formatDateTime(tier.availableAt, locale),
            }}
          />
        </Typography>
      ) : null}
    </Box>
  );
}

function RewardSummary({
  relationship,
  locale,
}: {
  relationship: AdminReferralListItem;
  locale: string;
}) {
  return (
    <Stack spacing={0.75} alignItems="flex-start">
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        <FormattedMessage
          id="admin.referrals.rewardEarned"
          defaultMessage="Earned {amount}"
          values={{ amount: formatUsdPrice(locale, relationship.earnedReward) }}
        />
      </Typography>
      <Chip
        size="small"
        color="success"
        variant="outlined"
        label={(
          <FormattedMessage
            id="admin.referrals.rewardAvailable"
            defaultMessage="Available {amount}"
            values={{ amount: formatUsdPrice(locale, relationship.availableReward) }}
          />
        )}
      />
      <Chip
        size="small"
        color={relationship.pendingReward > 0 ? 'warning' : 'default'}
        variant="outlined"
        label={(
          <FormattedMessage
            id="admin.referrals.rewardPending"
            defaultMessage="Pending {amount}"
            values={{ amount: formatUsdPrice(locale, relationship.pendingReward) }}
          />
        )}
      />
      {relationship.nextThresholdAmount ? (
        <Typography variant="caption" color="text.secondary">
          <FormattedMessage
            id="admin.referrals.nextTarget"
            defaultMessage="Next: {threshold} for {reward}"
            values={{
              threshold: formatUsdPrice(locale, relationship.nextThresholdAmount),
              reward: formatUsdPrice(locale, relationship.nextRewardAmount || 0),
            }}
          />
        </Typography>
      ) : (
        <Typography variant="caption" color="text.secondary">
          <FormattedMessage id="admin.referrals.allTargetsReached" defaultMessage="All targets reached" />
        </Typography>
      )}
    </Stack>
  );
}

export default function ReferralProgramManager() {
  const intl = useIntl();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const { data, error, isLoading } = useAdminReferrals({
    page: page + 1,
    limit: rowsPerPage,
    query,
  });
  const relationships = data?.relationships || [];
  const summary = data?.summary;
  const total = data?.pagination.total || 0;

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          <FormattedMessage id="admin.referrals.title" defaultMessage="Referral Relationships" />
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          <FormattedMessage
            id="admin.referrals.description"
            defaultMessage="Review inviter and invitee relationships, paid order progress, and reward settlement state."
          />
        </Typography>
        <TextField
          label={intl.formatMessage({ id: 'admin.referrals.search', defaultMessage: 'Search referrals' })}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          size="small"
          sx={{ mt: 2, minWidth: { xs: '100%', md: 360 } }}
        />
      </Paper>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(5, minmax(0, 1fr))' } }}>
        <SummaryMetric
          label={<FormattedMessage id="admin.referrals.summary.relationships" defaultMessage="Relationships" />}
          value={summary?.totalRelationships ?? 0}
        />
        <SummaryMetric
          label={<FormattedMessage id="admin.referrals.summary.paidSubtotal" defaultMessage="Paid subtotal" />}
          value={formatUsdPrice(intl.locale, summary?.totalPaidSubtotal || 0)}
        />
        <SummaryMetric
          label={<FormattedMessage id="admin.referrals.summary.earnedReward" defaultMessage="Earned rewards" />}
          value={formatUsdPrice(intl.locale, summary?.totalEarnedReward || 0)}
        />
        <SummaryMetric
          label={<FormattedMessage id="admin.referrals.summary.availableReward" defaultMessage="Available rewards" />}
          value={formatUsdPrice(intl.locale, summary?.totalAvailableReward || 0)}
        />
        <SummaryMetric
          label={<FormattedMessage id="admin.referrals.summary.pendingReward" defaultMessage="Pending rewards" />}
          value={formatUsdPrice(intl.locale, summary?.totalPendingReward || 0)}
        />
      </Box>

      {error ? (
        <Alert severity="error">
          <FormattedMessage id="admin.referrals.loadError" defaultMessage="Failed to load referrals." />
        </Alert>
      ) : null}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <FormattedMessage id="admin.referrals.table.inviter" defaultMessage="Inviter" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.referrals.table.invitee" defaultMessage="Invitee" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.referrals.table.paidSubtotal" defaultMessage="Paid subtotal" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.referrals.table.targets" defaultMessage="Targets" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.referrals.table.rewards" defaultMessage="Rewards" />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                    <CircularProgress size={18} />
                    <FormattedMessage id="loading" defaultMessage="Loading..." />
                  </Stack>
                </TableCell>
              </TableRow>
            ) : relationships.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <FormattedMessage id="admin.referrals.empty" defaultMessage="No referral relationships matched the current filter." />
                </TableCell>
              </TableRow>
            ) : relationships.map((relationship) => (
              <TableRow key={relationship.invitee.id} hover>
                <TableCell>
                  <ReferralUserBlock user={relationship.inviter} />
                </TableCell>
                <TableCell>
                  <ReferralUserBlock
                    user={relationship.invitee}
                    extra={intl.formatMessage(
                      { id: 'admin.referrals.inviteeCreatedAt', defaultMessage: 'Created {date}' },
                      { date: formatDateTime(relationship.invitee.createdAt, intl.locale) },
                    )}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {formatUsdPrice(intl.locale, relationship.paidSubtotal)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack spacing={1.25}>
                    {relationship.tiers.map((tier) => (
                      <TierProgress
                        key={`${relationship.invitee.id}:${tier.thresholdAmount}`}
                        tier={tier}
                        locale={intl.locale}
                      />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>
                  <RewardSummary relationship={relationship} locale={intl.locale} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_event, nextPage) => setPage(nextPage)}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(parseInt(event.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[20, 50, 100]}
        labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: 'Rows per page:' })}
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'Total' })} ${count}`}
      />
    </Box>
  );
}
