import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BookSummary } from '@/lib/bible';
import { useVersionStore } from '@/store/versions-store';
import { BackRow, SearchInput } from './picker-chrome';

type Props = {
  books: BookSummary[];
  currentBookId: string;
  currentChapter: number;
  onSelect: (bookId: string, chapter: number) => void;
};

/**
 * Two-step book picker: search or browse the book list, tap a book to see its chapter grid, tap a
 * chapter to jump. Opens straight to the current book's chapters so the common case is one tap.
 */
export function BiblePicker({ books, currentBookId, currentChapter, onSelect }: Props) {
  const theme = useTheme();
  const localizedNames = useVersionStore((s) => s.bookNames);
  // The book whose chapters are showing; null = show the book list. Starts on the current book.
  const [openBookId, setOpenBookId] = useState<string | null>(currentBookId);
  const [query, setQuery] = useState('');

  // Book names in the active version's language (books arrive in canonical order, so nr = index+1).
  const named = useMemo(
    () => books.map((b, i) => ({ ...b, displayName: localizedNames?.[i + 1] ?? b.name })),
    [books, localizedNames],
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? named.filter((b) => b.name.toLowerCase().includes(q) || b.displayName.toLowerCase().includes(q))
        : named,
    [named, q],
  );

  // Search always overrides into the list view so results are visible.
  const openBook = !q && openBookId ? named.find((b) => b.id === openBookId) : undefined;

  if (openBook) {
    return (
      <View style={styles.fill}>
        <SearchInput value={query} onChangeText={setQuery} placeholder="Find a book" />
        <BackRow label="Books" onPress={() => setOpenBookId(null)} />
        <ScrollView style={styles.fill} contentContainerStyle={styles.gridContent} bounces={false}>
          <Text style={[styles.bookHeading, { color: theme.text, fontFamily: Fonts.serif }]}>{openBook.displayName}</Text>
          <View style={styles.grid}>
            {Array.from({ length: openBook.chapters }, (_, i) => {
              const ch = i + 1;
              const active = openBook.id === currentBookId && ch === currentChapter;
              return (
                <Pressable
                  key={ch}
                  onPress={() => onSelect(openBook.id, ch)}
                  style={[styles.cell, { backgroundColor: active ? theme.text : theme.backgroundElement }]}
                >
                  <Text style={[styles.cellText, { color: active ? theme.background : theme.text, fontFamily: Fonts.serif }]}>
                    {ch}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <SearchInput value={query} onChangeText={setQuery} placeholder="Find a book" />
      <ScrollView style={styles.fill} contentContainerStyle={styles.inner} bounces={false} keyboardShouldPersistTaps="handled">
        {filtered.map((b) => (
          <Pressable
            key={b.id}
            onPress={() => {
              setOpenBookId(b.id);
              setQuery('');
            }}
            style={styles.bookRow}
          >
            <Text style={[styles.bookName, { color: theme.text, fontWeight: b.id === currentBookId ? '700' : '500' }]}>
              {b.displayName}
            </Text>
            <Text style={[styles.chev, { color: theme.textSecondary }]}>›</Text>
          </Pressable>
        ))}
        {filtered.length === 0 && (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>No books match “{query}”.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingBottom: Spacing.three },
  gridContent: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingBottom: Spacing.three },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  bookName: { fontSize: 16 },
  chev: { fontSize: 18 },
  bookHeading: { fontSize: 20, fontWeight: '700', paddingVertical: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingBottom: Spacing.three },
  cell: { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 16, fontWeight: '600' },
  empty: { fontSize: 15, textAlign: 'center', paddingTop: Spacing.five },
});
