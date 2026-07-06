import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { bookNumber, resolveLocalizedBookNames } from '@/lib/bible/versions';

const STORAGE_KEY = 'bf:version';
const MY_VERSIONS_KEY = 'bf:myVersions';

export type SavedVersion = { code: string; name: string };

/** Always available: the bundled offline version. */
const DEFAULT_MY_VERSIONS: SavedVersion[] = [{ code: 'web', name: 'World English Bible' }];

type VersionState = {
  code: string;
  name: string;
  /** Book names in the active version's language (book nr 1..66 -> name), null = use bundled English. */
  bookNames: Record<number, string> | null;
  /** The picker's "My Versions" shortlist — every version the user has read, most recent first. */
  myVersions: SavedVersion[];
  /** Switch the active Bible version (and remember it). */
  setVersion: (code: string, name: string) => void;
  removeMyVersion: (code: string) => void;
  /** Load the saved version on app start. */
  hydrate: () => void;
};

function persistMyVersions(list: SavedVersion[]) {
  AsyncStorage.setItem(MY_VERSIONS_KEY, JSON.stringify(list)).catch(() => {});
}

export const useVersionStore = create<VersionState>((set, get) => {
  // Fetch the localized book names for `code`; ignore the result if the user switched again meanwhile.
  const loadNames = (code: string) => {
    if (code === 'web') {
      set({ bookNames: null });
      return;
    }
    resolveLocalizedBookNames(code)
      .then((names) => {
        if (get().code === code) set({ bookNames: names });
      })
      .catch(() => {});
  };

  /** Put a version at the top of My Versions (deduped) and persist. */
  const upsertMyVersion = (code: string, name: string) => {
    const list = [{ code, name }, ...get().myVersions.filter((v) => v.code !== code)];
    set({ myVersions: list });
    persistMyVersions(list);
  };

  return {
    code: 'web',
    name: 'World English Bible',
    bookNames: null,
    myVersions: DEFAULT_MY_VERSIONS,
    setVersion: (code, name) => {
      set({ code, name, bookNames: null });
      upsertMyVersion(code, name);
      loadNames(code);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ code, name })).catch(() => {});
    },
    removeMyVersion: (code) => {
      const list = get().myVersions.filter((v) => v.code !== code);
      const next = list.length ? list : DEFAULT_MY_VERSIONS;
      set({ myVersions: next });
      persistMyVersions(next);
    },
    hydrate: () => {
      AsyncStorage.getItem(MY_VERSIONS_KEY)
        .then((raw) => {
          if (!raw) return;
          const saved = JSON.parse(raw) as SavedVersion[];
          if (Array.isArray(saved) && saved.every((v) => v?.code && v?.name)) {
            set({ myVersions: saved.length ? saved : DEFAULT_MY_VERSIONS });
          }
        })
        .catch(() => {});
      AsyncStorage.getItem(STORAGE_KEY)
        .then((raw) => {
          if (!raw) return;
          const saved = JSON.parse(raw) as { code?: string; name?: string };
          if (saved.code && saved.name) {
            set({ code: saved.code, name: saved.name });
            // The active version always appears in My Versions, even from pre-shortlist installs.
            upsertMyVersion(saved.code, saved.name);
            loadNames(saved.code);
          }
        })
        .catch(() => {});
    },
  };
});

/** Book name in the active version's language, falling back to the bundled (English) name. */
export function useLocalizedBookName(bookId: string, fallback: string): string {
  const names = useVersionStore((s) => s.bookNames);
  if (!names) return fallback;
  const nr = bookNumber(bookId);
  return (nr && names[nr]) || fallback;
}
