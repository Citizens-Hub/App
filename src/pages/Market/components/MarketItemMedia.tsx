import { Box, IconButton } from '@mui/material';
import { memo, useMemo, useState } from 'react';
import { ListingItem, Ship } from '@/types';
import { ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { getMarketItemVisual, MARKET_ITEM_PLACEHOLDER, resolveMarketImageBadgeKind } from '@/components/marketItemDisplay';
import MarketImageBadge from './MarketImageBadge';

interface MarketItemMediaProps {
  item: ListingItem;
  ships: Ship[];
  height?: number;
  badgeText?: string | null;
}

function MarketItemMedia({
  item,
  ships,
  height = 220,
  badgeText,
}: MarketItemMediaProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const visual = useMemo(
    () => getMarketItemVisual(item, ships, { imageVariant: 'thumbLarge' }),
    [item, ships],
  );
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
          loading="lazy"
          decoding="async"
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
          loading="lazy"
          decoding="async"
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

  const carouselImages = visual.carouselImages.length > 0
    ? visual.carouselImages
    : [visual.thumbnail || MARKET_ITEM_PLACEHOLDER];
  const selectedIndex = Math.min(activeImageIndex, carouselImages.length - 1);
  const selectedImage = carouselImages[selectedIndex] || MARKET_ITEM_PLACEHOLDER;

  return (
    <Box sx={{ position: 'relative', width: '100%', height, overflow: 'hidden', backgroundColor: 'grey.100' }}>
      <Box
        component="img"
        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        src={selectedImage}
        alt={item.name}
        loading="lazy"
        decoding="async"
      />
      {carouselImages.length > 1 && (
        <>
          <IconButton
            size="small"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setActiveImageIndex((current) => (current <= 0 ? carouselImages.length - 1 : current - 1));
            }}
            sx={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              bgcolor: 'rgba(15,23,42,0.62)',
              color: 'white',
              '&:hover': { bgcolor: 'rgba(15,23,42,0.78)' },
            }}
            aria-label="Previous listing image"
          >
            <ChevronLeft size={16} />
          </IconButton>
          <IconButton
            size="small"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setActiveImageIndex((current) => (current >= carouselImages.length - 1 ? 0 : current + 1));
            }}
            sx={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              bgcolor: 'rgba(15,23,42,0.62)',
              color: 'white',
              '&:hover': { bgcolor: 'rgba(15,23,42,0.78)' },
            }}
            aria-label="Next listing image"
          >
            <ChevronRight size={16} />
          </IconButton>
          <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 8, display: 'flex', justifyContent: 'center', gap: 0.75 }}>
            {carouselImages.map((imageUrl, index) => (
              <Box
                key={`${imageUrl}-${index}`}
                component="button"
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveImageIndex(index);
                }}
                aria-label={`Show listing image ${index + 1}`}
                sx={{
                  width: selectedIndex === index ? 18 : 7,
                  height: 7,
                  borderRadius: 999,
                  border: 0,
                  p: 0,
                  cursor: 'pointer',
                  bgcolor: selectedIndex === index ? 'common.white' : 'rgba(255,255,255,0.55)',
                  transition: 'width 0.18s ease, background-color 0.18s ease',
                }}
              />
            ))}
          </Box>
        </>
      )}
      {badgeText && (
        <div className='absolute right-3 top-3 border border-black/10 bg-white/95 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-200'>
          {badgeText}
        </div>
      )}
      {imageBadgeKind && <MarketImageBadge kind={imageBadgeKind} />}
    </Box>
  );
}

export default memo(MarketItemMedia);
