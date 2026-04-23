import { 
  Box, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Typography, 
  IconButton,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { Resource } from '@/types';
import ImageSlideshow from './ImageSlideshow';
import PriceDisplay from './PriceDisplay';
import { useIntl } from 'react-intl';

interface ResourceDesktopViewProps {
  resources: Resource[];
  slideshowIndices: {[key: string]: number};
  exchangeRate: number;
  cart: {resource: Resource}[];
  onPrevSlide: (resourceId: string, event?: React.MouseEvent) => void;
  onNextSlide: (resourceId: string, event?: React.MouseEvent) => void;
  onAddToCart: (resource: Resource) => void;
  onRemoveFromCart: (resourceId: string) => void;
}

export default function ResourceDesktopView({
  resources,
  slideshowIndices,
  exchangeRate,
  cart,
  onPrevSlide,
  onNextSlide,
  onAddToCart,
  onRemoveFromCart
}: ResourceDesktopViewProps) {
  const intl = useIntl();

  return (
    <TableContainer component={Box} sx={{ height: 'calc(100vh - 280px)', overflow: 'auto' }}>
      <Table
        sx={{ minWidth: 650 }}
        aria-label={intl.formatMessage({
          id: 'resourcesTable.ariaLabel',
          defaultMessage: 'Resources table',
        })}
      >
        <TableHead>
          <TableRow>
            <TableCell>{intl.formatMessage({ id: 'resourcesTable.column.image', defaultMessage: 'Image' })}</TableCell>
            <TableCell>{intl.formatMessage({ id: 'resourcesTable.column.name', defaultMessage: 'Name' })}</TableCell>
            <TableCell>{intl.formatMessage({ id: 'resourcesTable.column.price', defaultMessage: 'Price' })}</TableCell>
            <TableCell align="center">{intl.formatMessage({ id: 'resourcesTable.column.actions', defaultMessage: 'Actions' })}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {resources.map((resource) => (
            <TableRow
              key={resource.id}
              sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
            >
              <TableCell>
                <ImageSlideshow 
                  resource={resource}
                  slideshowIndex={slideshowIndices[resource.id] || 0}
                  onPrevSlide={onPrevSlide}
                  onNextSlide={onNextSlide}
                />
              </TableCell>
              <TableCell>
                <div className='flex gap-2 items-center'>
                  {resource.isPackage && <img src="/pack.svg" alt="" aria-hidden="true" className='w-12 h-12' />}
                  <div>
                    <Typography variant="subtitle1" sx={{ fontSize: '20px' }}>
                      {resource.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '14px' }}>{resource.excerpt.length > 300 ? resource.excerpt.slice(0, 300) + '...' : resource.excerpt}</Typography>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <PriceDisplay resource={resource} exchangeRate={exchangeRate} />
              </TableCell>
              <TableCell align="center">
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
                    className="add-to-cart-button"
                    onClick={() => onAddToCart(resource)}
                  >
                    <Add />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
} 
