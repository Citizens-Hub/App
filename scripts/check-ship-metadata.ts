import fs from 'node:fs';
import path from 'node:path';

import {
  getShipMetadataEntry,
  SUPPORTED_SHIP_METADATA_LOCALES,
  type ShipMetadataGroup,
} from '../src/data/shipMetadataI18n.ts';

interface ShipLike {
  type?: string;
  focus?: string;
  flyableStatus?: string;
  details?: {
    size?: string;
    productionStatus?: string;
  } | null;
}

const EXTRA_COMPATIBILITY_VALUES: Record<ShipMetadataGroup, string[]> = {
  type: ['Multi-purpose'],
  size: ['Sub Capital', 'Extra Large'],
  status: ['Ready', 'Flight Ready', 'In Production'],
  focus: ['Combat/Cargo'],
};

function loadShips(): ShipLike[] {
  const filePath = path.resolve(process.cwd(), 'public/data/ships.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const data = Reflect.get(entry, 'data');
      if (typeof data !== 'object' || data === null) return [];
      const ships = Reflect.get(data, 'ships');
      return Array.isArray(ships) ? (ships as ShipLike[]) : [];
    });
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const data = Reflect.get(parsed, 'data');
    if (typeof data === 'object' && data !== null) {
      const ships = Reflect.get(data, 'ships');
      if (Array.isArray(ships)) {
        return ships as ShipLike[];
      }
    }
  }

  return [];
}

function collectValues(ships: ShipLike[], group: ShipMetadataGroup) {
  const values = new Set<string>(EXTRA_COMPATIBILITY_VALUES[group]);

  ships.forEach((ship) => {
    if (group === 'type' && ship.type) values.add(ship.type);
    if (group === 'focus' && ship.focus) values.add(ship.focus);
    if (group === 'status') {
      if (ship.flyableStatus) values.add(ship.flyableStatus);
      if (ship.details?.productionStatus) values.add(ship.details.productionStatus);
    }
    if (group === 'size' && ship.details?.size) values.add(ship.details.size);
  });

  return [...values].sort((left, right) => left.localeCompare(right));
}

function main() {
  const ships = loadShips();
  const groups: ShipMetadataGroup[] = ['type', 'size', 'status', 'focus'];
  let hasError = false;

  console.log(`Loaded ships: ${ships.length}`);

  groups.forEach((group) => {
    const values = collectValues(ships, group);
    const missingEntries: string[] = [];
    const missingLocales: Array<{ value: string; locales: string[] }> = [];

    values.forEach((value) => {
      const entry = getShipMetadataEntry(group, value);
      if (!entry.translations) {
        missingEntries.push(value);
        return;
      }

      const locales = SUPPORTED_SHIP_METADATA_LOCALES.filter((locale) => !entry.translations?.[locale]);
      if (locales.length > 0) {
        missingLocales.push({ value, locales });
      }
    });

    console.log(`\n[${group}] values=${values.length} missingEntries=${missingEntries.length} missingLocales=${missingLocales.length}`);

    if (missingEntries.length > 0) {
      hasError = true;
      missingEntries.forEach((value) => console.log(`  missing entry: ${JSON.stringify(value)}`));
    }

    if (missingLocales.length > 0) {
      hasError = true;
      missingLocales.forEach(({ value, locales }) => {
        console.log(`  missing locale(s): ${JSON.stringify(value)} -> ${locales.join(', ')}`);
      });
    }
  });

  if (hasError) {
    process.exitCode = 1;
    return;
  }

  console.log('\nShip metadata translations cover all scanned values.');
}

main();
