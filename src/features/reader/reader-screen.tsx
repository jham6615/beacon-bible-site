import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { NoteEditorModal } from '@/features/selection/note-editor-modal';
import { SelectionActionBar } from '@/features/selection/selection-action-bar';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_BOOK_ID, type ReadingPage, getBooks, getReadingPages } from '@/lib/bible';
import { useChatStore } from '@/store/chat-store';
import { useReaderStore } from '@/store/reader-store';
import { useSelectionStore } from '@/store/selection-store';
import { useLocalizedBookName, useVersionStore } from '@/store/versions-store';
import { BiblePicker } from './bible-picker';
import { ChapterPage } from './chapter-page';
import { DISPLAY_PANEL_HEIGHT, DisplayPanel } from './display-panel';
import { PickerDropdown } from './picker-dropdown';
import { ReferenceButton } from './reference-button';
import { VersionPicker } from './version-picker';

// Static data: building the whole-Bible page list and the book summary doesn't need to re-run
// on every mount (or every breakpoint cross).
const PAGES: ReadingPage[] = getReadingPages();
const BOOKS = getBooks();
const DEFAULT_INDEX = Math.max(
  0,
  PAGES.findIndex((p) => p.bookId === DEFAULT_BOOK_ID && p.chapter === 1),
);

const findPageIndex = (bookId: string, chapter: number) => {
  const i = PAGES.findIndex((p) => p.bookId === bookId && p.chapter === chapter);
  return i >= 0 ? i : DEFAULT_INDEX;
};

// Header edge padding, shared with the floating chapter arrows so the corners line up.
const HEADER_PAD = Spacing.three;

type Props =
  | {
      /** Mobile bottom-sheet layout. */
      mode: 'sheet';
      /** Height of the collapsed sheet showing above the reader's bottom edge. */
      peekInset: number;
      /** Live sheet height — the floating chapter arrows ride just above it. */
      navInset?: number;
    }
  | {
      /** Desktop split-pane layout. */
      mode: 'column';
      /** Width of the reader's pane — the horizontal pager must size pages to this, not the window. */
      paneWidth: number;
    };

export function ReaderScreen(props: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isSheet = props.mode === 'sheet';
  const width = isSheet ? windowWidth : props.paneWidth;
  const peekInset = isSheet ? props.peekInset : 0;

  // Seed from the store so reading position survives the WideLayout ↔ NarrowLayout swap that
  // happens when the user drags the viewport across the breakpoint.
  const [pageIndex, setPageIndex] = useState(() => {
    const pos = useReaderStore.getState();
    return findPageIndex(pos.bookId, pos.chapter);
  });
  const [picker, setPicker] = useState<'none' | 'book' | 'version' | 'display'>('none');
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerH, setHeaderH] = useState(56);
  const listRef = useRef<FlatList<ReadingPage>>(null);
  const clearSelection = useSelectionStore((s) => s.clear);
  const setPosition = useReaderStore((s) => s.setPosition);
  const storedBookId = useReaderStore((s) => s.bookId);
  const storedChapter = useReaderStore((s) => s.chapter);
  const versionCode = useVersionStore((s) => s.code);
  const setVersion = useVersionStore((s) => s.setVersion);
  const hydrateVersion = useVersionStore((s) => s.hydrate);
  const openHistory = useChatStore((s) => s.setHistoryOpen);

  const lastIndex = PAGES.length - 1;
  const current = PAGES[pageIndex];

  // Restore the saved version on first mount.
  useEffect(() => {
    hydrateVersion();
  }, [hydrateVersion]);

  // Selection is contextual to the visible chapter — clear it when the page changes.
  useEffect(() => {
    clearSelection();
  }, [pageIndex, clearSelection]);

  // Keep the reader position in the store so suggestions adapt to the passage AND so the next
  // mount of this screen can resume here.
  useEffect(() => {
    const p = PAGES[pageIndex];
    if (p) setPosition({ bookId: p.bookId, bookName: p.bookName, chapter: p.chapter });
  }, [pageIndex, setPosition]);

  // Externally-driven navigation: keyboard shortcuts (and any future deep link) bump the store, and
  // the pager follows. Only reacts to *store* changes; the round-trip from our own pageIndex effect
  // above lands here as a no-op because targetIndex matches pageIndex.
  useEffect(() => {
    const targetIndex = findPageIndex(storedBookId, storedChapter);
    if (targetIndex === pageIndex) return;
    setPicker('none');
    setPageIndex(targetIndex);
    // On web the FlatList isn't rendered, so the ref is null; skip the scroll call entirely.
    if (Platform.OS !== 'web') scrollToPage(targetIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedBookId, storedChapter]);

  // The pager scroll position is in PIXELS — when the pane resizes (chat collapse / divider drag end)
  // the per-page width changes and the current pixel offset no longer points at `pageIndex`. Re-snap
  // using scrollToOffset (which uses the current width directly, sidestepping any stale getItemLayout).
  // Deferred to the next frame so the FlatList has re-measured at the new width.
  // Height available to the FlatList — window minus top inset and header.
  // Passed explicitly to ChapterPage so each page has a defined height on web (without it the
  // inner ScrollView has no height constraint and vertical scrolling breaks).
  const listHeight = windowHeight - insets.top - headerH;

  // Shared RAF handle so any in-flight programmatic scroll can be cancelled before a new one fires.
  const scrollRafRef = useRef<number | null>(null);

  const scrollToPage = (index: number, animated: boolean) => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    // Defer to next frame: React Native Web's FlatList.scrollToOffset must run after the layout
    // pass that processes the state update, otherwise the DOM scroll is ignored.
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      listRef.current?.scrollToOffset({ offset: index * width, animated });
    });
  };

  const lastWidthRef = useRef(width);
  useEffect(() => {
    if (lastWidthRef.current === width) return;
    lastWidthRef.current = width;
    scrollToPage(pageIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, pageIndex]);

  const goToPage = (index: number, animated = true) => {
    if (index < 0 || index > lastIndex) return;
    setPicker('none');
    setPageIndex(index);
    // On web we render only the active chapter directly (no FlatList), so no scroll needed.
    if (Platform.OS !== 'web') scrollToPage(index, animated);
  };

  const jumpTo = (bookId: string, chapter: number) => {
    const index = findPageIndex(bookId, chapter);
    goToPage(index, false);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== pageIndex) setPageIndex(index);
  };

  // Keep the last-opened picker rendered through PickerDropdown's close animation.
  const lastPickerRef = useRef<'book' | 'version' | 'display'>('book');
  if (picker !== 'none') lastPickerRef.current = picker;
  const activePicker = lastPickerRef.current;

  // Book name in the active version's language (e.g. "Juan 3" while reading a Spanish Bible).
  const localizedBookName = useLocalizedBookName(
    current?.bookId ?? DEFAULT_BOOK_ID,
    current?.bookName ?? 'Bible',
  );

  const menuAction = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* YouVersion-style header: reference pill on the left, search + overflow menu on the right. */}
      <View style={styles.header} onLayout={(e) => setHeaderH(Math.round(e.nativeEvent.layout.height))}>
        <View style={styles.pillSlot}>
          <ReferenceButton
            bookLabel={current ? `${localizedBookName} ${current.chapter}` : 'Bible'}
            versionLabel={versionCode.toUpperCase()}
            active={picker === 'book' || picker === 'version' ? picker : null}
            onPressBook={() => setPicker((p) => (p === 'book' ? 'none' : 'book'))}
            onPressVersion={() => setPicker((p) => (p === 'version' ? 'none' : 'version'))}
          />
        </View>

        <View style={styles.rightCluster}>
          <Pressable
            onPress={() => router.push('/search')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Search the Bible"
            style={styles.iconButton}
          >
            <Ionicons name="search" size={20} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={() => setMenuOpen((m) => !m)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="More options"
            style={styles.iconButton}
          >
            <Text style={[styles.iconGlyph, { color: theme.text }]}>⋯</Text>
          </Pressable>
        </View>
      </View>


      {Platform.OS === 'web' ? (
        // On web there is no swipe gesture, so instead of a virtualized horizontal FlatList
        // (which has unreliable programmatic-scroll behavior on the web platform), we simply
        // render the active chapter directly. The `key` forces a remount — and a scroll reset
        // to the top — whenever the user navigates to a different chapter.
        <View style={{ flex: 1 }}>
          <ChapterPage
            key={pageIndex}
            chapter={PAGES[pageIndex]?.data ?? PAGES[DEFAULT_INDEX].data}
            width={width}
            pageHeight={listHeight}
            bottomInset={insets.bottom + peekInset}
            bookId={PAGES[pageIndex]?.bookId ?? DEFAULT_BOOK_ID}
            bookName={PAGES[pageIndex]?.bookName ?? ''}
            mode={props.mode}
          />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={PAGES}
          keyExtractor={(item) => `${item.bookId}-${item.chapter}`}
          renderItem={({ item }) => (
            <ChapterPage
              chapter={item.data}
              width={width}
              pageHeight={listHeight}
              bottomInset={insets.bottom + peekInset}
              bookId={item.bookId}
              bookName={item.bookName}
              mode={props.mode}
            />
          )}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={pageIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={onMomentumEnd}
          onScrollToIndexFailed={({ index }) =>
            listRef.current?.scrollToOffset({ offset: index * width, animated: false })
          }
          windowSize={5}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
        />
      )}

      {/* Floating chapter arrows, YouVersion-style: bottom corners over the text. In sheet mode
          they ride just above the sheet (its height already includes the bottom safe area) and
          disappear once the sheet takes over the screen (half/expanded). */}
      {(() => {
        const sheetTop = isSheet ? (props.navInset || peekInset + insets.bottom) : 0;
        const hidden = isSheet && sheetTop > windowHeight * 0.45;
        const bottom = isSheet ? sheetTop + Spacing.three : insets.bottom + Spacing.four;
        return hidden ? null : (
          <View pointerEvents="box-none" style={[styles.floatNav, { bottom }]}>
        <Pressable
          onPress={() => goToPage(pageIndex - 1)}
          disabled={pageIndex === 0}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Previous chapter"
          style={[styles.floatBtn, { backgroundColor: theme.backgroundElement, opacity: pageIndex === 0 ? 0.35 : 0.95 }]}
        >
          <Text style={[styles.floatIcon, { color: theme.text }]}>‹</Text>
        </Pressable>
        <Pressable
          onPress={() => goToPage(pageIndex + 1)}
          disabled={pageIndex === lastIndex}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Next chapter"
          style={[styles.floatBtn, { backgroundColor: theme.backgroundElement, opacity: pageIndex === lastIndex ? 0.35 : 0.95 }]}
        >
          <Text style={[styles.floatIcon, { color: theme.text }]}>›</Text>
        </Pressable>
          </View>
        );
      })()}

      {/* Overflow menu (⋯): compact anchored popover, YouVersion-style. */}
      {menuOpen && (
        <>
          <Pressable style={styles.menuScrim} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" />
          <View
            style={[
              styles.menu,
              { top: insets.top + headerH + Spacing.one, backgroundColor: theme.background, borderColor: theme.backgroundSelected },
            ]}
          >
            <Pressable style={styles.menuRow} onPress={menuAction(() => setPicker('display'))}>
              <Text style={[styles.menuGlyph, { color: theme.text }]}>Aa</Text>
              <Text style={[styles.menuLabel, { color: theme.text }]}>Fonts & Settings</Text>
            </Pressable>
            <Pressable style={styles.menuRow} onPress={menuAction(() => openHistory(true))}>
              <Text style={[styles.menuGlyph, { color: theme.text }]}>☰</Text>
              <Text style={[styles.menuLabel, { color: theme.text }]}>History</Text>
            </Pressable>
            <Pressable style={styles.menuRow} onPress={menuAction(() => router.push('/auth'))}>
              <View style={styles.menuGlyphSlot}>
                <Ionicons name="person-circle-outline" size={20} color={theme.text} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.text }]}>Account</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Highlight/note/copy toolbar while verses are selected. Sits under the header (zIndex 20)
          so the picker dropdown (zIndex 30) still covers it when open. */}
      <SelectionActionBar top={insets.top + headerH + Spacing.two} />
      <NoteEditorModal />

      {/* Book/version pickers slide down from under the header. PickerDropdown keeps the last content
          mounted through its close animation, so we render whichever picker was last active. */}
      <PickerDropdown
        open={picker !== 'none'}
        onClose={() => setPicker('none')}
        top={insets.top + headerH}
        contentH={activePicker === 'display' ? DISPLAY_PANEL_HEIGHT : undefined}
      >
        {activePicker === 'book' ? (
          <BiblePicker
            books={BOOKS}
            currentBookId={current?.bookId ?? DEFAULT_BOOK_ID}
            currentChapter={current?.chapter ?? 1}
            onSelect={jumpTo}
          />
        ) : activePicker === 'version' ? (
          <VersionPicker
            currentCode={versionCode}
            onSelect={(code, name) => {
              setVersion(code, name);
              setPicker('none');
            }}
          />
        ) : (
          <DisplayPanel />
        )}
      </PickerDropdown>
    </View>
  );
}

const styles = StyleSheet.create({
  // position:relative makes this the containing block for the absolute PickerDropdown, so on desktop
  // the dropdown confines to the reader pane instead of spilling under the chat column.
  container: { flex: 1, position: 'relative' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: HEADER_PAD,
    paddingVertical: Spacing.two,
  },
  // The pill hugs the left edge and gives way (ellipsizing) before the right icons ever clip.
  pillSlot: { flexShrink: 1, alignItems: 'flex-start' },
  rightCluster: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 0 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { fontSize: 20, fontWeight: '600' },
  // Invisible full-screen catcher so tapping anywhere else dismisses the menu.
  menuScrim: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 34 },
  menu: {
    position: 'absolute',
    right: HEADER_PAD,
    zIndex: 35,
    minWidth: 210,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  menuGlyph: { fontSize: 16, fontWeight: '700', width: 26, textAlign: 'center' },
  menuGlyphSlot: { width: 26, alignItems: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '600' },
  floatNav: {
    position: 'absolute',
    left: HEADER_PAD,
    right: HEADER_PAD,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  floatBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  floatIcon: { fontSize: 26, lineHeight: 30, fontWeight: '600' },
});
