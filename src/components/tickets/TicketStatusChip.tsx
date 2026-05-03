import { Chip } from '@mui/material';
import { useIntl } from 'react-intl';
import { TicketStatus } from '@/types';

type TicketStatusChipProps = {
  status: TicketStatus | string;
  size?: 'small' | 'medium';
};

export default function TicketStatusChip({ status, size = 'small' }: TicketStatusChipProps) {
  const intl = useIntl();
  const isOpen = status === 'open';

  return (
    <Chip
      size={size}
      color={isOpen ? 'success' : 'default'}
      label={isOpen
        ? intl.formatMessage({ id: 'tickets.status.open', defaultMessage: 'Open' })
        : intl.formatMessage({ id: 'tickets.status.closed', defaultMessage: 'Closed' })}
    />
  );
}
