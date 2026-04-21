const ORDER_PUBLIC_ID_PREFIX = 'ord_';

export function formatOrderPublicId(orderId: string, visibleBodyPrefix = 8, visibleSuffix = 4) {
  if (!orderId) {
    return '';
  }

  if (orderId.startsWith(ORDER_PUBLIC_ID_PREFIX)) {
    const body = orderId.slice(ORDER_PUBLIC_ID_PREFIX.length);
    if (body.length <= visibleBodyPrefix + visibleSuffix + 3) {
      return orderId;
    }

    return `${ORDER_PUBLIC_ID_PREFIX}${body.slice(0, visibleBodyPrefix)}...${body.slice(-visibleSuffix)}`;
  }

  if (orderId.length <= visibleBodyPrefix + visibleSuffix + 3) {
    return orderId;
  }

  return `${orderId.slice(0, visibleBodyPrefix)}...${orderId.slice(-visibleSuffix)}`;
}
