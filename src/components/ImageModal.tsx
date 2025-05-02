import { 
  Dialog, 
  DialogContent, 
  IconButton, 
  Box,
  useTheme,
  useMediaQuery
} from '@mui/material';
import { Close, ArrowBackIosNew, ArrowForwardIos } from '@mui/icons-material';

interface ImageModalProps {
  open: boolean;
  onClose: () => void;
  images: string[];
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function ImageModal({
  open,
  onClose,
  images,
  currentIndex,
  onPrev,
  onNext
}: ImageModalProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
  
  if (!images || images.length === 0) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullScreen={fullScreen}
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'background.paper',
            position: 'relative',
            overflow: 'hidden'
          }
        }
      }}
    >
      <DialogContent sx={{ p: 0, position: 'relative', height: '100%' }}>
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: 'white',
            bgcolor: 'rgba(0,0,0,0.3)',
            zIndex: 2,
            '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' }
          }}
        >
          <Close />
        </IconButton>
        
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: 'fit',
            height: 'fit',
            position: 'relative'
          }}
        >
          <img
            src={images[currentIndex]}
            alt={`放大图片 ${currentIndex + 1}/${images.length}`}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
          />
          
          {images.length > 1 && (
            <>
              <IconButton
                onClick={onPrev}
                sx={{
                  position: 'absolute',
                  left: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  color: 'white',
                  '&:hover': { backgroundColor: 'rgba(0,0,0,0.5)' },
                  zIndex: 1
                }}
              >
                <ArrowBackIosNew />
              </IconButton>
              <IconButton
                onClick={onNext}
                sx={{
                  position: 'absolute',
                  right: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  color: 'white',
                  '&:hover': { backgroundColor: 'rgba(0,0,0,0.5)' },
                  zIndex: 1
                }}
              >
                <ArrowForwardIos />
              </IconButton>
            </>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
} 