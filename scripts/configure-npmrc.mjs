import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const npmrcPath = join(appRoot, '.npmrc');

const managedEntries = [
  '@citizens-hub:registry=https://npm.pkg.github.com',
  '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}',
];

const managedPrefixes = [
  '@citizens-hub:registry=',
  '//npm.pkg.github.com/:_authToken=',
];

const existingContent = existsSync(npmrcPath) ? readFileSync(npmrcPath, 'utf8') : '';
const unmanagedLines = existingContent
  .split(/\r?\n/)
  .filter((line) => line.length > 0)
  .filter((line) => !managedPrefixes.some((prefix) => line.startsWith(prefix)));

const nextContent = [...unmanagedLines, ...managedEntries].join('\n') + '\n';

if (nextContent !== existingContent) {
  writeFileSync(npmrcPath, nextContent);
}

if (process.env.CF_PAGES && !process.env.NODE_AUTH_TOKEN) {
  console.warn('NODE_AUTH_TOKEN is not set; GitHub Packages installs may fail on Cloudflare.');
}

console.log('Configured npm registry for @citizens-hub GitHub Packages.');
