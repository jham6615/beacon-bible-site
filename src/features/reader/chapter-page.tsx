import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Fonts, HighlightPalette, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { Note } from '@/lib/annotations';
import type { Chapter, Verse } from '@/lib/bible';
import { loadChapterVerses } from '@/lib/bible/versions';
import { chapterKey, useAnnotationsStore } from '@/store/annotations-store';
import { useNoteEditorStore } from '@/store/note-editor-store';
import { useSelectionStore } from '@/store/selection-store';
import { READER_FONT_SIZES, useSettingsStore } from '@/store/settings-store';
import { useVersionStore } from '@/store/versions-store';

type Props = {
  chapter: Chapter;
  width: number;
  /** Explicit height of the page — required so the inner ScrollView has a bounded container to
   *  scroll within. On web, a ScrollView without an explicit parent height expands to its full
   *  content height, making vertical scrolling impossible. */
  pageHeight: number;
  bottomInset: number;
  bookId: string;
  bookName: string;
  /** 'sheet' = mobile bottom-sheet layout (lift selected verses + reposition on keyboard).
   *  'column' = desktop split-pane (no sheet to lift above, no on-screen keyboard chasing). */
  mode: 'sheet' | 'column';
};

export function ChapterPage({ chapter, width, pageHeight, bottomInset, bookId, bookName, mode }: Props) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const selection = useSelectionStore((s) => s.selection);
  const toggleVerse = useSelectionStore((s) => s.toggleVerse);
  const version = useVersionStore((s) => s.code);
  const isSheet = mode === 'sheet';

  // Reader text size from the Aa display panel. Line height and verse-number size keep the
  // original 19pt proportions (32/19 and 12/19) at every step.
  const fontIndex = useSettingsStore((s) => s.fontIndex);
  const fontSize = READER_FONT_SIZES[fontIndex] ?? 19;
  const lineHeight = Math.round(fontSize * (32 / 19));
  const verseNumSize = Math.max(10, Math.round(fontSize * (12 / 19)));

  // The user's highlights + notes for this chapter (empty until signed in).
  const isDark = useColorScheme() === 'dark';
  const annotations = useAnnotationsStore((s) => s.chapters[chapterKey(bookId, chapter.chapter)]);
  const loadAnnotations = useAnnotationsStore((s) => s.loadChapter);
  const annotationsRefreshKey = useAnnotationsStore((s) => s.refreshKey);
  const openNoteEditor = useNoteEditorStore((s) => s.open);

  // refreshKey bumps on sign-in/out so the chapter refetches under the new account.
  useEffect(() => {
    loadAnnotations(bookId, chapter.chapter);
  }, [bookId, chapter.chapter, annotationsRefreshKey, loadAnnotations]);

  // ✎ marker on the first verse of each noted range.
  const noteByFirstVerse = useMemo(() => {
    const m = new Map<number, Note>();
    for (const n of annotations?.notes ?? []) {
      if (n.verses.length) m.set(Math.min(...n.verses), n);
    }
    return m;
  }, [annotations?.notes]);

  const [verses, setVerses] = useState<Verse[]>(version === 'web' ? chapter.verses : []);
  const [loading, setLoading] = useState(version !== 'web');

  // Load the active version's text for this chapter (WEB is bundled; others fetch + cache, falling
  // back to the bundled WEB text if the network fails).
  useEffect(() => {
    let cancelled = false;
    if (version === 'web') {
      setVerses(chapter.verses);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadChapterVerses(version, bookId, chapter.chapter)
      .then((vs) => {
        if (cancelled) return;
        setVerses(vs.length ? vs : chapter.verses);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setVerses(chapter.verses);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version, bookId, chapter]);

  const selectedVerses =
    selection && selection.bookId === bookId && selection.chapter === chapter.chapter
      ? selection.verses
      : [];
  const ownsSelection = selectedVerses.length > 0;

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  // Screen Y + scroll offset captured when a verse is tapped, so we can later lift it above the sheet.
  const anchor = useRef<{ pageY: number; scrollY: number } | null>(null);

  // When the keyboard rises (the reader starts typing), scroll the selected verse up so the floating sheet
  // doesn't cover it. Only the chapter that owns the selection subscribes — and only in sheet mode
  // (in column mode the chat input lives off to the side, so the reader must stay put).
  useEffect(() => {
    if (!isSheet || !ownsSelection) return;
    const evt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(evt, () => {
      const a = anchor.current;
      if (!a) return;
      const currentVerseY = a.pageY - (scrollY.current - a.scrollY);
      if (currentVerseY <= height * 0.4) return; // already above where the sheet will sit
      // Park the tapped point in the upper third: visible above the sheet, but not jammed off the top.
      const targetY = height * 0.3;
      scrollRef.current?.scrollTo({ y: Math.max(0, a.pageY + a.scrollY - targetY), animated: true });
    });
    return () => sub.remove();
  }, [isSheet, ownsSelection, height]);

  return (
    <View style={{ width, height: pageHeight }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.content,
          // Lift the bottom of the page so a tapped verse can scroll above the floating sheet —
          // but only in sheet mode. In column mode there's no sheet, so this padding is dead space.
          { paddingBottom: bottomInset + (isSheet && ownsSelection ? height * 0.5 : Spacing.six) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          <Text style={[styles.chapterNumber, { color: theme.text, fontFamily: Fonts.serif }]}>
            {chapter.chapter}
          </Text>
          {loading ? (
            <ActivityIndicator style={styles.loading} color={theme.textSecondary} />
          ) : (
            <Text style={{ color: theme.text, fontFamily: Fonts.serif, fontSize, lineHeight }}>
              {verses.map((v) => {
                const isSelected = selectedVerses.includes(v.verse);
                const highlight = annotations?.highlights[v.verse];
                const note = noteByFirstVerse.get(v.verse);
                // Selection (temporary) paints over any saved highlight; a dotted underline keeps
                // the selected range readable when it sits on top of highlighted verses.
                const background = isSelected
                  ? theme.backgroundSelected
                  : highlight
                    ? HighlightPalette[highlight][isDark ? 'dark' : 'light']
                    : undefined;
                const onToggle = (e: { nativeEvent: { pageY: number } }) => {
                  anchor.current = { pageY: e.nativeEvent.pageY, scrollY: scrollY.current };
                  toggleVerse({ bookId, bookName, chapter: chapter.chapter, verse: v.verse });
                };
                return (
                  <Text
                    key={v.verse}
                    onPress={onToggle}
                    onLongPress={onToggle}
                    style={[
                      background ? { backgroundColor: background } : null,
                      isSelected ? styles.selectedVerse : null,
                    ]}
                  >
                    <Text style={[styles.verseNumber, { color: theme.textSecondary, fontSize: verseNumSize }]}>{`${v.verse} `}</Text>
                    {v.text}
                    {note ? (
                      <Text
                        accessibilityLabel="Open note"
                        onPress={(e) => {
                          e.stopPropagation();
                          openNoteEditor({ mode: 'edit', note });
                        }}
                        style={{ color: theme.textSecondary }}
                      >
                        {' ✎'}
                      </Text>
                    ) : null}
                    {'  '}
                  </Text>
                );
              })}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, alignItems: 'center' },
  page: { width: '100%', maxWidth: MaxContentWidth },
  chapterNumber: { fontSize: 44, fontWeight: '700', marginBottom: Spacing.three },
  verseNumber: { fontWeight: '700' },
  // Dotted on iOS/web; Android falls back to a solid underline.
  selectedVerse: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  loading: { marginTop: Spacing.five },
});
