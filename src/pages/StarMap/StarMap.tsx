import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Alert,
  Autocomplete,
  Box,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  type SelectChangeEvent,
} from '@mui/material';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import { Check, ChevronDown, ChevronUp, Copy, GripHorizontal, LocateFixed, MapPin, Orbit, Rotate3D, Search } from 'lucide-react';
import {
  createMapControl,
  defineStarMapElement,
  localizeName,
  normalizeSystem,
  type NodeSelectDetail,
  type NormalizedNode,
  type NormalizedSystem,
  type StarMapControl,
  type StarMapElement,
  type StarMapLanguage,
  type StarMapTheme,
} from '@citizens-hub/starmap';
import { useLocale } from '@/contexts/LocaleContext';

const STAR_SYSTEM_DATA_SRC = '/data/StarSystem.json';
const ASSETS_PATH = 'https://materials.citizenshub.app';
const HEADER_HEIGHT_PX = 65;
const PANEL_RADIUS = 0;
const MAX_LOCATION_SEARCH_RESULTS = 80;
const STAR_MAP_PANEL_POSITION_STORAGE_KEY = 'citizenshub.starMap.controls.position';
const DEFAULT_PANEL_OFFSET_DESKTOP = 20;
const DEFAULT_PANEL_OFFSET_MOBILE = 12;
const MUI_MD_BREAKPOINT_PX = 900;

defineStarMapElement();

interface PanelPosition {
  x: number;
  y: number;
}

interface StoredPanelPosition extends PanelPosition {
  viewportHeight: number;
  viewportWidth: number;
}

interface ViewportSize {
  height: number;
  width: number;
}

interface PanelDragState {
  offsetX: number;
  offsetY: number;
  pointerId: number;
}

interface LocationSearchOption {
  key: string;
  node: NormalizedNode;
  searchText: string;
  system: NormalizedSystem;
}

function getViewportSize(): ViewportSize {
  if (typeof window === 'undefined') {
    return { height: 0, width: 0 };
  }

  return {
    height: window.innerHeight,
    width: window.innerWidth,
  };
}

function getDefaultPanelPosition(): PanelPosition {
  if (typeof window === 'undefined') {
    return { x: DEFAULT_PANEL_OFFSET_DESKTOP, y: DEFAULT_PANEL_OFFSET_DESKTOP };
  }

  const offset = window.innerWidth >= MUI_MD_BREAKPOINT_PX
    ? DEFAULT_PANEL_OFFSET_DESKTOP
    : DEFAULT_PANEL_OFFSET_MOBILE;

  return { x: offset, y: offset };
}

function clearStoredPanelPosition() {
  try {
    window.localStorage.removeItem(STAR_MAP_PANEL_POSITION_STORAGE_KEY);
  } catch {
    // Ignore storage access failures; the panel can still be moved for this session.
  }
}

function readStoredPanelPosition(): PanelPosition {
  if (typeof window === 'undefined') {
    return getDefaultPanelPosition();
  }

  try {
    const rawValue = window.localStorage.getItem(STAR_MAP_PANEL_POSITION_STORAGE_KEY);

    if (!rawValue) {
      return getDefaultPanelPosition();
    }

    const parsed = JSON.parse(rawValue) as Partial<StoredPanelPosition>;
    const viewport = getViewportSize();
    const hasSameViewportSize =
      parsed.viewportWidth === viewport.width &&
      parsed.viewportHeight === viewport.height;
    const x = Number(parsed.x);
    const y = Number(parsed.y);

    if (!hasSameViewportSize || !Number.isFinite(x) || !Number.isFinite(y)) {
      clearStoredPanelPosition();
      return getDefaultPanelPosition();
    }

    return {
      x: Math.max(0, x),
      y: Math.max(0, y),
    };
  } catch {
    clearStoredPanelPosition();
    return getDefaultPanelPosition();
  }
}

function writeStoredPanelPosition(position: PanelPosition) {
  if (typeof window === 'undefined') {
    return;
  }

  const viewport = getViewportSize();

  try {
    window.localStorage.setItem(
      STAR_MAP_PANEL_POSITION_STORAGE_KEY,
      JSON.stringify({
        x: position.x,
        y: position.y,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      } satisfies StoredPanelPosition),
    );
  } catch {
    // Ignore storage access failures; dragging should remain responsive.
  }
}

function getStarMapLanguage(locale: string): StarMapLanguage {
  return locale.startsWith('zh') ? 'cn' : 'en';
}

function localizeSystemName(system: NormalizedSystem, language: StarMapLanguage) {
  return language === 'cn' ? system.systemNameCN : system.systemNameEN;
}

function localizeNodeKind(kind: string, language: StarMapLanguage) {
  if (language === 'cn') {
    switch (kind) {
      case 'star':
        return '恒星';
      case 'planet':
        return '行星';
      case 'moon':
        return '卫星';
      case 'station':
        return '空间站';
      case 'place':
        return '地点';
      default:
        return kind;
    }
  }

  switch (kind) {
    case 'star':
      return 'Star';
    case 'planet':
      return 'Planet';
    case 'moon':
      return 'Moon';
    case 'station':
      return 'Station';
    case 'place':
      return 'Place';
    default:
      return kind;
  }
}

// function formatCount(value: number | undefined) {
//   return value ?? 0;
// }

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[\s_-]+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function getLocationSearchOptionLabel(option: LocationSearchOption, language: StarMapLanguage) {
  if (language === 'cn') {
    return option.node.nameCN === option.node.nameEN
      ? option.node.nameCN
      : `${option.node.nameCN} / ${option.node.nameEN}`;
  }

  return option.node.nameEN;
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
}

function getToggleButtonSx(active: boolean) {
  return {
    width: 40,
    height: 40,
    border: '1px solid',
    borderRadius: PANEL_RADIUS,
    borderColor: (theme: Theme) => {
      if (active) {
        return alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.58 : 0.34);
      }

      return theme.palette.mode === 'dark' ? alpha('#ffffff', 0.14) : alpha('#0f172a', 0.12);
    },
    backgroundColor: (theme: Theme) => {
      if (active) {
        return alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.12);
      }

      return theme.palette.mode === 'dark' ? alpha('#ffffff', 0.04) : alpha('#ffffff', 0.78);
    },
    color: (theme: Theme) => {
      if (active) {
        return theme.palette.mode === 'dark' ? '#dbeafe' : theme.palette.primary.dark;
      }

      return theme.palette.text.primary;
    },
    backdropFilter: 'blur(14px)',
    '&:hover': {
      borderColor: (theme: Theme) => alpha(theme.palette.primary.main, 0.52),
      backgroundColor: (theme: Theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.1),
    },
    '&:focus-visible': {
      outline: '2px solid',
      outlineColor: (theme: Theme) => alpha(theme.palette.primary.main, 0.72),
      outlineOffset: 2,
    },
  };
}

export default function StarMap() {
  const intl = useIntl();
  const theme = useTheme();
  const { locale } = useLocale();
  const language = getStarMapLanguage(locale);
  const starMapTheme: StarMapTheme = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const mapRef = useRef<StarMapElement | null>(null);
  const controlRef = useRef<StarMapControl | null>(null);
  const copiedNodeTimerRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelDragRef = useRef<PanelDragState | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<NodeSelectDetail | null>(null);
  const [locationSearchInput, setLocationSearchInput] = useState('');
  const [locationSearchValue, setLocationSearchValue] = useState<LocationSearchOption | null>(null);
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition>(() => readStoredPanelPosition());

  if (!controlRef.current) {
    controlRef.current = createMapControl({
      assetsPath: ASSETS_PATH,
      src: STAR_SYSTEM_DATA_SRC,
      showOrbits: true,
      showPlaces: true,
      showRotationAxes: false,
    });
  }

  const control = controlRef.current;
  const snapshot = useSyncExternalStore(control.subscribe, control.getSnapshot, control.getSnapshot);
  const selectedNode = snapshot.selectedNode;
  const currentSystem = snapshot.system;

  useEffect(() => {
    void control.refresh();
  }, [control]);

  useEffect(() => {
    const element = mapRef.current;

    if (!element) {
      return;
    }

    element.control = control;
  }, [control]);

  useEffect(() => {
    const element = mapRef.current;

    if (!element) {
      return;
    }

    element.language = language;
  }, [language]);

  useEffect(() => {
    const element = mapRef.current;

    if (!element) {
      return;
    }

    element.theme = starMapTheme;
  }, [starMapTheme]);

  useEffect(() => {
    const element = mapRef.current;

    if (!element) {
      return undefined;
    }

    const handleNodeSelect = (event: Event) => {
      setSelectedDetail((event as CustomEvent<NodeSelectDetail>).detail);
    };

    element.addEventListener('node-select', handleNodeSelect);

    return () => {
      element.removeEventListener('node-select', handleNodeSelect);
    };
  }, []);

  useEffect(() => () => {
    if (copiedNodeTimerRef.current !== null) {
      window.clearTimeout(copiedNodeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      clearStoredPanelPosition();
      panelDragRef.current = null;
      setPanelPosition(getDefaultPanelPosition());
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (locationSearchValue) {
      setLocationSearchInput(getLocationSearchOptionLabel(locationSearchValue, language));
    }
  }, [language, locationSearchValue]);

  const systemOptions = useMemo(
    () => snapshot.systems.map((system) => ({
      id: system.systemId,
      label: language === 'cn' ? system.starNameCN : system.starNameEN,
    })),
    [language, snapshot.systems],
  );

  const locationSearchOptions = useMemo<LocationSearchOption[]>(() => {
    const data = snapshot.data;

    if (!data) {
      return [];
    }

    return snapshot.systems.flatMap((systemSummary) => {
      const system = normalizeSystem(data, systemSummary.systemId);

      if (!system) {
        return [];
      }

      return system.nodes.map((node) => ({
        key: `${system.systemId}:${node.id}`,
        node,
        searchText: normalizeSearchText([
          node.nameCN,
          node.nameEN,
          system.systemNameCN,
          system.systemNameEN,
        ].join(' ')),
        system,
      }));
    });
  }, [snapshot.data, snapshot.systems]);

  const handleSystemChange = (event: SelectChangeEvent<string>) => {
    control.setSystemId(event.target.value);
    setSelectedDetail(null);
    setLocationSearchValue(null);
    setLocationSearchInput('');
  };

  const handleLocationSelect = (_event: unknown, option: LocationSearchOption | null) => {
    setLocationSearchValue(option);

    if (!option) {
      return;
    }

    const shouldShowPlaces = snapshot.showPlaces || option.node.kind === 'place';
    control.patch({
      systemId: option.system.systemId,
      selectedNodeId: option.node.id,
      showPlaces: shouldShowPlaces,
    });
    setSelectedDetail({
      system: option.system,
      node: option.node,
    });
    setLocationSearchInput(getLocationSearchOptionLabel(option, language));
  };

  const handleCopyEnglishName = async () => {
    if (!selectedNode?.nameEN) {
      return;
    }

    await copyTextToClipboard(selectedNode.nameEN);
    setCopiedNodeId(selectedNode.id);

    if (copiedNodeTimerRef.current !== null) {
      window.clearTimeout(copiedNodeTimerRef.current);
    }

    copiedNodeTimerRef.current = window.setTimeout(() => {
      setCopiedNodeId(null);
      copiedNodeTimerRef.current = null;
    }, 1600);
  };

  const clampPanelPosition = (nextPosition: PanelPosition) => {
    const panel = panelRef.current;
    const viewport = getViewportSize();
    const panelWidth = panel?.offsetWidth ?? 0;
    const panelHeight = panel?.offsetHeight ?? 0;
    const maxX = Math.max(DEFAULT_PANEL_OFFSET_MOBILE, viewport.width - panelWidth - DEFAULT_PANEL_OFFSET_MOBILE);
    const maxY = Math.max(DEFAULT_PANEL_OFFSET_MOBILE, viewport.height - HEADER_HEIGHT_PX - panelHeight - DEFAULT_PANEL_OFFSET_MOBILE);

    return {
      x: Math.min(Math.max(DEFAULT_PANEL_OFFSET_MOBILE, nextPosition.x), maxX),
      y: Math.min(Math.max(DEFAULT_PANEL_OFFSET_MOBILE, nextPosition.y), maxY),
    };
  };

  const updatePanelPosition = (nextPosition: PanelPosition, persist = false) => {
    const clampedPosition = clampPanelPosition(nextPosition);
    setPanelPosition(clampedPosition);

    if (persist) {
      writeStoredPanelPosition(clampedPosition);
    }

    return clampedPosition;
  };

  const handlePanelDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    panelDragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePanelDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = panelDragRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    updatePanelPosition({
      x: event.clientX - dragState.offsetX,
      y: event.clientY - HEADER_HEIGHT_PX - dragState.offsetY,
    });
  };

  const handlePanelDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = panelDragRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    panelDragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    updatePanelPosition({
      x: event.clientX - dragState.offsetX,
      y: event.clientY - HEADER_HEIGHT_PX - dragState.offsetY,
    }, true);
  };

  const handlePanelCollapseToggle = () => {
    setIsPanelCollapsed((value) => !value);
    window.requestAnimationFrame(() => {
      setPanelPosition((currentPosition) => {
        const clampedPosition = clampPanelPosition(currentPosition);
        writeStoredPanelPosition(clampedPosition);
        return clampedPosition;
      });
    });
  };

  // const stats = currentSystem
  //   ? [
  //     {
  //       id: 'stars',
  //       label: intl.formatMessage({ id: 'starMap.stats.stars', defaultMessage: 'Stars' }),
  //       value: formatCount(currentSystem.counts.star),
  //     },
  //     {
  //       id: 'planets',
  //       label: intl.formatMessage({ id: 'starMap.stats.planets', defaultMessage: 'Planets' }),
  //       value: formatCount(currentSystem.counts.planet),
  //     },
  //     {
  //       id: 'moons',
  //       label: intl.formatMessage({ id: 'starMap.stats.moons', defaultMessage: 'Moons' }),
  //       value: formatCount(currentSystem.counts.moon),
  //     },
  //     {
  //       id: 'stations',
  //       label: intl.formatMessage({ id: 'starMap.stats.stations', defaultMessage: 'Stations' }),
  //       value: formatCount(currentSystem.counts.station),
  //     },
  //   ]
  //   : [];
  const selectedDescription = selectedNode
    ? language === 'cn'
      ? selectedNode.descriptionCN
      : selectedNode.descriptionEN
    : null;
  const selectedSystemName = selectedDetail?.system
    ? localizeSystemName(selectedDetail.system, language)
    : currentSystem
      ? localizeSystemName(currentSystem, language)
      : '-';
  const selectedDetails = [
    {
      label: intl.formatMessage({ id: 'starMap.nodeType', defaultMessage: 'Type' }),
      value: selectedNode ? localizeNodeKind(selectedNode.kind, language) : '-',
    },
    {
      label: intl.formatMessage({ id: 'starMap.selectedSystem', defaultMessage: 'System' }),
      value: selectedSystemName,
    },
    {
      label: intl.formatMessage({ id: 'starMap.childCount', defaultMessage: 'Children' }),
      value: selectedNode ? selectedNode.childCount : '-',
    },
  ];

  return (
    <Box
      component="main"
      sx={{
        position: 'absolute',
        insetInline: 0,
        bottom: 0,
        top: `${HEADER_HEIGHT_PX}px`,
        height: `calc(100vh - ${HEADER_HEIGHT_PX}px)`,
        width: '100%',
        overflow: 'hidden',
        bgcolor: theme.palette.mode === 'dark' ? '#02050a' : '#dceaf5',
        color: 'text.primary',
        textAlign: 'left',
      }}
    >
      <citizenshub-star-map className="absolute inset-0 block h-full w-full" ref={mapRef} />

      <Paper
        component="section"
        elevation={0}
        ref={panelRef}
        aria-label={intl.formatMessage({ id: 'starMap.controls', defaultMessage: 'Star map controls' })}
        sx={{
          position: 'absolute',
          zIndex: 2,
          top: panelPosition.y,
          left: panelPosition.x,
          width: { xs: 'min(380px, calc(100vw - 24px))', sm: 380 },
          maxHeight: { xs: 'calc(100% - 24px)', md: 'calc(100% - 40px)' },
          overflow: isPanelCollapsed ? 'hidden' : 'auto',
          p: { xs: 1.75, sm: 2 },
          border: '1px solid',
          borderColor: theme.palette.mode === 'dark' ? alpha('#ffffff', 0.12) : alpha('#0f172a', 0.12),
          borderRadius: PANEL_RADIUS,
          bgcolor: theme.palette.mode === 'dark' ? alpha('#121212', 0.84) : alpha('#ffffff', 0.86),
          backdropFilter: 'blur(18px)',
          boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 18px 48px rgba(15, 23, 42, 0.16)',
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Stack
              aria-label={intl.formatMessage({ id: 'starMap.moveControls', defaultMessage: 'Move controls' })}
              direction="row"
              alignItems="center"
              spacing={0.75}
              onPointerCancel={handlePanelDragEnd}
              onPointerDown={handlePanelDragStart}
              onPointerMove={handlePanelDragMove}
              onPointerUp={handlePanelDragEnd}
              sx={{
                minWidth: 0,
                flex: 1,
                cursor: 'grab',
                touchAction: 'none',
                userSelect: 'none',
                color: 'text.secondary',
                '&:active': {
                  cursor: 'grabbing',
                },
              }}
            >
              <GripHorizontal size={17} />
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.3 }} noWrap>
                <FormattedMessage id="starMap.controls" defaultMessage="Star map controls" />
              </Typography>
            </Stack>
            <Tooltip
              title={intl.formatMessage({
                id: isPanelCollapsed ? 'starMap.expandControls' : 'starMap.collapseControls',
                defaultMessage: isPanelCollapsed ? 'Expand controls' : 'Collapse controls',
              })}
            >
              <IconButton
                aria-label={intl.formatMessage({
                  id: isPanelCollapsed ? 'starMap.expandControls' : 'starMap.collapseControls',
                  defaultMessage: isPanelCollapsed ? 'Expand controls' : 'Collapse controls',
                })}
                aria-expanded={!isPanelCollapsed}
                onClick={handlePanelCollapseToggle}
                size="small"
                sx={getToggleButtonSx(false)}
              >
                {isPanelCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
              </IconButton>
            </Tooltip>
          </Stack>

          {!isPanelCollapsed ? (
            <>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <FormControl
              disabled={systemOptions.length === 0}
              fullWidth
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: PANEL_RADIUS,
                  bgcolor: theme.palette.mode === 'dark' ? alpha('#000000', 0.24) : alpha('#ffffff', 0.72),
                },
              }}
            >
              <InputLabel id="star-map-system-label">
                {intl.formatMessage({ id: 'starMap.system', defaultMessage: 'System' })}
              </InputLabel>
              <Select
                label={intl.formatMessage({ id: 'starMap.system', defaultMessage: 'System' })}
                labelId="star-map-system-label"
                id="star-map-system"
                name="star-map-system"
                onChange={handleSystemChange}
                value={snapshot.systemId ?? ''}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      borderRadius: PANEL_RADIUS,
                      border: '1px solid',
                      borderColor: 'divider',
                    },
                  },
                }}
              >
                {systemOptions.map((system) => (
                  <MenuItem key={system.id} value={system.id}>
                    {system.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" spacing={0.75} flexShrink={0}>
              <Tooltip title={intl.formatMessage({ id: 'starMap.toggleOrbits', defaultMessage: 'Toggle orbits' })}>
                <IconButton
                  aria-label={intl.formatMessage({ id: 'starMap.toggleOrbits', defaultMessage: 'Toggle orbits' })}
                  aria-pressed={snapshot.showOrbits}
                  onClick={() => control.setShowOrbits(!snapshot.showOrbits)}
                  size="small"
                  sx={getToggleButtonSx(snapshot.showOrbits)}
                >
                  <Orbit size={18} />
                </IconButton>
              </Tooltip>
              <Tooltip title={intl.formatMessage({ id: 'starMap.togglePlaces', defaultMessage: 'Toggle places' })}>
                <IconButton
                  aria-label={intl.formatMessage({ id: 'starMap.togglePlaces', defaultMessage: 'Toggle places' })}
                  aria-pressed={snapshot.showPlaces}
                  onClick={() => control.setShowPlaces(!snapshot.showPlaces)}
                  size="small"
                  sx={getToggleButtonSx(snapshot.showPlaces)}
                >
                  <MapPin size={18} />
                </IconButton>
              </Tooltip>
              <Tooltip title={intl.formatMessage({ id: 'starMap.toggleRotationAxes', defaultMessage: 'Toggle rotation axes' })}>
                <IconButton
                  aria-label={intl.formatMessage({ id: 'starMap.toggleRotationAxes', defaultMessage: 'Toggle rotation axes' })}
                  aria-pressed={snapshot.showRotationAxes}
                  onClick={() => control.setShowRotationAxes(!snapshot.showRotationAxes)}
                  size="small"
                  sx={getToggleButtonSx(snapshot.showRotationAxes)}
                >
                  <Rotate3D size={18} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          <Autocomplete
            clearOnBlur={false}
            disabled={locationSearchOptions.length === 0}
            filterOptions={(options, state) => {
              const query = normalizeSearchText(state.inputValue);

              if (!query) {
                return options.slice(0, MAX_LOCATION_SEARCH_RESULTS);
              }

              return options
                .filter((option) => option.searchText.includes(query))
                .slice(0, MAX_LOCATION_SEARCH_RESULTS);
            }}
            getOptionLabel={(option) => getLocationSearchOptionLabel(option, language)}
            inputValue={locationSearchInput}
            isOptionEqualToValue={(option, value) => option.key === value.key}
            noOptionsText={intl.formatMessage({ id: 'starMap.noSearchResults', defaultMessage: 'No locations found' })}
            onChange={handleLocationSelect}
            onInputChange={(_event, value, reason) => {
              setLocationSearchInput(value);

              if (reason === 'clear') {
                setLocationSearchValue(null);
              }
            }}
            options={locationSearchOptions}
            size="small"
            value={locationSearchValue}
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'starMap.search', defaultMessage: 'Search locations' })}
                placeholder={intl.formatMessage({ id: 'starMap.searchPlaceholder', defaultMessage: 'Chinese or English name' })}
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <>
                      <InputAdornment position="start">
                        <Search size={16} />
                      </InputAdornment>
                      {params.InputProps.startAdornment}
                    </>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: PANEL_RADIUS,
                    bgcolor: theme.palette.mode === 'dark' ? alpha('#000000', 0.24) : alpha('#ffffff', 0.72),
                  },
                }}
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} key={option.key} sx={{ alignItems: 'flex-start !important' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                    {language === 'cn' ? option.node.nameCN : option.node.nameEN}
                  </Typography>
                  {language === 'cn' && option.node.nameCN !== option.node.nameEN ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                      {option.node.nameEN}
                    </Typography>
                  ) : null}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                    {language === 'cn' ? option.system.systemNameCN : option.system.systemNameEN}
                  </Typography>
                </Box>
              </Box>
            )}
          />

          {/* {currentSystem ? (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 1,
              }}
            >
              {stats.map((stat) => (
                <Box
                  key={stat.id}
                  sx={{
                    minWidth: 0,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: PANEL_RADIUS,
                    bgcolor: theme.palette.mode === 'dark' ? alpha('#ffffff', 0.04) : alpha('#ffffff', 0.62),
                    px: { xs: 1, sm: 1.25 },
                    py: 1,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" noWrap display="block">
                    {stat.label}
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.25, fontWeight: 700, lineHeight: 1.1 }}>
                    {stat.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {snapshot.loading ? (
                <FormattedMessage id="starMap.loading" defaultMessage="Loading star system data..." />
              ) : (
                <FormattedMessage id="starMap.empty" defaultMessage="No star system data is available." />
              )}
            </Typography>
          )} */}

          {snapshot.error ? (
            <Alert severity="error" variant="outlined" sx={{ borderRadius: PANEL_RADIUS }}>
              <FormattedMessage id="starMap.error" defaultMessage="Failed to load star map: {message}" values={{ message: snapshot.error }} />
            </Alert>
          ) : null}

          <Divider />

          <Stack spacing={1.5}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                <FormattedMessage id="starMap.selected" defaultMessage="Selected" />
              </Typography>
              <LocateFixed size={16} color="currentColor" />
            </Stack>

            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.15, overflowWrap: 'anywhere' }}>
                  {selectedNode ? localizeName(selectedNode, language) : '-'}
                </Typography>
                {selectedNode && language === 'cn' && selectedNode.nameCN !== selectedNode.nameEN ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                    {selectedNode.nameEN}
                  </Typography>
                ) : null}
              </Box>
              {selectedNode?.nameEN ? (
                <Tooltip
                  title={intl.formatMessage({
                    id: copiedNodeId === selectedNode.id ? 'starMap.copiedEnglishName' : 'starMap.copyEnglishName',
                    defaultMessage: copiedNodeId === selectedNode.id ? 'Copied' : 'Copy English name',
                  })}
                >
                  <IconButton
                    aria-label={intl.formatMessage({ id: 'starMap.copyEnglishName', defaultMessage: 'Copy English name' })}
                    onClick={handleCopyEnglishName}
                    size="small"
                    sx={getToggleButtonSx(copiedNodeId === selectedNode.id)}
                  >
                    {copiedNodeId === selectedNode.id ? <Check size={17} /> : <Copy size={17} />}
                  </IconButton>
                </Tooltip>
              ) : null}
            </Stack>

            <Stack component="dl" spacing={1} sx={{ m: 0 }}>
              {selectedDetails.map((item) => (
                <Box
                  key={item.label}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 2,
                    pt: 1,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography component="dt" variant="caption" color="text.secondary" sx={{ m: 0 }}>
                    {item.label}
                  </Typography>
                  <Typography component="dd" variant="body2" sx={{ m: 0, textAlign: 'right', overflowWrap: 'anywhere' }}>
                    {item.value}
                  </Typography>
                </Box>
              ))}
            </Stack>

            {selectedDescription ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  display: { xs: 'none', sm: 'block' },
                  maxHeight: 172,
                  overflow: 'auto',
                  lineHeight: 1.55,
                }}
              >
                {selectedDescription}
              </Typography>
            ) : null}
          </Stack>
            </>
          ) : null}
        </Stack>
      </Paper>
    </Box>
  );
}
