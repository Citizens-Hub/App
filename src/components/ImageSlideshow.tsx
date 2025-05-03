import { 
  Box, 
  IconButton, 
  Typography, 
  Avatar,
  CardMedia
} from '@mui/material';
import { ArrowBackIosNew, ArrowForwardIos } from '@mui/icons-material';
import { Resource } from '../types';
import { useState } from 'react';
import ImageModal from './ImageModal';

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
  const [modalOpen, setModalOpen] = useState(false);

  // 决定图片容器的大小
  const containerSize = isMobile ? 
    { width: '100%', height: 200 } : 
    { width: 280, height: 160 };
  
  // 处理点击图片事件
  const handleImageClick = (event: React.MouseEvent) => {
    event.stopPropagation(); // 阻止事件冒泡
    setModalOpen(true);
  };

  // 准备所有图片的URL列表用于模态框
  const prepareImageUrls = () => {
    if (media.list.length === 0) {
      // 如果没有幻灯片列表，则只包含缩略图
      const thumbnailUrl = media.thumbnail.storeSmall.startsWith('http') ? 
        media.thumbnail.storeSmall : 
        `https://robertsspaceindustries.com/${media.thumbnail.storeSmall}`;
      return [thumbnailUrl];
    } else {
      // 否则使用幻灯片列表中的图片
      return media.list.map(item => {
        return item.slideshow.startsWith('http') ? 
          item.slideshow : 
          `https://robertsspaceindustries.com/${item.slideshow}`;
      });
    }
  };

  const imageUrls = prepareImageUrls();

  // 处理在模态框中的导航
  const handleModalPrev = () => {
    onPrevSlide(id);
  };

  const handleModalNext = () => {
    onNextSlide(id);
  };

  // 如果没有幻灯片列表，则显示缩略图
  if (media.list.length === 0) {
    const thumbnailUrl = media.thumbnail.storeSmall.startsWith('http') ? 
      media.thumbnail.storeSmall : 
      `https://robertsspaceindustries.com/${media.thumbnail.storeSmall}`;
      
    return (
      <>
        {isMobile ? (
          <CardMedia
            component="img"
            height="200"
            image={thumbnailUrl}
            alt={name}
            sx={{ 
              objectFit: 'cover',
              cursor: 'pointer'
            }}
            onClick={handleImageClick}
          />
        ) : (
          <Box 
            sx={{
              ...containerSize,
              cursor: 'pointer'
            }}
            onClick={handleImageClick}
          >
            <Avatar
              alt={name}
              src={thumbnailUrl}
              variant="square"
              sx={{ width: '100%', height: '100%' }}
              slotProps={{
                img: {
                  loading: "lazy",
                },
              }}
            />
          </Box>
        )}
        <ImageModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          images={imageUrls}
          currentIndex={0}
          onPrev={handleModalPrev}
          onNext={handleModalNext}
        />
      </>
    );
  }

  // 渲染幻灯片列表
  return (
    <>
      <Box sx={{ position: 'relative', ...containerSize }} className="image-slideshow">
        {media.list.map((mediaItem, index) => {
          const imageUrl = mediaItem.slideshow.startsWith('http') ? 
            mediaItem.slideshow : 
            `https://robertsspaceindustries.com/${mediaItem.slideshow}`;
          
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
                cursor: 'pointer'
              }}
              onClick={handleImageClick}
            />
          ) : (
            <Box
              key={index}
              sx={{
                display: slideshowIndex === index ? 'block' : 'none',
                width: '100%',
                height: '100%',
                cursor: 'pointer'
              }}
              onClick={handleImageClick}
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
      <ImageModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        images={imageUrls}
        currentIndex={slideshowIndex}
        onPrev={handleModalPrev}
        onNext={handleModalNext}
      />
    </>
  );
} 