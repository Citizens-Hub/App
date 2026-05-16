export const MANUFACTURER_LOGO_PATHS: Record<string, string> = {
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
  'greys market': '/rsi-manufacturers/greys-market.svg'
};

export const MANUFACTURER_LOGO_PATHS_BY_ID: Record<number, string> = {
  1: '/rsi-manufacturers/roberts-space-industries.svg',
  3: '/rsi-manufacturers/anvil-aerospace.svg',
  4: '/rsi-manufacturers/misc.svg',
  5: '/rsi-manufacturers/drake-interplanetary.svg',
  6: '/rsi-manufacturers/origin-jumpworks.svg',
  12: '/rsi-manufacturers/aegis-dynamics.svg',
  13: '/rsi-manufacturers/vanduul.svg',
  17: '/rsi-manufacturers/greycat-industrial.svg',
  19: '/rsi-manufacturers/kruger-intergalactic.svg',
  21: '/rsi-manufacturers/banu.svg',
  22: '/rsi-manufacturers/consolidated-outland.svg',
  68: '/rsi-manufacturers/crusader-industries.svg',
  69: '/rsi-manufacturers/esperia.svg',
  73: '/rsi-manufacturers/argo-astronautics.svg',
  81: '/rsi-manufacturers/aopoa.svg',
  83: '/rsi-manufacturers/tumbril.svg',
  93: '/rsi-manufacturers/gatac-manufacture.svg',
  96: '/rsi-manufacturers/mirai.svg',
  97: '/rsi-manufacturers/greys-market.svg'
};

function normalizeManufacturerName(name?: string | null) {
  return name?.trim().toLowerCase() || '';
}

export function getManufacturerLogoPath(
  manufacturer?: {
    id?: number | null;
    name?: string | null;
  } | string | null,
) {
  if (typeof manufacturer === 'string' || manufacturer == null) {
    return MANUFACTURER_LOGO_PATHS[normalizeManufacturerName(manufacturer)] || null;
  }

  if (manufacturer.id != null) {
    const logoPath = MANUFACTURER_LOGO_PATHS_BY_ID[manufacturer.id];
    if (logoPath) {
      return logoPath;
    }
  }

  return MANUFACTURER_LOGO_PATHS[normalizeManufacturerName(manufacturer.name)] || null;
}
