import { useEffect, useReducer } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useAuthApi } from '@/hooks';
import { AdminTicketListResponse, TicketStatus } from '@/types';
import { buildTicketListPath, initialTicketListState, ticketListReducer, TICKETS_PAGE_SIZE, lastTicketPage } from './ticketPagination';
import { formatOrderPublicId } from '@/utils/orderId';

type TicketsManagerProps = {
  showOpenPageButton?: boolean;
  showHeader?: boolean;
};

export default function TicketsManager({ showOpenPageButton = true, showHeader = true }: TicketsManagerProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [listState, dispatch] = useReducer(ticketListReducer, initialTicketListState);
  const { page, statusFilter, query } = listState;
  const listPath = buildTicketListPath(listState);

  const { data, error, isLoading } = useAuthApi<AdminTicketListResponse>(listPath, {
    revalidateOnFocus: true,
    keepPreviousData: false,
  });

  // A refresh can reduce the total (for example after a ticket is closed).
  // Only reconcile a response for this page, never a previous request's data.
  const currentData = data?.page === page + 1 ? data : undefined;
  const total = currentData?.total ?? 0;
  const pageOutOfRange = Boolean(currentData && page > lastTicketPage(total));
  useEffect(() => {
    if (currentData) dispatch({ type: 'total', total: currentData.total });
  }, [currentData]);

  const tickets = pageOutOfRange ? [] : currentData?.tickets || [];
  const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString(intl.locale) : '-';

  return (
    <Box sx={{ display: 'grid', gap: 3, textAlign: 'left' }}>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 3 }}>
        {showHeader && (
          <>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              <FormattedMessage id="admin.tickets.title" defaultMessage="Support Tickets" />
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              <FormattedMessage id="admin.tickets.description" defaultMessage="Review user support tickets, reply to messages, and close resolved requests." />
            </Typography>
          </>
        )}

        <Box sx={{ mt: showHeader ? 2 : 0, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            select
            label={intl.formatMessage({ id: 'admin.tickets.filter.status', defaultMessage: 'Status' })}
            value={statusFilter}
            onChange={(event) => dispatch({ type: 'status', value: event.target.value as 'all' | TicketStatus })}
            size="small"
            sx={{
              minWidth: 180,
              '& .MuiSelect-select': {
                textAlign: 'left',
              },
              '& .MuiInputBase-input': {
                textAlign: 'left',
              },
            }}
          >
            <MenuItem value="all">
              <FormattedMessage id="admin.tickets.filter.all" defaultMessage="All" />
            </MenuItem>
            <MenuItem value="open">
              <FormattedMessage id="tickets.status.open" defaultMessage="Open" />
            </MenuItem>
            <MenuItem value="closed">
              <FormattedMessage id="tickets.status.closed" defaultMessage="Closed" />
            </MenuItem>
          </TextField>
          <TextField
            label={intl.formatMessage({ id: 'admin.tickets.filter.query', defaultMessage: 'Search tickets' })}
            value={query}
            onChange={(event) => dispatch({ type: 'query', value: event.target.value })}
            size="small"
            sx={{
              minWidth: 260,
              '& .MuiInputBase-input': {
                textAlign: 'left',
              },
            }}
          />
          {showOpenPageButton && (
            <Button onClick={() => navigate('/admin/tickets')}>
              <FormattedMessage id="admin.tickets.openPage" defaultMessage="Open Full Page" />
            </Button>
          )}
        </Box>
      </Paper>

      {error && (
        <Alert severity="error">
          <FormattedMessage id="admin.tickets.loadError" defaultMessage="Failed to load tickets." />
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <FormattedMessage id="tickets.table.subject" defaultMessage="Subject" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="admin.tickets.table.user" defaultMessage="User" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="tickets.table.status" defaultMessage="Status" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="tickets.table.order" defaultMessage="Related Order" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="tickets.table.updatedAt" defaultMessage="Updated At" />
              </TableCell>
              <TableCell align="right">
                <FormattedMessage id="tickets.table.actions" defaultMessage="Actions" />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading || pageOutOfRange ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <FormattedMessage id="loading" defaultMessage="Loading..." />
                </TableCell>
              </TableRow>
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <FormattedMessage id="admin.tickets.empty" defaultMessage="No tickets matched the current filter." />
                </TableCell>
              </TableRow>
            ) : tickets.map((ticket) => (
              <TableRow key={ticket.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{ticket.subject}</Typography>
                  <Typography variant="caption" color="text.secondary">{ticket.id}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{ticket.user?.name || ticket.user?.email || '-'}</Typography>
                  <Typography variant="caption" color="text.secondary">{ticket.user?.email || '-'}</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={ticket.status === 'open' ? 'success' : 'default'}
                    label={ticket.status === 'open'
                      ? intl.formatMessage({ id: 'tickets.status.open', defaultMessage: 'Open' })
                      : intl.formatMessage({ id: 'tickets.status.closed', defaultMessage: 'Closed' })}
                  />
                </TableCell>
                <TableCell>{ticket.relatedOrder?.id ? formatOrderPublicId(ticket.relatedOrder.id) : '-'}</TableCell>
                <TableCell>{formatDateTime(ticket.updatedAt)}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => navigate(`/admin/tickets/${ticket.id}`)}>
                    <FormattedMessage id="common.view" defaultMessage="View" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {currentData && !pageOutOfRange && (
        <TablePagination
          component="div"
          count={total}
          page={page}
          rowsPerPage={TICKETS_PAGE_SIZE}
          rowsPerPageOptions={[TICKETS_PAGE_SIZE]}
          onPageChange={(_event, nextPage) => dispatch({ type: 'page', page: nextPage, total })}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'Total' })} ${count}`}
        />
      )}
    </Box>
  );
}
