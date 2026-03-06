import * as fs from 'node:fs';
import * as path from 'node:path';

type LocaleMessages = Record<string, string>;
type UsageLocations = Map<string, Set<string>>;

interface CliArgs {
  verbose: boolean;
}

interface LocaleSnapshot {
  filename: string;
  keys: Set<string>;
}

interface SourceMatch {
  key: string;
  file: string;
  line: number;
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

function walkSourceFiles(dir: string, output: string[] = []): string[] {
  const entries: fs.Dirent[] = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'locales') {
        continue;
      }
      walkSourceFiles(fullPath, output);
      continue;
    }

    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) {
      output.push(fullPath);
    }
  }

  return output;
}

function getLineNumber(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function collectMessageUsage(srcDir: string): UsageLocations {
  const usage: UsageLocations = new Map<string, Set<string>>();
  const files: string[] = walkSourceFiles(srcDir);
  const formatMessageRegex = /(?:\bintl\s*\.\s*)?\bformatMessage\s*\(\s*\{\s*id\s*:\s*['"`]([^'"`]+)['"`]/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(process.cwd(), file);

    let match: RegExpExecArray | null;
    while ((match = formatMessageRegex.exec(content)) !== null) {
      const sourceMatch: SourceMatch = {
        key: match[1],
        file: relativePath,
        line: getLineNumber(content, match.index),
      };
      const location = `${sourceMatch.file}:${sourceMatch.line}`;

      if (!usage.has(sourceMatch.key)) {
        usage.set(sourceMatch.key, new Set<string>());
      }
      usage.get(sourceMatch.key)?.add(location);
    }
  }

  return usage;
}

function main(): void {
  const { verbose } = parseArgs();
  const localesDir = path.resolve(process.cwd(), 'src/locales');
  const srcDir = path.resolve(process.cwd(), 'src');
  const locales = loadLocales(localesDir);
  const usage = collectMessageUsage(srcDir);
  const usedKeys = [...usage.keys()].sort((a, b) => a.localeCompare(b));

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
  console.log(`Used message keys in source: ${usedKeys.length}`);
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
  } else {
    console.log(`Total missing keys across files: ${totalMissing}`);
  }

  console.log('');
  console.log('Checking source usage coverage...');

  let totalMissingUsedKeys = 0;
  for (const locale of locales) {
    const missingUsedKeys = usedKeys.filter((key) => !locale.keys.has(key));
    totalMissingUsedKeys += missingUsedKeys.length;
    console.log(`${locale.filename}: missing-used=${missingUsedKeys.length}`);

    if (verbose && missingUsedKeys.length > 0) {
      for (const key of missingUsedKeys) {
        const locations = [...(usage.get(key) ?? [])].slice(0, 3).join(', ');
        console.log(`  - ${key} (used at: ${locations})`);
      }
    }
  }

  const missingInAllLocales = usedKeys.filter((key) => locales.every((locale) => !locale.keys.has(key)));
  console.log('');
  console.log(`Missing used keys across locale files (sum): ${totalMissingUsedKeys}`);
  console.log(`Missing in all locales: ${missingInAllLocales.length}`);

  if (verbose && missingInAllLocales.length > 0) {
    for (const key of missingInAllLocales) {
      const locations = [...(usage.get(key) ?? [])].slice(0, 5).join(', ');
      console.log(`  - ${key} (used at: ${locations})`);
    }
  }
}

main();
