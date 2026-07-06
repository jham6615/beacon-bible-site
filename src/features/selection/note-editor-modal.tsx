import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { formatReference } from '@/features/selection/actions';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_TRANSLATION, getBook } from '@/lib/bible';
import { useAnnotationsStore } from '@/store/annotations-store';
import { useNoteEditorStore, type NoteDraft } from '@/store/note-editor-store';
import { useSelectionStore } from '@/store/selection-store';

function referenceLabel(draft: NoteDraft): string {
  if (draft.mode === 'create') {
    return formatReference({
      bookId: draft.bookId,
      bookName: draft.bookName,
      chapter: draft.chapter,
      verses: draft.verses,
    });
  }
  const { note } = draft;
  return formatReference({
    bookId: note.bookId,
    bookName: getBook(DEFAULT_TRANSLATION, note.bookId)?.name ?? note.bookId,
    chapter: note.chapter,
    verses: note.verses,
  });
}

/** Create/edit modal for verse notes. Opened by the selection action bar (new note) or a ✎ marker (edit). */
export function NoteEditorModal() {
  const theme = useTheme();
  const draft = useNoteEditorStore((s) => s.draft);
  const close = useNoteEditorStore((s) => s.close);
  const addNote = useAnnotationsStore((s) => s.addNote);
  const editNote = useAnnotationsStore((s) => s.editNote);
  const removeNote = useAnnotationsStore((s) => s.removeNote);
  const clearSelection = useSelectionStore((s) => s.clear);

  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  // Each open starts from the draft's current text.
  useEffect(() => {
    setContent(draft?.mode === 'edit' ? draft.note.content : '');
    setBusy(false);
  }, [draft]);

  if (!draft) return null;

  const canSave = content.trim().length > 0 && !busy;

  const onSave = async () => {
    if (!canSave) return;
    setBusy(true);
    const ok =
      draft.mode === 'create'
        ? await addNote(draft.bookId, draft.chapter, draft.verses, content.trim())
        : await editNote(draft.note, content.trim());
    setBusy(false);
    if (!ok) return; // keep the modal open so nothing typed is lost
    if (draft.mode === 'create') clearSelection();
    close();
  };

  const onDelete = () => {
    if (draft.mode !== 'edit') return;
    const run = async () => {
      setBusy(true);
      const ok = await removeNote(draft.note);
      setBusy(false);
      if (ok) close();
    };
    // Alert.alert is a no-op on react-native-web — use window.confirm there (same pattern as auth).
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this note?')) void run();
    } else {
      Alert.alert('Delete note', 'Delete this note? This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void run() },
      ]);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close note" />
        <View style={[styles.card, { backgroundColor: theme.background }]}>
          <Text style={[styles.reference, { color: theme.text, fontFamily: Fonts.serif }]}>
            {referenceLabel(draft)}
          </Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            placeholder="Write a note…"
            placeholderTextColor={theme.textSecondary}
            value={content}
            onChangeText={setContent}
            multiline
            autoFocus
            textAlignVertical="top"
          />
          <View style={styles.buttonRow}>
            {draft.mode === 'edit' ? (
              <Pressable onPress={onDelete} disabled={busy} hitSlop={6} style={styles.textButton}>
                <Text style={[styles.textButtonLabel, styles.destructive]}>Delete</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <View style={styles.rightButtons}>
              <Pressable onPress={close} disabled={busy} hitSlop={6} style={styles.textButton}>
                <Text style={[styles.textButtonLabel, { color: theme.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSave}
                disabled={!canSave}
                style={[styles.saveButton, { backgroundColor: theme.text, opacity: canSave ? 1 : 0.4 }]}
              >
                {busy ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <Text style={[styles.saveLabel, { color: theme.background }]}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  reference: { fontSize: 18, fontWeight: '700' },
  input: {
    minHeight: 120,
    maxHeight: 260,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rightButtons: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  textButton: { paddingVertical: Spacing.two },
  textButtonLabel: { fontSize: 14, fontWeight: '600' },
  destructive: { color: '#c0392b' },
  saveButton: {
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + Spacing.one,
    minWidth: 88,
    alignItems: 'center',
  },
  saveLabel: { fontSize: 15, fontWeight: '700' },
});
