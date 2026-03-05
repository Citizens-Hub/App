import * as fs from 'node:fs';
import * as path from 'node:path';

type LocaleMessages = Record<string, string>;

interface CliArgs {
  verbose: boolean;
}

interface LocaleSnapshot {
  filename: string;
  keys: Set<string>;
}

function parseArgs(argv: readonly string[] = process.argv.slice(2)): CliArgs {
  const args = new Set(argv);
  return {
    verbose: args.has('--verbose'),
  };
}

function isLocaleMessages(value: unknown): value is LocaleMessages {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === 'string');
}

function loadLocales(localesDir: string): LocaleSnapshot[] {
  const localeFiles: string[] = fs
    .readdirSync(localesDir)
    .filter((file: string) => file.endsWith('.json'))
    .sort((a: string, b: string) => a.localeCompare(b));

  return localeFiles.map((filename: string) => {
    const fullPath = path.join(localesDir, filename);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);

    if (!isLocaleMessages(parsed)) {
      throw new Error(`Invalid locale format in ${filename}: expected a flat object of string values`);
    }

    return {
      filename,
      keys: new Set(Object.keys(parsed)),
    };
  });
}

function main(): void {
  const { verbose } = parseArgs();
  const localesDir = path.resolve(process.cwd(), 'src/locales');
  const locales = loadLocales(localesDir);

  if (locales.length === 0) {
    console.error('No locale files found in src/locales');
    process.exit(1);
  }

  const union = new Set<string>();
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
}

main();
