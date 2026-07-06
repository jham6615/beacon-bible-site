import { create } from 'zustand';

import type { Note } from '@/lib/annotations';

/** What the note editor modal is working on: a new note for selected verses, or an existing note. */
export type NoteDraft =
  | { mode: 'create'; bookId: string; bookName: string; chapter: number; verses: number[] }
  | { mode: 'edit'; note: Note };

type NoteEditorState = {
  draft: NoteDraft | null;
  open: (draft: NoteDraft) => void;
  close: () => void;
};

export const useNoteEditorStore = create<NoteEditorState>((set) => ({
  draft: null,
  open: (draft) => set({ draft }),
  close: () => set({ draft: null }),
}));
