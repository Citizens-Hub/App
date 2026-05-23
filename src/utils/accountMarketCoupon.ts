export const ACCOUNT_MARKET_COUPON_PERCENT_OFF = 10;

export function getMonthlyAccountCouponCode(date = new Date()) {
  const month = date.toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).toUpperCase();
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month}${year}ACCOUNT10OFF`;
}
