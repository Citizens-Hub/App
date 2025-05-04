import { Box, Typography } from '@mui/material';
import { Resource } from '../../../types';

interface PriceDisplayProps {
  resource: Resource;
  exchangeRate: number;
  isMobile?: boolean;
}

export default function PriceDisplay({ resource, exchangeRate, isMobile = false }: PriceDisplayProps) {
  const { nativePrice } = resource;
  const hasDiscount = !!nativePrice.discounted;
  const currentPrice = nativePrice.discounted || nativePrice.amount;
  
  // 移动端和桌面端的样式略有不同
  if (isMobile) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'top', gap: 1 }}>
          <Typography variant="body1" fontWeight="bold" sx={{ fontSize: '20px' }}>
            {(currentPrice / 100).toLocaleString("en-US", {style:"currency", currency:"USD"})}
          </Typography>
          {hasDiscount && 
            <Typography variant="body2" sx={{ textDecoration: "line-through", fontSize: '12px' }}>
              {(nativePrice.amount / 100).toLocaleString("en-US", {style:"currency", currency:"USD"})}
            </Typography>
          }
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">~</Typography>
          <Typography variant="caption" color="text.secondary">
            {(currentPrice * exchangeRate / 100).toLocaleString("zh-CN", {style:"currency", currency:"CNY"})}
          </Typography>
        </Box>
      </Box>
    );
  }
  
  // 桌面端样式
  return (
    <>
      <Typography variant="body1" className="flex gap-2">
        <span className="text-2xl font-bold">
          {(currentPrice / 100).toLocaleString("en-US", {style:"currency", currency:"USD"})}
        </span>
        {hasDiscount && 
          <span style={{ textDecoration: "line-through"}} >
            {(nativePrice.amount / 100).toLocaleString("en-US", {style:"currency", currency:"USD"})}
          </span>
        }
      </Typography>
      <Typography variant="caption" color="text.secondary" className="flex gap-2">
        ~
        <span>
          {(currentPrice * exchangeRate / 100).toLocaleString("zh-CN", {style:"currency", currency:"CNY"})}
        </span>
      </Typography>
    </>
  );
} 