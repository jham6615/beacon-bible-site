import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useSettingsStore } from '@/store/settings-store';

/** System scheme unless the user picked an explicit theme in the Aa display panel. */
export function useColorScheme() {
  const system = useSystemColorScheme();
  const pref = useSettingsStore((s) => s.themePreference);
  return pref === 'system' ? system : pref;
}
