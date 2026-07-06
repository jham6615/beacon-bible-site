import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Fonts, HighlightPalette, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import {
  listAllHighlights,
  listAllNotes,
  type Highlight,
  type HighlightColor,
  type Note,
} from '@/lib/annotations';
import { DEFAULT_TRANSLATION, getBook, getBooks } from '@/lib/bible';
import { useReaderStore } from '@/store/reader-store';

type Run = { start: number; end: number; color: HighlightColor };
type HighlightGroup = { bookId: string; bookName: string; chapter: number; runs: Run[] };

/** Canonical book order for sorting (the API returns alphabetical book ids). */
const BOOK_INDEX = new Map(getBooks().map((b, i) => [b.id, i]));

const bookName = (bookId: string) => getBook(DEFAULT_TRANSLATION, bookId)?.name ?? bookId;

/** Collapse per-verse rows into contiguous same-color runs per chapter. */
function groupHighlights(rows: Highlight[]): HighlightGroup[] {
  const byChapter = new Map<string, Highlight[]>();
  for (const h of rows) {
    const key = `${h.bookId}:${h.chapter}`;
    const list = byChapter.get(key) ?? [];
    list.push(h);
    byChapter.set(key, list);
  }
  const groups: HighlightGroup[] = [];
  for (const list of byChapter.values()) {
    list.sort((a, b) => a.verse - b.verse);
    const runs: Run[] = [];
    for (const h of list) {
      const last = runs[runs.length - 1];
      if (last && h.verse === last.end + 1 && h.color === last.color) last.end = h.verse;
      else runs.push({ start: h.verse, end: h.verse, color: h.color });
    }
    groups.push({ bookId: list[0].bookId, bookName: bookName(list[0].bookId), chapter: list[0].chapter, runs });
  }
  groups.sort(
    (a, b) =>
      (BOOK_INDEX.get(a.bookId) ?? 99) - (BOOK_INDEX.get(b.bookId) ?? 99) || a.chapter - b.chapter,
  );
  return groups;
}

const runLabel = (r: Run) => (r.start === r.end ? `${r.start}` : `${r.start}–${r.end}`);

const noteReference = (n: Note) => {
  const sorted = [...n.verses].sort((a, b) => a - b);
  const range =
    sorted.length > 1 && sorted[sorted.length - 1] !== sorted[0]
      ? `${sorted[0]}–${sorted[sorted.length - 1]}`
      : `${sorted[0] ?? ''}`;
  return `${bookName(n.bookId)} ${n.chapter}${range ? `:${range}` : ''}`;
};

/**
 * The "Saved" tab of the history drawer: the user's notes (most recent first) and highlights
 * (canonical book order). Tapping a row jumps the reader to that passage and closes the drawer.
 * Refetches every time the tab becomes visible so it always reflects the latest annotations.
 */
export function SavedList({ active, onNavigate }: { active: boolean; onNavigate: () => void }) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { session } = useAuth();
  const setPosition = useReaderStore((s) => s.setPosition);

  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [groups, setGroups] = useState<HighlightGroup[]>([]);

  useEffect(() => {
    if (!active || !session) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([listAllNotes(), listAllHighlights()])
      .then(([n, h]) => {
        if (cancelled) return;
        setNotes(n);
        setGroups(groupHighlights(h));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, session]);

  const jumpTo = (bookId: string, chapter: number) => {
    setPosition({ bookId, bookName: bookName(bookId), chapter });
    onNavigate();
  };

  if (!session) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Sign in to keep highlights and notes across your devices.
        </Text>
        <Pressable
          onPress={() => {
            onNavigate();
            router.push('/auth');
          }}
          style={[styles.signIn, { backgroundColor: theme.text }]}
        >
          <Text style={[styles.signInText, { color: theme.background }]}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  if (loading && notes.length === 0 && groups.length === 0) {
    return <ActivityIndicator color={theme.text} style={{ marginTop: Spacing.five }} />;
  }

  if (notes.length === 0 && groups.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Nothing saved yet. Select verses while reading to highlight them or add a note.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.six }}>
      {notes.length > 0 && (
        <>
          <Text style={[styles.section, { color: theme.textSecondary }]}>Notes</Text>
          {notes.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => jumpTo(n.bookId, n.chapter)}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}
            >
              <Text style={[styles.rowTitle, { color: theme.text, fontFamily: Fonts.serif }]}>
                {noteReference(n)}
              </Text>
              <Text numberOfLines={2} style={[styles.rowBody, { color: theme.textSecondary }]}>
                {n.content}
              </Text>
            </Pressable>
          ))}
        </>
      )}

      {groups.length > 0 && (
        <>
          <Text style={[styles.section, { color: theme.textSecondary }]}>Highlights</Text>
          {groups.map((g) => (
            <Pressable
              key={`${g.bookId}:${g.chapter}`}
              onPress={() => jumpTo(g.bookId, g.chapter)}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}
            >
              <Text style={[styles.rowTitle, { color: theme.text, fontFamily: Fonts.serif }]}>
                {g.bookName} {g.chapter}
              </Text>
              <View style={styles.runRow}>
                {g.runs.map((r, i) => (
                  <View key={i} style={styles.run}>
                    <View
                      style={[styles.runDot, { backgroundColor: HighlightPalette[r.color][isDark ? 'dark' : 'light'] }]}
                    />
                    <Text style={[styles.runLabel, { color: theme.textSecondary }]}>{runLabel(r)}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '600', marginTop: Spacing.three, marginBottom: Spacing.two },
  row: { borderRadius: 14, padding: Spacing.three, marginBottom: Spacing.two, gap: Spacing.one },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  rowBody: { fontSize: 14, lineHeight: 20 },
  runRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  run: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  runDot: { width: 12, height: 12, borderRadius: 6 },
  runLabel: { fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: Spacing.six, gap: Spacing.three },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  signIn: { borderRadius: 14, paddingVertical: Spacing.three, paddingHorizontal: Spacing.five, minHeight: 48, justifyContent: 'center' },
  signInText: { fontSize: 16, fontWeight: '700' },
});
