import fs from 'node:fs';
import path from 'node:path';

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    strict: args.has('--strict'),
    verbose: args.has('--verbose'),
  };
}

function loadLocales(localesDir) {
  const localeFiles = fs
    .readdirSync(localesDir)
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  return localeFiles.map((filename) => {
    const fullPath = path.join(localesDir, filename);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      filename,
      keys: new Set(Object.keys(parsed)),
    };
  });
}

function main() {
  const { strict, verbose } = parseArgs();
  const localesDir = path.resolve(process.cwd(), 'src/locales');
  const locales = loadLocales(localesDir);

  if (locales.length === 0) {
    console.error('No locale files found in src/locales');
    process.exit(1);
  }

  const union = new Set();
  locales.forEach((locale) => {
    locale.keys.forEach((key) => union.add(key));
  });
  const allKeys = [...union].sort((a, b) => a.localeCompare(b));

  console.log(`Locale files: ${locales.length}`);
  console.log(`Unique keys: ${allKeys.length}`);
  console.log('');

  let totalMissing = 0;
  for (const locale of locales) {
    const missing = allKeys.filter((key) => !locale.keys.has(key));
    totalMissing += missing.length;
    console.log(`${locale.filename}: keys=${locale.keys.size}, missing=${missing.length}`);
    if (verbose && missing.length > 0) {
      missing.forEach((key) => console.log(`  - ${key}`));
    }
  }

  console.log('');
  if (totalMissing === 0) {
    console.log('All locale files are complete.');
    return;
  }

  console.log(`Total missing keys across files: ${totalMissing}`);
  if (strict) {
    process.exit(1);
  }
}

main();
