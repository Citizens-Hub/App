import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Alert,
  Box,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
  type SelectChangeEvent,
} from '@mui/material';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import { LocateFixed, MapPin, Orbit, Rotate3D } from 'lucide-react';
import {
  createMapControl,
  defineStarMapElement,
  localizeName,
  type NodeSelectDetail,
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

defineStarMapElement();

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

function formatCount(value: number | undefined) {
  return value ?? 0;
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
  const [selectedDetail, setSelectedDetail] = useState<NodeSelectDetail | null>(null);

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

  const systemOptions = useMemo(
    () => snapshot.systems.map((system) => ({
      id: system.systemId,
      label: language === 'cn' ? system.starNameCN : system.starNameEN,
    })),
    [language, snapshot.systems],
  );

  const handleSystemChange = (event: SelectChangeEvent<string>) => {
    control.setSystemId(event.target.value);
    setSelectedDetail(null);
  };

  const stats = currentSystem
    ? [
      {
        id: 'stars',
        label: intl.formatMessage({ id: 'starMap.stats.stars', defaultMessage: 'Stars' }),
        value: formatCount(currentSystem.counts.star),
      },
      {
        id: 'planets',
        label: intl.formatMessage({ id: 'starMap.stats.planets', defaultMessage: 'Planets' }),
        value: formatCount(currentSystem.counts.planet),
      },
      {
        id: 'moons',
        label: intl.formatMessage({ id: 'starMap.stats.moons', defaultMessage: 'Moons' }),
        value: formatCount(currentSystem.counts.moon),
      },
      {
        id: 'stations',
        label: intl.formatMessage({ id: 'starMap.stats.stations', defaultMessage: 'Stations' }),
        value: formatCount(currentSystem.counts.station),
      },
    ]
    : [];
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
        aria-label={intl.formatMessage({ id: 'starMap.controls', defaultMessage: 'Star map controls' })}
        sx={{
          position: 'absolute',
          zIndex: 2,
          top: { xs: 12, md: 20 },
          left: { xs: 12, md: 20 },
          width: { xs: 'calc(100vw - 24px)', sm: 380 },
          maxHeight: { xs: 'calc(100% - 24px)', md: 'calc(100% - 40px)' },
          overflow: 'auto',
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
          <Stack spacing={0.5}>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.3 }}>
              <FormattedMessage id="starMap.eyebrow" defaultMessage="Persistent Universe" />
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.15 }}>
              <FormattedMessage id="starMap.title" defaultMessage="Star Map" />
            </Typography>
          </Stack>

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

          {currentSystem ? (
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
          )}

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

            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.15, overflowWrap: 'anywhere' }}>
              {selectedNode ? localizeName(selectedNode, language) : '-'}
            </Typography>

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
        </Stack>
      </Paper>
    </Box>
  );
}
