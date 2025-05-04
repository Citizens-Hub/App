import { useState, useEffect, useMemo } from 'react';
import { Resource } from '../../../types';
import { useMediaQuery, useTheme } from '@mui/material';

export default function useSearch(resources: Resource[]) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 使用Material UI的响应式API检测屏幕尺寸
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // 过滤资源并计算当前页显示的数据
  const filteredResources = useMemo(() => {
    if (!searchTerm.trim()) return resources;
    return resources.filter(resource => 
      resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resource.subtitle.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [resources, searchTerm]);

  // 计算当前页显示的数据
  const paginatedResources = useMemo(() => { 
    if (isMobile) return filteredResources;
    return filteredResources.length > 0 ? 
      filteredResources.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage) : []
  }, [filteredResources, page, rowsPerPage, isMobile]);

  // 添加键盘监听
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        // 右箭头键 - 下一页
        if (page < Math.ceil(resources.length / rowsPerPage) - 1) {
          setPage(prevPage => prevPage + 1);
        }
      } else if (event.key === 'ArrowLeft') {
        // 左箭头键 - 上一页
        if (page > 0) {
          setPage(prevPage => prevPage - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    // 清理事件监听
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [page, rowsPerPage, resources.length]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(0); // 重置到第一页
  };

  return {
    page,
    rowsPerPage,
    searchTerm,
    isMobile,
    filteredResources,
    paginatedResources,
    handleChangePage,
    handleChangeRowsPerPage,
    handleSearchChange
  };
} 