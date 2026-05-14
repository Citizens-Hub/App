import { Box, Typography } from '@mui/material';
import { useIntl } from 'react-intl';
import { TicketMessage } from '@/types';

type TicketConversationProps = {
  messages: TicketMessage[];
};

export default function TicketConversation({ messages }: TicketConversationProps) {
  const intl = useIntl();
  const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString(intl.locale) : '-';

  return (
    <Box sx={{ display: 'grid', gap: 2, textAlign: 'left' }}>
      {messages.map((message) => (
        <Box
          key={message.id}
          sx={{
            border: '1px solid',
            borderColor: message.isAdmin ? 'primary.main' : 'divider',
            bgcolor: message.isAdmin ? 'action.hover' : 'background.paper',
            p: 2,
            textAlign: 'left',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="subtitle2" sx={{ textAlign: 'left' }}>
              {message.author.name || message.author.email}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'left' }}>
              {formatDateTime(message.createdAt)}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, textAlign: 'left' }}>
            {message.isAdmin
              ? intl.formatMessage({ id: 'tickets.message.admin', defaultMessage: 'Support Reply' })
              : intl.formatMessage({ id: 'tickets.message.user', defaultMessage: 'Your Message' })}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>
            {message.content}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
