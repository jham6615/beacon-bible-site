import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'bf:settings';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Reader body sizes; index 2 (19pt) is the pre-feature default. */
export const READER_FONT_SIZES = [15, 17, 19, 21, 24, 28] as const;
export const DEFAULT_FONT_INDEX = 2;

type SettingsState = {
  themePreference: ThemePreference;
  fontIndex: number;
  setThemePreference: (pref: ThemePreference) => void;
  setFontIndex: (index: number) => void;
  /** Load saved display settings on app start. */
  hydrate: () => void;
};

function persist(themePreference: ThemePreference, fontIndex: number) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ themePreference, fontIndex })).catch(() => {});
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  themePreference: 'system',
  fontIndex: DEFAULT_FONT_INDEX,
  setThemePreference: (themePreference) => {
    set({ themePreference });
    persist(themePreference, get().fontIndex);
  },
  setFontIndex: (index) => {
    const fontIndex = Math.min(READER_FONT_SIZES.length - 1, Math.max(0, Math.round(index)));
    set({ fontIndex });
    persist(get().themePreference, fontIndex);
  },
  hydrate: () => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { themePreference?: unknown; fontIndex?: unknown };
        const patch: Partial<Pick<SettingsState, 'themePreference' | 'fontIndex'>> = {};
        if (saved.themePreference === 'system' || saved.themePreference === 'light' || saved.themePreference === 'dark') {
          patch.themePreference = saved.themePreference;
        }
        if (
          typeof saved.fontIndex === 'number' &&
          saved.fontIndex >= 0 &&
          saved.fontIndex < READER_FONT_SIZES.length
        ) {
          patch.fontIndex = Math.round(saved.fontIndex);
        }
        set(patch);
      })
      .catch(() => {});
  },
}));
