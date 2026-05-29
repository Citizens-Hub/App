import { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  MenuItem,
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
import { useAdminUsers } from '@/hooks';
import { RootState } from '@/store';
import { AdminUserListItem, AdminUserRoleUpdateResponse, UserRole } from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

function getRoleLabel(role: UserRole, intl: ReturnType<typeof useIntl>) {
  switch (role) {
    case UserRole.Admin:
      return intl.formatMessage({ id: 'admin.users.role.admin', defaultMessage: 'Admin' });
    case UserRole.Reseller:
      return intl.formatMessage({ id: 'admin.users.role.reseller', defaultMessage: 'Reseller' });
    case UserRole.User:
      return intl.formatMessage({ id: 'admin.users.role.user', defaultMessage: 'User' });
    default:
      return intl.formatMessage({ id: 'admin.users.role.guest', defaultMessage: 'Guest' });
  }
}

function getRoleChipColor(role: UserRole): 'default' | 'primary' | 'secondary' | 'success' {
  if (role === UserRole.Admin) return 'primary';
  if (role === UserRole.Reseller) return 'secondary';
  if (role === UserRole.User) return 'success';
  return 'default';
}

function getUserDisplayName(user: AdminUserListItem) {
  return user.name?.trim() || user.email;
}

export default function UsersRolesManager() {
  const intl = useIntl();
  const { id: currentUserId, token } = useSelector((state: RootState) => state.user.user);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const { data, error, isLoading, mutate } = useAdminUsers({
    page: page + 1,
    limit: rowsPerPage,
    query,
    role: roleFilter,
  });

  const users = data?.users || [];
  const roles = data?.roles || [
    { value: UserRole.User, label: 'User' },
    { value: UserRole.Admin, label: 'Admin' },
    { value: UserRole.Reseller, label: 'Reseller' },
  ];
  const total = data?.pagination.total || 0;

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(intl.locale);
  };

  const handleRoleChange = async (targetUser: AdminUserListItem, nextRole: UserRole) => {
    if (targetUser.role === nextRole) {
      return;
    }

    setUpdatingUserId(targetUser.id);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(targetUser.id)}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: nextRole }),
      });

      const payload = await response.json().catch(() => null) as AdminUserRoleUpdateResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload && 'error' in payload && payload.error
          ? payload.error
          : intl.formatMessage({ id: 'admin.users.updateRoleError', defaultMessage: 'Failed to update user role.' }));
      }

      await mutate();
      setFlash({
        severity: 'success',
        text: intl.formatMessage({ id: 'admin.users.updateRoleSuccess', defaultMessage: 'User role updated.' }),
      });
    } catch (updateError) {
      setFlash({
        severity: 'error',
        text: updateError instanceof Error
          ? updateError.message
          : intl.formatMessage({ id: 'admin.users.updateRoleError', defaultMessage: 'Failed to update user role.' }),
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          <FormattedMessage id="admin.users.title" defaultMessage="Users & Roles" />
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          <FormattedMessage
            id="admin.users.description"
            defaultMessage="Search all registered users and manage their access roles."
          />
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 2 }} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            label={intl.formatMessage({ id: 'admin.users.search', defaultMessage: 'Search users' })}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            size="small"
            sx={{
              minWidth: { xs: '100%', md: 320 },
              '& .MuiInputBase-input': {
                textAlign: 'left',
              },
            }}
          />
          <TextField
            select
            label={intl.formatMessage({ id: 'admin.users.roleFilter', defaultMessage: 'Role' })}
            value={roleFilter}
            onChange={(event) => {
              const value = event.target.value;
              setRoleFilter(value === 'all' ? 'all' : Number(value) as UserRole);
              setPage(0);
            }}
            size="small"
            sx={{
              minWidth: { xs: '100%', md: 180 },
              '& .MuiInputBase-input': {
                textAlign: 'left',
              },
            }}
          >
            <MenuItem value="all">
              <FormattedMessage id="admin.users.role.all" defaultMessage="All roles" />
            </MenuItem>
            {roles.map((role) => (
              <MenuItem key={role.value} value={role.value}>
                {getRoleLabel(role.value, intl)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      {flash && (
        <Alert severity={flash.severity} onClose={() => setFlash(null)}>
          {flash.text}
        </Alert>
      )}

      {error && (
        <Alert severity="error">
          <FormattedMessage id="admin.users.loadError" defaultMessage="Failed to load users." />
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <FormattedMessage id="admin.users.table.user" defaultMessage="User" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.users.table.role" defaultMessage="Role" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.users.table.emailVerified" defaultMessage="Email" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.users.table.status" defaultMessage="Status" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.users.table.createdAt" defaultMessage="Created" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.users.table.updatedAt" defaultMessage="Updated" />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                    <CircularProgress size={18} />
                    <FormattedMessage id="loading" defaultMessage="Loading..." />
                  </Stack>
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <FormattedMessage id="admin.users.empty" defaultMessage="No users matched the current filter." />
                </TableCell>
              </TableRow>
            ) : users.map((user) => {
              const isSelf = user.id === currentUserId;
              const isUpdating = updatingUserId === user.id;

              return (
                <TableRow key={user.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Avatar src={user.avatar || undefined} alt={getUserDisplayName(user)} sx={{ width: 36, height: 36 }}>
                        {getUserDisplayName(user).slice(0, 1).toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {getUserDisplayName(user)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {user.email}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
                          {user.id}
                        </Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        select
                        size="small"
                        value={user.role}
                        disabled={isUpdating}
                        onChange={(event) => void handleRoleChange(user, Number(event.target.value) as UserRole)}
                        sx={{
                          minWidth: 140,
                          '& .MuiSelect-select': {
                            textAlign: 'left',
                          },
                        }}
                      >
                        {roles.map((role) => (
                          <MenuItem
                            key={role.value}
                            value={role.value}
                            disabled={isSelf && role.value !== UserRole.Admin}
                          >
                            {getRoleLabel(role.value, intl)}
                          </MenuItem>
                        ))}
                      </TextField>
                      {isUpdating ? (
                        <CircularProgress size={18} />
                      ) : (
                        <Chip
                          size="small"
                          color={getRoleChipColor(user.role)}
                          label={getRoleLabel(user.role, intl)}
                        />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={user.emailVerified ? 'success' : 'warning'}
                      label={user.emailVerified
                        ? intl.formatMessage({ id: 'admin.users.email.verified', defaultMessage: 'Verified' })
                        : intl.formatMessage({ id: 'admin.users.email.unverified', defaultMessage: 'Unverified' })}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={user.accountDeleted ? 'error' : 'success'}
                      label={user.accountDeleted
                        ? intl.formatMessage({ id: 'admin.users.status.deleted', defaultMessage: 'Deleted' })
                        : intl.formatMessage({ id: 'admin.users.status.active', defaultMessage: 'Active' })}
                    />
                    {user.accountDeletionRequestedAt && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {formatDateTime(user.accountDeletionRequestedAt)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                  <TableCell>{formatDateTime(user.updatedAt)}</TableCell>
                </TableRow>
              );
            })}
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
