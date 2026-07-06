import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HighlightPalette, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { formatReference } from '@/features/selection/actions';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { HIGHLIGHT_COLORS } from '@/lib/annotations';
import { loadChapterVerses } from '@/lib/bible/versions';
import { chapterKey, useAnnotationsStore } from '@/store/annotations-store';
import { useNoteEditorStore } from '@/store/note-editor-store';
import { useSelectionStore } from '@/store/selection-store';
import { useVersionStore } from '@/store/versions-store';

/**
 * Floating toolbar shown while verses are selected: highlight colors, note, copy, clear —
 * YouVersion-style. Highlighting and notes need an account (tap routes to sign-in); copy works
 * for everyone. Anchored below the reader header so it never fights the chat sheet or keyboard.
 */
export function SelectionActionBar({ top }: { top: number }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const router = useRouter();
  const { session } = useAuth();

  const selection = useSelectionStore((s) => s.selection);
  const clearSelection = useSelectionStore((s) => s.clear);
  const version = useVersionStore((s) => s.code);
  const applyHighlight = useAnnotationsStore((s) => s.applyHighlight);
  const removeHighlight = useAnnotationsStore((s) => s.removeHighlight);
  const highlights = useAnnotationsStore((s) =>
    selection ? s.chapters[chapterKey(selection.bookId, selection.chapter)]?.highlights : undefined,
  );
  const openNoteEditor = useNoteEditorStore((s) => s.open);

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A fresh selection is a fresh copy target.
  useEffect(() => {
    setCopied(false);
  }, [selection]);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  if (!selection || selection.verses.length === 0) return null;

  const hasHighlight = selection.verses.some((v) => highlights?.[v]);

  /** Highlights and notes are account data; route signed-out users to sign-in instead. */
  const requireAuth = (fn: () => void) => () => {
    if (!session) {
      router.push('/auth');
      return;
    }
    fn();
  };

  const onCopy = async () => {
    const sorted = [...selection.verses].sort((a, b) => a - b);
    const pick = (verses: { verse: number; text: string }[]) =>
      verses
        .filter((v) => sorted.includes(v.verse))
        .map((v) => v.text)
        .join(' ');

    // Copy from the version the user is reading; fall back to the bundled WEB text offline.
    let text = '';
    let label = version.toUpperCase();
    try {
      text = pick(await loadChapterVerses(version, selection.bookId, selection.chapter));
    } catch {
      text = '';
    }
    if (!text) {
      text = pick(await loadChapterVerses('web', selection.bookId, selection.chapter).catch(() => []));
      label = 'WEB';
    }
    if (!text) return;

    const ok = await Clipboard.setStringAsync(`"${text}"\n— ${formatReference(selection)} (${label})`).catch(
      () => false,
    );
    if (ok === false) return;
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View style={[styles.slot, { top }]} pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          { backgroundColor: theme.background, borderColor: theme.backgroundSelected },
        ]}
      >
        {HIGHLIGHT_COLORS.map((color) => (
          <Pressable
            key={color}
            accessibilityLabel={`Highlight ${color}`}
            onPress={requireAuth(() =>
              applyHighlight(selection.bookId, selection.chapter, selection.verses, color),
            )}
            hitSlop={6}
            style={[styles.dot, { backgroundColor: HighlightPalette[color][isDark ? 'dark' : 'light'] }]}
          />
        ))}

        {hasHighlight && (
          <Pressable
            accessibilityLabel="Remove highlight"
            onPress={requireAuth(() => removeHighlight(selection.bookId, selection.chapter, selection.verses))}
            hitSlop={6}
            style={[styles.dot, styles.removeDot, { borderColor: theme.textSecondary }]}
          >
            <Text style={[styles.removeSlash, { color: theme.textSecondary }]}>/</Text>
          </Pressable>
        )}

        <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

        <Pressable
          onPress={requireAuth(() =>
            openNoteEditor({
              mode: 'create',
              bookId: selection.bookId,
              bookName: selection.bookName,
              chapter: selection.chapter,
              verses: [...selection.verses].sort((a, b) => a - b),
            }),
          )}
          hitSlop={6}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: theme.text }]}>Note</Text>
        </Pressable>

        <Pressable onPress={onCopy} hitSlop={6} style={styles.action}>
          <Text style={[styles.actionText, { color: copied ? theme.textSecondary : theme.text }]}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>

        <Pressable accessibilityLabel="Clear selection" onPress={clearSelection} hitSlop={6} style={styles.action}>
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    // Soft shadow so it reads as floating above the text (matches PickerDropdown).
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  dot: { width: 22, height: 22, borderRadius: 11 },
  removeDot: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeSlash: { fontSize: 14, fontWeight: '700', transform: [{ rotate: '15deg' }] },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: Spacing.one },
  action: { paddingHorizontal: Spacing.one, paddingVertical: Spacing.one },
  actionText: { fontSize: 14, fontWeight: '600' },
});
