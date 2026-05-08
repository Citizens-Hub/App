import { Box } from '@mui/material';
import { ListingItem, Ship } from '@/types';
import { ChevronsRight } from 'lucide-react';
import { getMarketItemVisual, MARKET_ITEM_PLACEHOLDER, resolveMarketImageBadgeKind } from '@/components/marketItemDisplay';
import MarketImageBadge from './MarketImageBadge';

interface MarketItemMediaProps {
  item: ListingItem;
  ships: Ship[];
  height?: number;
  badgeText?: string | null;
}

export default function MarketItemMedia({
  item,
  ships,
  height = 220,
  badgeText,
}: MarketItemMediaProps) {
  const visual = getMarketItemVisual(item, ships);
  const imageBadgeKind = resolveMarketImageBadgeKind(item);

  if (item.itemType === 'ccu') {
    return (
      <Box sx={{ position: 'relative', width: '100%', height, overflow: 'hidden', backgroundColor: 'grey.100' }}>
        <Box
          component="img"
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '36%',
            height: '100%',
            objectFit: 'cover',
          }}
          src={visual.fromImage || MARKET_ITEM_PLACEHOLDER}
          alt={visual.fromShipName || item.name}
        />
        <Box
          component="img"
          sx={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: '64%',
            height: '100%',
            objectFit: 'cover',
            boxShadow: '0 0 24px 0 rgba(0, 0, 0, 0.2)',
          }}
          src={visual.toImage || MARKET_ITEM_PLACEHOLDER}
          alt={visual.toShipName || item.name}
        />
        <div className='absolute top-1/2 left-[36%] -translate-x-1/2 -translate-y-1/2 bg-black/45 p-2 text-white'>
          <ChevronsRight className='h-6 w-6' />
        </div>
        {badgeText && (
          <div className='absolute right-3 top-3 border border-black/10 bg-white/95 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-200'>
            {badgeText}
          </div>
        )}
        {imageBadgeKind && <MarketImageBadge kind={imageBadgeKind} raised />}
        <div className='absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white'>
          <div className='line-clamp-2 text-sm font-medium'>{item.name}</div>
        </div>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height, overflow: 'hidden', backgroundColor: 'grey.100' }}>
      <Box
        component="img"
        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        src={visual.thumbnail || MARKET_ITEM_PLACEHOLDER}
        alt={item.name}
      />
      {badgeText && (
        <div className='absolute right-3 top-3 border border-black/10 bg-white/95 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-200'>
          {badgeText}
        </div>
      )}
      {imageBadgeKind && <MarketImageBadge kind={imageBadgeKind} />}
    </Box>
  );
}
