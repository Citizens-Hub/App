const MANUFACTURER_LOGO_PATHS: Record<string, string> = {
  'aegis dynamics': '/rsi-manufacturers/aegis-dynamics.svg',
  'anvil aerospace': '/rsi-manufacturers/anvil-aerospace.svg',
  aopoa: '/rsi-manufacturers/aopoa.svg',
  'argo astronautics': '/rsi-manufacturers/argo-astronautics.svg',
  banu: '/rsi-manufacturers/banu.svg',
  'consolidated outland': '/rsi-manufacturers/consolidated-outland.svg',
  'crusader industries': '/rsi-manufacturers/crusader-industries.svg',
  'drake interplanetary': '/rsi-manufacturers/drake-interplanetary.svg',
  esperia: '/rsi-manufacturers/esperia.svg',
  'gatac manufacture': '/rsi-manufacturers/gatac-manufacture.svg',
  'greycat industrial': '/rsi-manufacturers/greycat-industrial.svg',
  'kruger intergalactic': '/rsi-manufacturers/kruger-intergalactic.svg',
  mirai: '/rsi-manufacturers/mirai.svg',
  misc: '/rsi-manufacturers/misc.svg',
  'origin jumpworks': '/rsi-manufacturers/origin-jumpworks.svg',
  'roberts space industries': '/rsi-manufacturers/roberts-space-industries.svg',
  tumbril: '/rsi-manufacturers/tumbril.svg',
  vanduul: '/rsi-manufacturers/vanduul.svg',
};

function normalizeManufacturerName(name?: string | null) {
  return name?.trim().toLowerCase() || '';
}

export function getManufacturerLogoPath(name?: string | null) {
  return MANUFACTURER_LOGO_PATHS[normalizeManufacturerName(name)] || null;
}
