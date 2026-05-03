import { Box, Button, Chip, Paper, Typography } from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { DetailedOrder, DetailedOrderItem } from '@/types';
import { getOrderItemDisplayName } from '@/pages/Orders/orderI18n';
import { formatOrderPublicId } from '@/utils/orderId';

type TicketRelatedOrderCardProps = {
  order?: DetailedOrder | null;
  onOpenOrder?: (orderId: string) => void;
};

export default function TicketRelatedOrderCard({ order, onOpenOrder }: TicketRelatedOrderCardProps) {
  const intl = useIntl();
  const formatUsd = (value?: number | null) => (value || 0).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' });

  if (!order) {
    return null;
  }

  return (
    <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ mb: 1 }}>
            <FormattedMessage id="tickets.orderDetail" defaultMessage="Related Order" />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatOrderPublicId(order.id)} · {formatUsd(order.price)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            variant="outlined"
            label={intl.formatMessage(
              { id: 'orderDetail.itemCountSummary', defaultMessage: '{count} items' },
              { count: order.items.length },
            )}
          />
          {onOpenOrder && (
            <Button variant="text" onClick={() => onOpenOrder(order.id)}>
              <FormattedMessage id="tickets.openRelatedOrder" defaultMessage="Open Related Order" />
            </Button>
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gap: 1.5, mt: 2 }}>
        {order.items.map((item: DetailedOrderItem) => (
          <Box key={item.id} sx={{ border: '1px solid', borderColor: 'divider', p: 2 }}>
            <Typography variant="subtitle2">
              {getOrderItemDisplayName(intl, item.marketItem)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <FormattedMessage
                id="tickets.orderItemMeta"
                defaultMessage="Quantity {quantity} · Price {price}"
                values={{ quantity: item.quantity, price: formatUsd(item.price) }}
              />
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
