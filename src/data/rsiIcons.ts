import { MarketItemType } from '@/types';

export type ShipComponentSectionKey = 'weapons' | 'avionics' | 'modular' | 'propulsions' | 'thrusters';
export type ShipMetricKey = 'type' | 'size' | 'status' | 'crew' | 'cargo' | 'scmSpeed' | 'afterburner' | 'dimensions' | 'msrp';

const ICON_BASE_PATH = '/rsi-icons';

const SECTION_ICON_KEYS: Record<ShipComponentSectionKey, string> = {
  weapons: 'weapons',
  avionics: 'computer',
  modular: 'utilityItems',
  propulsions: 'quantumDrives',
  thrusters: 'mainThrusters',
};

const SHIP_METRIC_ICON_KEYS: Record<Exclude<ShipMetricKey, 'type'>, string> = {
  size: 'shipSize',
  status: 'gameStatus',
  crew: 'shipCrew',
  cargo: 'shipCapacity',
  scmSpeed: 'shipSpeed',
  afterburner: 'shipSpeed',
  dimensions: 'shipSize',
  msrp: 'uec',
};

const COMPONENT_ICON_MATCHERS: Array<{ iconKey: string; patterns: RegExp[] }> = [
  { iconKey: 'radar', patterns: [/\bradar\b/] },
  { iconKey: 'computer', patterns: [/\bcomputer(s)?\b/, /\bavionics\b/] },
  { iconKey: 'fuelIntakes', patterns: [/\bfuel intake(s)?\b/] },
  { iconKey: 'fuelTanks', patterns: [/\bfuel tank(s)?\b/] },
  { iconKey: 'quantumDrives', patterns: [/\bquantum drive(s)?\b/, /\bqd\b/] },
  { iconKey: 'quantumFuelTanks', patterns: [/\bquantum fuel tank(s)?\b/] },
  { iconKey: 'jumpModules', patterns: [/\bjump module(s)?\b/] },
  { iconKey: 'mainThrusters', patterns: [/\bmain thruster(s)?\b/] },
  { iconKey: 'maneuveringThrusters', patterns: [/\bmaneuver(ing)? thruster(s)?\b/, /\bretro thruster(s)?\b/, /\bvtol\b/] },
  { iconKey: 'powerPlants', patterns: [/\bpower plant(s)?\b/] },
  { iconKey: 'coolers', patterns: [/\bcooler(s)?\b/] },
  { iconKey: 'shieldGenerator', patterns: [/\bshield generator(s)?\b/] },
  { iconKey: 'missiles', patterns: [/\bmissile(s)?\b/, /\btorpedo(es)?\b/, /\brack\b/] },
  { iconKey: 'turrets', patterns: [/\bturret(s)?\b/] },
  { iconKey: 'utilityItems', patterns: [/\butility item(s)?\b/, /\btractor\b/, /\bsalvage\b/] },
  { iconKey: 'weapons', patterns: [/\bweapon(s)?\b/, /\bcannon(s)?\b/, /\brepeater(s)?\b/, /\blaser(s)?\b/, /\bgun(s)?\b/] },
];

const SHIP_FOCUS_ICON_MATCHERS: Array<{ iconKey: string; patterns: RegExp[] }> = [
  { iconKey: 'combat', patterns: [/\bcombat\b/, /\bfighter\b/] },
  { iconKey: 'exploration', patterns: [/\bexploration\b/, /\bexplorer\b/] },
  { iconKey: 'industrial', patterns: [/\bindustrial\b/] },
  { iconKey: 'hauler', patterns: [/\bhauler\b/, /\bfreight\b/, /\bcargo\b/] },
  { iconKey: 'miner', patterns: [/\bminer\b/, /\bmining\b/] },
  { iconKey: 'multiRole', patterns: [/\bmulti role\b/, /\bmultirole\b/] },
  { iconKey: 'ground', patterns: [/\bground\b/, /\bvehicle\b/] },
  { iconKey: 'generalist', patterns: [/\bgeneralist\b/] },
  { iconKey: 'seeker', patterns: [/\bseeker\b/, /\binterdiction\b/] },
  { iconKey: 'transport', patterns: [/\btransport\b/, /\bpassenger\b/] },
  { iconKey: 'privateer', patterns: [/\bprivateer\b/, /\bcommerce\b/] },
  { iconKey: 'scavenger', patterns: [/\bscavenger\b/, /\bsalvage\b/] },
  { iconKey: 'duelist', patterns: [/\bduelist\b/, /\brace\b/, /\bracing\b/] },
];

function normalizeIconMatcherValue(value?: string | null) {
  if (!value) return '';

  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\w\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getRsiIconPath(iconKey?: string | null) {
  if (!iconKey) return null;
  return `${ICON_BASE_PATH}/${iconKey}.svg`;
}

export function getShipComponentSectionIconPath(sectionKey: ShipComponentSectionKey) {
  return getRsiIconPath(SECTION_ICON_KEYS[sectionKey]);
}

export function resolveShipComponentIconPath(
  sectionKey: ShipComponentSectionKey,
  component?: { name?: string | null; details?: string | null },
) {
  const searchableText = normalizeIconMatcherValue([component?.name, component?.details].filter(Boolean).join(' '));
  const matchedIcon = COMPONENT_ICON_MATCHERS.find(({ patterns }) => patterns.some((pattern) => pattern.test(searchableText)));

  return getRsiIconPath(matchedIcon?.iconKey || SECTION_ICON_KEYS[sectionKey]);
}

export function resolveShipTypeIconPath(type?: string | null) {
  const normalized = normalizeIconMatcherValue(type);

  if (!normalized) {
    return getRsiIconPath('ship');
  }

  if (/\b(vehicle|ground)\b/.test(normalized)) {
    return getRsiIconPath('ground');
  }

  return getRsiIconPath('ship');
}

export function resolveShipFocusIconPath(focus?: string | null) {
  const normalized = normalizeIconMatcherValue(focus);

  if (!normalized) {
    return null;
  }

  const matchedIcon = SHIP_FOCUS_ICON_MATCHERS.find(({ patterns }) => patterns.some((pattern) => pattern.test(normalized)));
  return getRsiIconPath(matchedIcon?.iconKey || null);
}

export function getShipMetricIconPath(metricKey: ShipMetricKey, shipType?: string | null) {
  if (metricKey === 'type') {
    return resolveShipTypeIconPath(shipType);
  }

  return getRsiIconPath(SHIP_METRIC_ICON_KEYS[metricKey]);
}

export function resolveMarketItemTypeIconPath(itemType: MarketItemType, packageKind?: string | null) {
  if (itemType === 'ccu') {
    return getRsiIconPath('shipUpgrade');
  }

  if (itemType === 'credit') {
    return getRsiIconPath('uec');
  }

  if (itemType === 'misc') {
    return getRsiIconPath('pack');
  }

  if (packageKind === 'bundle') {
    return getRsiIconPath('bundle');
  }

  if (packageKind === 'standalone_ship') {
    return getRsiIconPath('ship');
  }

  return getRsiIconPath('gamePackage');
}

export function resolveMarketDetailFieldIconPath(fieldKey: 'insurance' | 'creditAmount' | 'eligibleSellers') {
  if (fieldKey === 'insurance') {
    return getRsiIconPath('shieldGenerator');
  }

  if (fieldKey === 'creditAmount') {
    return getRsiIconPath('uec');
  }

  return getRsiIconPath('group');
}
