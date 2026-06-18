import { useEffect, useRef } from 'react';
import {
  Box,
  Button,
  Drawer,
  IconButton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Close,
  KeyboardDoubleArrowLeft,
  KeyboardDoubleArrowRight,
  OpenInNew,
} from '@mui/icons-material';
import { useIntl } from 'react-intl';
import { X } from 'lucide-react';
import MarketDetail from '../MarketDetail';
import { getMarketDetailUrl } from '@/utils/marketLinks';

export interface MarketDetailDrawerTab {
  skuId: string;
  label: string;
}

interface MarketDetailDrawerProps {
  activeSkuId: string | null;
  collapsed: boolean;
  open: boolean;
  tabs: MarketDetailDrawerTab[];
  onChangeTab: (skuId: string) => void;
  onCloseAll: () => void;
  onCloseTab: (skuId: string) => void;
  onCollapse: () => void;
  onExpand: () => void;
}

export default function MarketDetailDrawer({
  activeSkuId,
  collapsed,
  open,
  tabs,
  onChangeTab,
  onCloseAll,
  onCloseTab,
  onCollapse,
  onExpand,
}: MarketDetailDrawerProps) {
  const intl = useIntl();
  const theme = useTheme();
  const tabsRootRef = useRef<HTMLDivElement | null>(null);
  const tabsActionsRef = useRef<{
    updateIndicator: () => void;
    updateScrollButtons: () => void;
  } | null>(null);
  const resolvedActiveSkuId = activeSkuId && tabs.some((tab) => tab.skuId === activeSkuId)
    ? activeSkuId
    : tabs[0]?.skuId || null;
  const handleOpenStandalone = () => {
    if (!resolvedActiveSkuId) return;

    window.open(getMarketDetailUrl(resolvedActiveSkuId), '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (!open || !resolvedActiveSkuId) {
      return;
    }

    const syncSelectedTabVisibility = () => {
      const selectedTab = tabsRootRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!selectedTab) {
        tabsActionsRef.current?.updateScrollButtons();
        return;
      }

      selectedTab.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
      tabsActionsRef.current?.updateIndicator();
      tabsActionsRef.current?.updateScrollButtons();
    };

    const frameId = window.requestAnimationFrame(() => {
      syncSelectedTabVisibility();
      window.requestAnimationFrame(syncSelectedTabVisibility);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [open, resolvedActiveSkuId, tabs.length]);

  return (
    <>
      {collapsed && tabs.length > 0 && !open && (
        <Box
          sx={{
            position: 'fixed',
            right: 0,
            top: '50%',
            zIndex: theme.zIndex.drawer - 1,
            transform: 'translateY(-50%)',
          }}
        >
          <Tooltip title={intl.formatMessage({ id: 'market.drawer.expand', defaultMessage: 'Expand drawer' })} placement="left">
            <Button
              variant="contained"
              onClick={onExpand}
              sx={{
                minWidth: 0,
                borderRadius: '12px 0 0 12px',
                px: 1,
                py: 1.5,
                boxShadow: 3,
              }}
              aria-label={intl.formatMessage({ id: 'market.drawer.expand', defaultMessage: 'Expand drawer' })}
            >
              <KeyboardDoubleArrowLeft />
            </Button>
          </Tooltip>
        </Box>
      )}

      <Drawer
        anchor="right"
        open={open && tabs.length > 0}
        onClose={onCollapse}
        ModalProps={{ keepMounted: true }}
        slotProps={{
          paper: {
            sx: {
              width: { xs: '100%', lg: 1280 },
              maxWidth: '100%',
              display: 'flex',
              flexDirection: 'column',
            },
          }
        }}
      >
        <Box
          sx={{
            display: 'flex',
            minHeight: 64,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Tabs
              ref={tabsRootRef}
              action={(actions) => {
                tabsActionsRef.current = actions;
              }}
              value={resolvedActiveSkuId || false}
              onChange={(_event, nextValue) => onChangeTab(nextValue)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                minHeight: 64,
                '& .MuiTab-root': {
                  minHeight: 64,
                  minWidth: 160,
                  maxWidth: 240,
                  px: 2,
                  textTransform: 'none',
                },
              }}
            >
              {tabs.map((tab) => (
                <Tab
                  key={tab.skuId}
                  value={tab.skuId}
                  label={(
                    <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 160, fontWeight: 600 }}>
                        {tab.label}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label={intl.formatMessage({ id: 'market.drawer.closeTab', defaultMessage: 'Close tab' })}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onCloseTab(tab.skuId);
                        }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    </Box>
                  )}
                />
              ))}
            </Tabs>
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              borderLeft: '1px solid',
              borderColor: 'divider',
              px: 1,
              flexShrink: 0,
            }}
          >
            <Tooltip title={intl.formatMessage({ id: 'market.drawer.openInNewWindow', defaultMessage: 'Open in new window' })}>
              <span>
                <IconButton
                  onClick={handleOpenStandalone}
                  disabled={!resolvedActiveSkuId}
                  aria-label={intl.formatMessage({ id: 'market.drawer.openInNewWindow', defaultMessage: 'Open in new window' })}
                >
                  <OpenInNew />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={intl.formatMessage({ id: 'market.drawer.collapse', defaultMessage: 'Collapse drawer' })}>
              <span>
                <IconButton
                  onClick={onCollapse}
                  disabled={!resolvedActiveSkuId}
                  aria-label={intl.formatMessage({ id: 'market.drawer.collapse', defaultMessage: 'Collapse drawer' })}
                >
                  <KeyboardDoubleArrowRight />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={intl.formatMessage({ id: 'market.drawer.close', defaultMessage: 'Close drawer' })}>
              <span>
                <IconButton
                  onClick={onCloseAll}
                  disabled={!resolvedActiveSkuId}
                  aria-label={intl.formatMessage({ id: 'market.drawer.close', defaultMessage: 'Close drawer' })}
                >
                  <Close />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, bgcolor: 'background.default' }}>
          {tabs.map((tab) => {
            const isActive = tab.skuId === resolvedActiveSkuId;

            return (
              <Box
                key={tab.skuId}
                role="tabpanel"
                hidden={!isActive}
                sx={{
                  display: isActive ? 'block' : 'none',
                  height: '100%',
                }}
              >
                <MarketDetail skuId={tab.skuId} embedded />
              </Box>
            );
          })}
        </Box>
      </Drawer>
    </>
  );
}
