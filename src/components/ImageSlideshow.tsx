import { 
  Box, 
  IconButton, 
  Typography, 
  Avatar,
  CardMedia
} from '@mui/material';
import { ArrowBackIosNew, ArrowForwardIos } from '@mui/icons-material';
import { Resource } from '../types';

interface ImageSlideshowProps {
  resource: Resource;
  slideshowIndex: number;
  onPrevSlide: (resourceId: string, event?: React.MouseEvent) => void;
  onNextSlide: (resourceId: string, event?: React.MouseEvent) => void;
  isMobile?: boolean;
}

export default function ImageSlideshow({ 
  resource, 
  slideshowIndex, 
  onPrevSlide, 
  onNextSlide,
  isMobile = false
}: ImageSlideshowProps) {
  const { id, name, media } = resource;

  // 决定图片容器的大小
  const containerSize = isMobile ? 
    { width: '100%', height: 200 } : 
    { width: 280, height: 160 };
  
  // 如果没有幻灯片列表，则显示缩略图
  if (media.list.length === 0) {
    return isMobile ? (
      <CardMedia
        component="img"
        height="200"
        image={media.thumbnail.storeSmall.startsWith('http') ? 
          media.thumbnail.storeSmall : 
          `https://robertsspaceindustries.com/${media.thumbnail.storeSmall}`}
        alt={name}
        sx={{ objectFit: 'cover' }}
      />
    ) : (
      <Box sx={containerSize}>
        <Avatar
          alt={name}
          src={media.thumbnail.storeSmall.startsWith('http') ? 
            media.thumbnail.storeSmall : 
            `https://robertsspaceindustries.com/${media.thumbnail.storeSmall}`}
          variant="square"
          sx={{ width: '100%', height: '100%' }}
          slotProps={{
            img: {
              loading: "lazy",
            },
          }}
        />
      </Box>
    );
  }

  // 渲染幻灯片列表
  return (
    <Box sx={{ position: 'relative', ...containerSize }}>
      {media.list.map((media, index) => {
        const imageUrl = media.slideshow.startsWith('http') ? 
          media.slideshow : 
          `https://robertsspaceindustries.com/${media.slideshow}`;
        
        return isMobile ? (
          <CardMedia
            key={index}
            component="img"
            height="200"
            image={imageUrl}
            alt={`${name} ${index + 1}`}
            sx={{
              display: slideshowIndex === index ? 'block' : 'none',
              objectFit: 'cover',
            }}
          />
        ) : (
          <Box
            key={index}
            sx={{
              display: slideshowIndex === index ? 'block' : 'none',
              width: '100%',
              height: '100%',
            }}
          >
            <Avatar
              alt={`${name} ${index + 1}`}
              src={imageUrl}
              variant="square"
              sx={{ width: '100%', height: '100%' }}
              slotProps={{
                img: {
                  loading: "lazy",
                },
              }}
            />
          </Box>
        );
      })}
      
      {media.list.length > 1 && (
        <>
          <IconButton
            size="small"
            onClick={(event) => onPrevSlide(id, event)}
            sx={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              backgroundColor: 'rgba(0,0,0,0.3)',
              color: 'white',
              '&:hover': { backgroundColor: 'rgba(0,0,0,0.5)' },
              zIndex: 1,
              minWidth: '24px',
              width: '24px',
              height: '24px',
            }}
          >
            <ArrowBackIosNew sx={{ fontSize: '16px' }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={(event) => onNextSlide(id, event)}
            sx={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              backgroundColor: 'rgba(0,0,0,0.3)',
              color: 'white',
              '&:hover': { backgroundColor: 'rgba(0,0,0,0.5)' },
              zIndex: 1,
              minWidth: '24px',
              width: '24px',
              height: '24px',
            }}
          >
            <ArrowForwardIos sx={{ fontSize: '16px' }} />
          </IconButton>
          <Box sx={{ 
            position: 'absolute', 
            bottom: 8, 
            left: 0, 
            right: 0, 
            textAlign: 'center',
            zIndex: 1,
          }}>
            <Typography variant="caption" sx={{ color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 1 }}>
              {`${slideshowIndex + 1} / ${media.list.length}`}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
} 