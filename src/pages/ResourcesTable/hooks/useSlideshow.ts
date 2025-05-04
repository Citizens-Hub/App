import { useState, useEffect, useRef } from 'react';
import { Resource } from '../../../types';

export default function useSlideshow(resources: Resource[], autoplay = true, paginatedResources: Resource[]) {
  const [slideshowIndices, setSlideshowIndices] = useState<{[key: string]: number}>({});
  const timersRef = useRef<{[key: string]: number}>({});

  // 初始化幻灯片索引
  useEffect(() => {
    if (resources.length > 0) {
      const initialIndices: {[key: string]: number} = {};
      resources.forEach(resource => {
        initialIndices[resource.id] = 0;
      });
      setSlideshowIndices(initialIndices);
    }
  }, [resources]);

  // 自动轮播功能清理
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  // 当页面或自动播放状态改变时，重新设置定时器
  useEffect(() => {
    // 清理现有定时器
    Object.values(timersRef.current).forEach(timer => clearTimeout(timer));
    
    // 如果不是自动播放或者没有资源，则不设置定时器
    if (!autoplay || resources.length === 0) return;
    
    // 为每个资源设置定时器
    const newTimers: {[key: string]: number} = {};
    
    paginatedResources.forEach(resource => {
      if (resource.media.list.length > 1) {
        // 设置3秒的自动轮播
        newTimers[resource.id] = window.setInterval(() => {
          setSlideshowIndices(prev => {
            const currentIndex = prev[resource.id] || 0;
            const newIndex = currentIndex < resource.media.list.length - 1 ? currentIndex + 1 : 0;
            return { ...prev, [resource.id]: newIndex };
          });
        }, 3000);
      }
    });
    
    timersRef.current = newTimers;
    
    // 清理函数
    return () => {
      Object.values(newTimers).forEach(timer => clearTimeout(timer));
    };
  }, [paginatedResources, autoplay, resources.length]);

  const handlePrevSlide = (resourceId: string, event?: React.MouseEvent) => {
    // 防止事件冒泡
    event?.stopPropagation();
    
    // 点击箭头时，暂停自动播放
    if (timersRef.current[resourceId]) {
      clearTimeout(timersRef.current[resourceId]);
      delete timersRef.current[resourceId];
    }
    
    setSlideshowIndices(prev => {
      const currentIndex = prev[resourceId];
      const resource = resources.find(r => r.id === resourceId);
      if (!resource) return prev;
      
      const newIndex = currentIndex > 0 ? currentIndex - 1 : resource.media.list.length - 1;
      return { ...prev, [resourceId]: newIndex };
    });
  };

  const handleNextSlide = (resourceId: string, event?: React.MouseEvent) => {
    // 防止事件冒泡
    event?.stopPropagation();
    
    // 点击箭头时，暂停自动播放
    if (timersRef.current[resourceId]) {
      clearTimeout(timersRef.current[resourceId]);
      delete timersRef.current[resourceId];
    }
    
    setSlideshowIndices(prev => {
      const currentIndex = prev[resourceId];
      const resource = resources.find(r => r.id === resourceId);
      if (!resource) return prev;
      
      const newIndex = currentIndex < resource.media.list.length - 1 ? currentIndex + 1 : 0;
      return { ...prev, [resourceId]: newIndex };
    });
  };

  return {
    slideshowIndices,
    handlePrevSlide,
    handleNextSlide
  };
} 