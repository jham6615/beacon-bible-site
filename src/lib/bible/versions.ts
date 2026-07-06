// Multi-version support. WEB is bundled (instant, offline); every other version is fetched on demand
// from getbible.net (free, no key, ~117 public-domain translations across many languages) and cached
// in memory. Navigation uses the bundled canonical structure (66 books); a version only swaps the text,
// and any fetch failure falls back to the bundled WEB text so the reader never breaks.

import { getBook, getBooks } from './index';
import type { Verse } from './types';

const GETBIBLE = 'https://api.getbible.net/v2';

export type VersionMeta = {
  code: string;
  name: string;
  language: string; // BCP-47-ish code, e.g. "en"
  languageName: string; // display, e.g. "English"
  direction: 'ltr' | 'rtl';
};

// bookId -> getbible book number (1..66), derived lazily from the canonical bundled order.
let bookNumbers: Record<string, number> | null = null;
export function bookNumber(bookId: string): number | undefined {
  if (!bookNumbers) {
    bookNumbers = {};
    getBooks().forEach((b, i) => {
      bookNumbers![b.id] = i + 1;
    });
  }
  return bookNumbers[bookId];
}

let catalog: VersionMeta[] | null = null;

/** The list of available versions (cached after first load), sorted by language then name. */
export async function fetchVersions(): Promise<VersionMeta[]> {
  if (catalog) return catalog;
  const res = await fetch(`${GETBIBLE}/translations.json`);
  if (!res.ok) throw new Error(`Versions catalog ${res.status}`);
  const raw = (await res.json()) as Record<string, Record<string, string>>;
  const list = Object.values(raw)
    .filter((t) => t.abbreviation && t.translation)
    .map<VersionMeta>((t) => ({
      code: t.abbreviation,
      name: t.translation,
      language: t.lang || 'en',
      // `||` (not `??`) so an empty-string language name from the catalog falls back to "Other"
      // instead of creating a blank, unnamed language group.
      languageName: t.language || 'Other',
      direction: String(t.direction).toUpperCase() === 'RTL' ? 'rtl' : 'ltr',
    }));
  list.sort((a, b) => a.languageName.localeCompare(b.languageName) || a.name.localeCompare(b.name));
  catalog = list;
  return list;
}

// Localized book names per version (e.g. valera 43 -> "Juan"), from /{code}/books.json.
const localizedNamesCache = new Map<string, Record<number, string>>();
// Resolved names per language, for versions whose own catalog data ships English names.
const languageNamesCache = new Map<string, Record<number, string> | null>();

/** True when the fetched names actually differ from the bundled English ones (some getbible
 *  datasets — e.g. koreankjv — carry English book names even for non-English translations). */
function looksLocalized(map: Record<number, string>): boolean {
  let differing = 0;
  let total = 0;
  getBooks().forEach((b, i) => {
    const name = map[i + 1];
    if (!name) return;
    total++;
    if (name.trim().toLowerCase() !== b.name.trim().toLowerCase()) differing++;
  });
  return total >= 33 && differing / total > 0.5;
}

/**
 * Book names in the version's own language, keyed by book number (1..66). Null for the bundled WEB
 * (English names ship with the app) or when the catalog has no data / the fetch fails — callers fall
 * back to the bundled English names.
 */
export async function fetchLocalizedBookNames(code: string): Promise<Record<number, string> | null> {
  if (code === 'web') return null;
  const cached = localizedNamesCache.get(code);
  if (cached) return cached;
  try {
    const res = await fetch(`${GETBIBLE}/${code}/books.json`);
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, { nr?: number; name?: string }>;
    const map: Record<number, string> = {};
    for (const key of Object.keys(raw)) {
      const nr = Number(raw[key]?.nr ?? key);
      const name = raw[key]?.name;
      if (Number.isInteger(nr) && nr >= 1 && name) map[nr] = String(name);
    }
    if (Object.keys(map).length === 0) return null;
    localizedNamesCache.set(code, map);
    return map;
  } catch {
    return null;
  }
}

/**
 * Best-effort localized book names for a version. Uses the version's own books.json when it is
 * genuinely localized; otherwise borrows names from a sibling version of the same language
 * (koreankjv ships "Genesis"/"John" while korean ships "창세기"/"요한복음" — the reader should see
 * Korean either way). Null means: stick with the bundled English names.
 */
export async function resolveLocalizedBookNames(code: string): Promise<Record<number, string> | null> {
  if (code === 'web') return null;
  const own = await fetchLocalizedBookNames(code);
  if (own && looksLocalized(own)) return own;

  try {
    const catalog = await fetchVersions();
    const lang = catalog.find((v) => v.code === code)?.language;
    // English versions are already covered by the bundled names.
    if (!lang || lang === 'en' || lang.startsWith('en-')) return null;
    if (languageNamesCache.has(lang)) return languageNamesCache.get(lang) ?? null;
    const siblings = catalog.filter((v) => v.language === lang && v.code !== code).slice(0, 4);
    for (const sibling of siblings) {
      const names = await fetchLocalizedBookNames(sibling.code);
      if (names && looksLocalized(names)) {
        languageNamesCache.set(lang, names);
        return names;
      }
    }
    languageNamesCache.set(lang, null);
    return null;
  } catch {
    return null;
  }
}

type CachedChapter = { chapter: number; verses: Verse[] };
const bookCache = new Map<string, CachedChapter[]>(); // `${code}:${bookId}` -> chapters

/** Verses for one chapter in the given version. WEB is read from the bundle; others are fetched + cached. */
export async function loadChapterVerses(code: string, bookId: string, chapterNum: number): Promise<Verse[]> {
  if (code === 'web') {
    const ch = getBook('web', bookId)?.chapters.find((c) => c.chapter === chapterNum);
    return ch?.verses ?? [];
  }

  const key = `${code}:${bookId}`;
  let chapters = bookCache.get(key);
  if (!chapters) {
    const nr = bookNumber(bookId);
    if (!nr) throw new Error(`Unknown book ${bookId}`);
    const res = await fetch(`${GETBIBLE}/${code}/${nr}.json`);
    if (!res.ok) throw new Error(`${code} ${bookId} ${res.status}`);
    const raw = await res.json();
    chapters = (raw.chapters ?? []).map((c: { chapter: number; verses?: { verse: number; text: string }[] }) => ({
      chapter: c.chapter,
      verses: (c.verses ?? []).map((v) => ({ verse: v.verse, text: String(v.text).trim() })),
    }));
    bookCache.set(key, chapters as CachedChapter[]);
  }
  return chapters!.find((c) => c.chapter === chapterNum)?.verses ?? [];
}
