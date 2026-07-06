import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { READER_FONT_SIZES, type ThemePreference, useSettingsStore } from '@/store/settings-store';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
];

/** Passed to PickerDropdown so it hugs this short panel instead of opening to picker height. */
export const DISPLAY_PANEL_HEIGHT = 236;

/** Aa settings: theme override + reader text size. Lives in the header dropdown. */
export function DisplayPanel() {
  const theme = useTheme();
  const pref = useSettingsStore((s) => s.themePreference);
  const fontIndex = useSettingsStore((s) => s.fontIndex);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);
  const setFontIndex = useSettingsStore((s) => s.setFontIndex);

  const atMin = fontIndex === 0;
  const atMax = fontIndex === READER_FONT_SIZES.length - 1;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Theme</Text>
      <View style={[styles.segments, { backgroundColor: theme.backgroundElement }]}>
        {THEME_OPTIONS.map((opt) => {
          const active = pref === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setThemePreference(opt.value)}
              style={[styles.segment, active && { backgroundColor: theme.backgroundSelected }]}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: active ? theme.text : theme.textSecondary, fontWeight: active ? '700' : '500' },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, { color: theme.textSecondary, marginTop: Spacing.four }]}>Text size</Text>
      <View style={[styles.sizeRow, { backgroundColor: theme.backgroundElement }]}>
        <Pressable onPress={() => setFontIndex(fontIndex - 1)} disabled={atMin} hitSlop={10} style={styles.sizeButton}>
          <Text style={[styles.sizeSmall, { color: theme.text, opacity: atMin ? 0.25 : 1 }]}>A</Text>
        </Pressable>
        <Text style={[styles.sizeValue, { color: theme.textSecondary, fontFamily: Fonts.serif }]}>
          {READER_FONT_SIZES[fontIndex]}
        </Text>
        <Pressable onPress={() => setFontIndex(fontIndex + 1)} disabled={atMax} hitSlop={10} style={styles.sizeButton}>
          <Text style={[styles.sizeBig, { color: theme.text, opacity: atMax ? 0.25 : 1 }]}>A</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: Spacing.two },
  label: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.two },
  segments: { flexDirection: 'row', borderRadius: 12, padding: Spacing.one },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two + Spacing.one,
    borderRadius: 9,
  },
  segmentText: { fontSize: 14 },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    height: 56,
  },
  sizeButton: { minWidth: 44, alignItems: 'center', justifyContent: 'center', height: '100%' },
  sizeSmall: { fontSize: 16, fontWeight: '600' },
  sizeBig: { fontSize: 26, fontWeight: '600' },
  sizeValue: { fontSize: 15 },
});
