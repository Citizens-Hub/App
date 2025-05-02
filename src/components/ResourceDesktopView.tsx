import { 
  Box, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Typography, 
  IconButton 
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { Resource } from '../types';
import ImageSlideshow from './ImageSlideshow';
import PriceDisplay from './PriceDisplay';

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
  return (
    <TableContainer component={Box}>
      <Table sx={{ minWidth: 650 }} aria-label="resources table">
        <TableHead>
          <TableRow>
            <TableCell>图片</TableCell>
            <TableCell>名称</TableCell>
            <TableCell>价格</TableCell>
            <TableCell align="center">操作</TableCell>
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
                  {resource.isPackage && <img src="/pack.svg" alt="pack" className='w-12 h-12' />}
                  <div>
                    <Typography variant="subtitle1">
                      {resource.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{resource.excerpt}</Typography>
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