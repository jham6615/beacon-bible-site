import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Search field shown at the top of both pickers. */
export function SearchInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.searchWrap, { backgroundColor: theme.backgroundElement }]}>
      <Ionicons name="search" size={16} color={theme.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[styles.searchInput, { color: theme.text }]}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel="Clear search">
          <Text style={[styles.clear, { color: theme.textSecondary }]}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

/** "‹ Label" header that returns from a leaf view (chapters / versions) to its list. */
export function BackRow({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel={`Back to ${label}`}>
      <Text style={[styles.backChevron, { color: theme.text }]}>‹</Text>
      <Text style={[styles.backLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    height: 40,
    marginBottom: Spacing.two,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  clear: { fontSize: 14, fontWeight: '600' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.two },
  backChevron: { fontSize: 24, fontWeight: '600' },
  backLabel: { fontSize: 16, fontWeight: '700' },
});
