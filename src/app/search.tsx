import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBooks } from '@/lib/bible';
import { useReaderStore } from '@/store/reader-store';
import { useVersionStore } from '@/store/versions-store';

const BOOKS = getBooks();

type BookResult = {
  id: string;
  /** Bundled English name — what the reader store and AI context expect. */
  name: string;
  /** Name in the active version's language (falls back to English). */
  displayName: string;
  chapters: number;
};

/**
 * Bible navigation search (YouVersion-style): type a book name — in English or the active
 * version's language — and tap a chapter chip to jump. "John 3"-style references get a direct
 * "Go to" row. This searches locations, not verse text.
 */
export default function SearchScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const setPosition = useReaderStore((s) => s.setPosition);
  const localizedNames = useVersionStore((s) => s.bookNames);

  const [query, setQuery] = useState('');

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // Web: Esc closes, matching the pickers.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = query.trim().toLowerCase();
  // Trailing number = reference form ("john 3", "dan. 2"); the rest matches book names.
  const refMatch = q.match(/^(.+?)[\s.]+(\d{1,3})$/);
  const namePart = refMatch ? refMatch[1].trim() : q;
  const chapterPart = refMatch ? parseInt(refMatch[2], 10) : null;

  const results = useMemo<BookResult[]>(() => {
    const all = BOOKS.map((b, i) => ({
      id: b.id,
      name: b.name,
      displayName: localizedNames?.[i + 1] ?? b.name,
      chapters: b.chapters,
    }));
    if (!namePart) return all;
    const matches = all.filter((b) => {
      const en = b.name.toLowerCase();
      const loc = b.displayName.toLowerCase();
      return en.includes(namePart) || loc.includes(namePart);
    });
    // Prefix matches first ("jo" ranks John above Elijah-containing books), canonical order within.
    const rank = (b: BookResult) =>
      b.name.toLowerCase().startsWith(namePart) || b.displayName.toLowerCase().startsWith(namePart) ? 0 : 1;
    return [...matches].sort((a, b) => rank(a) - rank(b));
  }, [namePart, localizedNames]);

  // "john 3" with a valid chapter for the top match → one-tap direct row.
  const direct =
    chapterPart !== null && results.length > 0 && chapterPart >= 1 && chapterPart <= results[0].chapters
      ? { book: results[0], chapter: chapterPart }
      : null;

  const jump = (book: BookResult, chapter: number) => {
    setPosition({ bookId: book.id, bookName: book.name, chapter });
    close();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + Spacing.three }]}>
      <View style={styles.inner}>
        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="search" size={16} color={theme.textSecondary} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Book or reference, e.g. John 3"
              placeholderTextColor={theme.textSecondary}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>
          <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.cancel, { color: theme.text }]}>Cancel</Text>
          </Pressable>
        </View>

        {direct && (
          <Pressable
            onPress={() => jump(direct.book, direct.chapter)}
            style={[styles.directRow, { backgroundColor: theme.backgroundElement }]}
          >
            <Text style={[styles.directText, { color: theme.text, fontFamily: Fonts.serif }]}>
              Go to {direct.book.displayName} {direct.chapter}
            </Text>
            <Text style={[styles.directChevron, { color: theme.textSecondary }]}>›</Text>
          </Pressable>
        )}

        <FlatList
          data={results}
          keyExtractor={(b) => b.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.six }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textSecondary }]}>No books match “{query}”.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.bookBlock}>
              <Text style={[styles.bookName, { color: theme.text, fontFamily: Fonts.serif }]}>
                {item.displayName}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.chips}>
                  {Array.from({ length: item.chapters }, (_, i) => (
                    <Pressable
                      key={i + 1}
                      onPress={() => jump(item, i + 1)}
                      style={[styles.chip, { backgroundColor: theme.backgroundElement }]}
                    >
                      <Text style={[styles.chipText, { color: theme.text }]}>{i + 1}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.four },
  inner: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.three },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    height: 44,
  },
  input: { flex: 1, fontSize: 16, height: '100%' },
  cancel: { fontSize: 16, fontWeight: '600' },
  directRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    marginBottom: Spacing.two,
  },
  directText: { fontSize: 17, fontWeight: '700' },
  directChevron: { fontSize: 20 },
  bookBlock: { marginBottom: Spacing.four },
  bookName: { fontSize: 22, fontWeight: '700', marginBottom: Spacing.two },
  chips: { flexDirection: 'row', gap: Spacing.two },
  chip: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 18, fontWeight: '600' },
  empty: { fontSize: 15, textAlign: 'center', paddingTop: Spacing.five },
});
