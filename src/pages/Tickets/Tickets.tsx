import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import UpdateOutlinedIcon from '@mui/icons-material/UpdateOutlined';
import { FormattedMessage, useIntl } from 'react-intl';
import { TicketSummaryItem } from '@/types';
import { useTicketsData } from '@/hooks';
import { formatOrderPublicId } from '@/utils/orderId';
import TicketStatusChip from '@/components/tickets/TicketStatusChip';

export default function Tickets() {
  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, error, isLoading } = useTicketsData();
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(8);

  const tickets = useMemo(() => data?.tickets || [], [data]);

  useEffect(() => {
    const state = location.state as { flash?: { severity: 'success' | 'error'; text: string } } | null;
    if (state?.flash) {
      setFlash(state.flash);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString(intl.locale) : '-';
  const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(intl.locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : '-';

  const filteredTickets = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return [...tickets]
      .filter((ticket) => {
        if (!normalizedSearch) {
          return true;
        }

        const searchFields = [
          ticket.subject,
          ticket.id,
          ticket.relatedOrder?.id || '',
          ticket.lastMessage?.content || '',
          ticket.lastMessage?.author?.name || '',
          ticket.lastMessage?.author?.email || '',
        ];

        return searchFields.some((field) => field.toLowerCase().includes(normalizedSearch));
      })
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }, [tickets, searchTerm]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredTickets.length / rowsPerPage) - 1);
    setPage((currentPage) => (currentPage > maxPage ? maxPage : currentPage));
  }, [filteredTickets.length, rowsPerPage]);

  const paginatedTickets = filteredTickets.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  const openTicketsCount = tickets.filter((ticket) => ticket.status === 'open').length;
  const totalMessagesCount = tickets.reduce((sum, ticket) => sum + ticket.messageCount, 0);
  const latestTicket = filteredTickets[0] || tickets[0] || null;
  const isMobile = window.innerWidth < 768;

  const renderSummaryCard = (
    icon: React.ReactNode,
    labelId: string,
    labelDefaultMessage: string,
    value: string | number,
  ) => (
    <Box
      sx={{
        p: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        gap: 1.75,
        alignItems: 'center',
      }}
    >
      <Box
        sx={{
          width: 42,
          height: 42,
          borderRadius: '999px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'action.hover',
          color: 'primary.main',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          <FormattedMessage id={labelId} defaultMessage={labelDefaultMessage} />
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );

  if (isLoading) {
    return (
      <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-auto px-4 py-4 md:px-8 text-left">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <CircularProgress />
          </Box>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-auto px-4 py-4 md:px-8 text-left">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mt: 1 }}>
          <div>
            <Typography variant={isMobile ? 'h6' : 'h5'}>
              <FormattedMessage id="tickets.title" defaultMessage="My Tickets" />
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <FormattedMessage id="tickets.description" defaultMessage="Create a support ticket, follow replies, and track related order issues." />
            </Typography>
          </div>
          <Button variant="contained" onClick={() => navigate('/tickets/create')}>
            <FormattedMessage id="tickets.create" defaultMessage="Create Ticket" />
          </Button>
        </Box>

        {flash && <Alert severity={flash.severity}>{flash.text}</Alert>}
        {error && (
          <Alert severity="error">
            <FormattedMessage id="tickets.loadError" defaultMessage="Failed to load tickets." />
          </Alert>
        )}

        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          }}
        >
          {renderSummaryCard(
            <ConfirmationNumberOutlinedIcon fontSize="small" />,
            'tickets.summary.total',
            'Total Tickets',
            tickets.length,
          )}
          {renderSummaryCard(
            <AddCommentOutlinedIcon fontSize="small" />,
            'tickets.summary.open',
            'Open Tickets',
            openTicketsCount,
          )}
          {renderSummaryCard(
            <UpdateOutlinedIcon fontSize="small" />,
            'tickets.summary.latest',
            'Latest Activity',
            latestTicket ? formatDate(latestTicket.updatedAt) : '-',
          )}
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ flexGrow: 1, flexBasis: '100%' }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder={intl.formatMessage({ id: 'tickets.searchPlaceholder', defaultMessage: 'Search tickets, ticket ids, orders or messages...' })}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
              }}
              size="small"
            />
          </Box>
        </Box>

        {filteredTickets.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Box display="flex" justifyContent="center" alignItems="center" py={10} flexDirection="column">
              <ConfirmationNumberOutlinedIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                <FormattedMessage id="tickets.empty" defaultMessage="No tickets yet." />
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3, maxWidth: 420 }}>
                <FormattedMessage id="tickets.emptyDescription" defaultMessage="Your support conversations will appear here after you create a ticket or receive a reply." />
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate('/tickets/create')}
              >
                <FormattedMessage id="tickets.create" defaultMessage="Create Ticket" />
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {paginatedTickets.map((ticket: TicketSummaryItem) => {
              const lastMessage = ticket.lastMessage;
              const relatedOrderId = ticket.relatedOrder?.id || null;
              const messagePreview = lastMessage?.content?.trim() || intl.formatMessage({
                id: 'tickets.noMessagesPreview',
                defaultMessage: 'No message preview available yet.',
              });
              const messageAuthor = lastMessage
                ? (lastMessage.isAdmin
                  ? intl.formatMessage({ id: 'tickets.message.admin', defaultMessage: 'Support Reply' })
                  : (lastMessage.author.name || lastMessage.author.email))
                : intl.formatMessage({ id: 'tickets.message.unknown', defaultMessage: 'No messages yet' });

              return (
                <Box
                  key={ticket.id}
                  className="overflow-hidden border border-gray-100 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <Box
                    sx={{
                      display: 'grid',
                      gap: 2,
                      px: { xs: 2, md: 3 },
                      py: 2,
                      gridTemplateColumns: { xs: '1fr', lg: 'repeat(4, minmax(0, 1fr)) 220px' },
                      textAlign: 'left',
                    }}
                    className="border-b border-gray-100 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900/40"
                  >
                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        <FormattedMessage id="tickets.card.createdAt" defaultMessage="Created" />
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                        {formatDate(ticket.createdAt)}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        <FormattedMessage id="tickets.card.messageCount" defaultMessage="Messages" />
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
                        {intl.formatMessage(
                          { id: 'tickets.messageCount', defaultMessage: '{count} messages' },
                          { count: ticket.messageCount },
                        )}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        <FormattedMessage id="tickets.card.relatedOrder" defaultMessage="Related Order" />
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
                        {relatedOrderId
                          ? formatOrderPublicId(relatedOrderId)
                          : intl.formatMessage({ id: 'tickets.noRelatedOrder', defaultMessage: 'None' })}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        <FormattedMessage id="tickets.card.updatedAt" defaultMessage="Last Updated" />
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                        {formatDateTime(ticket.updatedAt)}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        <FormattedMessage id="tickets.card.ticketNumber" defaultMessage="Ticket Id" />
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{
                          mt: 0.5,
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-all',
                        }}
                      >
                        {ticket.id}
                      </Typography>
                    </Box>
                  </Box>

                  <Box
                    sx={{
                      display: 'grid',
                      gap: 3,
                      px: { xs: 2, md: 3 },
                      py: { xs: 2, md: 2.5 },
                      alignItems: 'stretch',
                      gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 220px' },
                      textAlign: 'left',
                    }}
                  >
                    <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                        <TicketStatusChip status={ticket.status} />
                        {relatedOrderId && (
                          <Button
                            size="small"
                            variant="text"
                            sx={{ px: 0.5, minWidth: 0 }}
                            onClick={() => navigate(`/orders/${relatedOrderId}`)}
                          >
                            <FormattedMessage id="tickets.openRelatedOrder" defaultMessage="Open Related Order" />
                          </Button>
                        )}
                      </Box>

                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' }}>
                          {ticket.subject}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                          <FormattedMessage
                            id="tickets.card.meta"
                            defaultMessage="Updated {updatedAt}"
                            values={{ updatedAt: formatDateTime(ticket.updatedAt) }}
                          />
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          borderRadius: 2,
                          px: 2,
                          py: 1.5,
                          bgcolor: 'rgba(15, 23, 42, 0.03)',
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                          {messageAuthor}
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {messagePreview}
                        </Typography>
                      </Box>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        px: 2,
                        py: 2,
                        textAlign: 'left',
                      }}
                    >
                      <Box>
                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                          <FormattedMessage id="tickets.actionPanel" defaultMessage="Actions" />
                        </Typography>
                      </Box>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                        <Button
                          fullWidth
                          variant="contained"
                          size="medium"
                          onClick={() => navigate(`/tickets/${ticket.id}`)}
                        >
                          <FormattedMessage id="common.view" defaultMessage="View" />
                        </Button>

                        {relatedOrderId && (
                          <Button
                            fullWidth
                            variant="outlined"
                            size="medium"
                            onClick={() => navigate(`/orders/${relatedOrderId}`)}
                          >
                            <FormattedMessage id="tickets.openRelatedOrder" defaultMessage="Open Related Order" />
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </Box>
              );
            })}

            {!isMobile && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <TablePagination
                  rowsPerPageOptions={[4, 8, 12]}
                  component="div"
                  count={filteredTickets.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={(_event, newPage) => setPage(newPage)}
                  onRowsPerPageChange={(event) => {
                    setRowsPerPage(parseInt(event.target.value, 10));
                    setPage(0);
                  }}
                  labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: 'Rows per page:' })}
                  labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'Total' })} ${count}`}
                />
              </Box>
            )}
          </Box>
        )}

        {!isLoading && !error && tickets.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage
              id="tickets.summary.caption"
              defaultMessage="Showing {count} tickets with {messages} total messages."
              values={{ count: filteredTickets.length, messages: totalMessagesCount }}
            />
          </Typography>
        )}
      </div>
    </div>
  );
}
