import { useEffect, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useSettingsStore } from '@/store/settings-store';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 * Once hydrated, the user's explicit theme (from the Aa display panel) wins over the system scheme.
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const system = useSystemColorScheme();
  const pref = useSettingsStore((s) => s.themePreference);

  if (!hasHydrated) {
    return 'light';
  }

  return pref === 'system' ? system : pref;
}
