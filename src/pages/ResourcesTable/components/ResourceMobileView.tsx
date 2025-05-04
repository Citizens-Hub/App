import { Box, Card, CardContent, Typography, Stack, IconButton } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { Resource } from '../../../types';
import ImageSlideshow from './ImageSlideshow';
import PriceDisplay from './PriceDisplay';

interface ResourceMobileViewProps {
  resources: Resource[];
  slideshowIndices: {[key: string]: number};
  exchangeRate: number;
  cart: {resource: Resource}[];
  onPrevSlide: (resourceId: string, event?: React.MouseEvent) => void;
  onNextSlide: (resourceId: string, event?: React.MouseEvent) => void;
  onAddToCart: (resource: Resource) => void;
  onRemoveFromCart: (resourceId: string) => void;
}

export default function ResourceMobileView({
  resources,
  slideshowIndices,
  exchangeRate,
  cart,
  onPrevSlide,
  onNextSlide,
  onAddToCart,
  onRemoveFromCart
}: ResourceMobileViewProps) {
  return (
    <Box sx={{ width: '100%' }}>
      {resources.map((resource) => (
        <Card key={resource.id} sx={{ mb: 2 }}>
          <Box sx={{ position: 'relative' }}>
            <ImageSlideshow 
              resource={resource}
              slideshowIndex={slideshowIndices[resource.id] || 0}
              onPrevSlide={onPrevSlide}
              onNextSlide={onNextSlide}
              isMobile={true}
            />
          </Box>
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              {resource.isPackage && <img src="/pack.svg" alt="pack" className='w-10 h-10' />}
              <Typography variant="h6" component="div">
                {resource.name}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {resource.excerpt}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <PriceDisplay resource={resource} exchangeRate={exchangeRate} isMobile={true} />
              
              {cart.find(item => item.resource.id === resource.id) ? (
                <IconButton 
                  color="error" 
                  size="small"
                  onClick={() => onRemoveFromCart(resource.id)}
                >
                  <Delete />
                </IconButton>
              ) : (
                <IconButton
                  color="primary" 
                  size="small"
                  onClick={() => onAddToCart(resource)}
                  className="add-to-cart-button"
                >
                  <Add />
                </IconButton>
              )}
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
} 