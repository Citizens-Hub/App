import { useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';

type UseMobileInfiniteRowsOptions = {
  initialRowsPerPage?: number;
  mobileChunkSize?: number;
  resetKey?: unknown;
};

export default function useMobileInfiniteRows<T>(
  items: T[],
  options: UseMobileInfiniteRowsOptions = {},
) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const initialRowsPerPage = options.initialRowsPerPage ?? 10;
  const mobileChunkSize = options.mobileChunkSize ?? initialRowsPerPage;
  const resetKey = options.resetKey;
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(mobileChunkSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPage(0);
    setMobileVisibleCount(mobileChunkSize);
  }, [items.length, mobileChunkSize, resetKey]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) {
        return;
      }

      setMobileVisibleCount((current) => {
        if (current >= items.length) {
          return current;
        }

        return Math.min(current + mobileChunkSize, items.length);
      });
    }, {
      rootMargin: '240px 0px',
    });

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [isMobile, items.length, mobileChunkSize]);

  const displayedItems = useMemo(() => {
    if (isMobile) {
      return items.slice(0, mobileVisibleCount);
    }

    return items.slice(
      page * rowsPerPage,
      page * rowsPerPage + rowsPerPage,
    );
  }, [isMobile, items, mobileVisibleCount, page, rowsPerPage]);

  return {
    isMobile,
    page,
    rowsPerPage,
    setPage,
    setRowsPerPage,
    displayedItems,
    sentinelRef,
    visibleCount: isMobile ? mobileVisibleCount : displayedItems.length,
    hasMore: isMobile ? mobileVisibleCount < items.length : false,
  };
}
