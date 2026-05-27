import type { Ship } from '@/types';

export interface MarketLocalizedSearchCandidate {
  value: string;
  normalizedValues: string[];
}

export function normalizeMarketLocalizedSearchValue(value?: string | null): string {
  return (value || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_\-:/|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scoreMarketLocalizedSearchCandidate(query: string, candidate: string): number {
  if (!query || !candidate) {
    return 0;
  }

  if (candidate === query) {
    return 1000 + candidate.length;
  }

  if (candidate.startsWith(query)) {
    return 700 + query.length;
  }

  if (candidate.includes(query)) {
    return 400 + query.length;
  }

  return 0;
}

export function buildMarketLocalizedSearchCandidates(localizedShips: Ship[]): MarketLocalizedSearchCandidate[] {
  if (localizedShips.length === 0) {
    return [];
  }

  return localizedShips.flatMap((ship) => {
    const entries: MarketLocalizedSearchCandidate[] = [];
    const addEntry = (value?: string | null, aliases: Array<string | null | undefined> = []) => {
      const trimmedValue = value?.trim();
      if (!trimmedValue) {
        return;
      }

      const normalizedValues = Array.from(new Set(
        aliases
          .map(normalizeMarketLocalizedSearchValue)
          .filter(Boolean),
      ));

      if (normalizedValues.length > 0) {
        entries.push({
          value: trimmedValue,
          normalizedValues,
        });
      }
    };

    addEntry(ship.name, [
      ship.localizedName,
      ship.name,
      ship.alias,
    ]);
    addEntry(ship.manufacturer.name, [
      ship.manufacturer.localizedName,
      ship.manufacturer.name,
    ]);

    return entries;
  });
}

function getNormalizedSearchWords(value: string): string[] {
  return normalizeMarketLocalizedSearchValue(value)
    .split(' ')
    .filter(Boolean);
}

function getDisplaySearchWords(value: string): string[] {
  return value
    .trim()
    .replace(/[\s_\-:/|]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function findCommonLeadingSearchTerm(values: string[]): string | null {
  if (values.length < 2) {
    return null;
  }

  const normalizedWordLists = values.map(getNormalizedSearchWords);
  const firstDisplayWords = getDisplaySearchWords(values[0] || '');
  const maxCommonLength = Math.min(
    firstDisplayWords.length,
    ...normalizedWordLists.map((words) => words.length),
  );
  let commonLength = 0;

  for (let index = 0; index < maxCommonLength; index += 1) {
    const firstWord = normalizedWordLists[0]?.[index];
    if (!firstWord || !normalizedWordLists.every((words) => words[index] === firstWord)) {
      break;
    }

    commonLength += 1;
  }

  if (commonLength === 0) {
    return null;
  }

  const commonTerm = firstDisplayWords.slice(0, commonLength).join(' ').trim();
  return normalizeMarketLocalizedSearchValue(commonTerm).length >= 2 ? commonTerm : null;
}

export function resolveLocalizedMarketSearchTerm(
  searchTerm: string,
  localizedSearchCandidates: MarketLocalizedSearchCandidate[],
): string {
  const trimmedSearchTerm = searchTerm.trim();
  const normalizedSearchTerm = normalizeMarketLocalizedSearchValue(trimmedSearchTerm);
  if (!trimmedSearchTerm || !normalizedSearchTerm || localizedSearchCandidates.length === 0) {
    return trimmedSearchTerm;
  }

  let bestScore = 0;
  const bestValuesByKey = new Map<string, string>();
  const considerMatch = (score: number, value?: string | null) => {
    const trimmedValue = value?.trim();
    if (!trimmedValue || score <= 0) {
      return;
    }

    if (score > bestScore) {
      bestScore = score;
      bestValuesByKey.clear();
    }

    if (score === bestScore) {
      bestValuesByKey.set(normalizeMarketLocalizedSearchValue(trimmedValue), trimmedValue);
    }
  };

  localizedSearchCandidates.forEach((candidate) => {
    candidate.normalizedValues.forEach((normalizedValue) => {
      considerMatch(scoreMarketLocalizedSearchCandidate(normalizedSearchTerm, normalizedValue), candidate.value);
    });
  });

  const bestValues = Array.from(bestValuesByKey.values());

  if (bestValues.length === 1) {
    return bestValues[0];
  }

  const commonSearchTerm = findCommonLeadingSearchTerm(bestValues);
  if (!commonSearchTerm) {
    return trimmedSearchTerm;
  }

  return normalizeMarketLocalizedSearchValue(commonSearchTerm) === normalizedSearchTerm
    ? trimmedSearchTerm
    : commonSearchTerm;
}
