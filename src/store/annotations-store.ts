import { create } from 'zustand';

import {
  createNote,
  deleteNote,
  fetchChapterAnnotations,
  removeHighlights,
  saveHighlights,
  updateNote,
  type HighlightColor,
  type Note,
} from '@/lib/annotations';

export const chapterKey = (bookId: string, chapter: number) => `${bookId}:${chapter}`;

export type ChapterAnnotations = {
  /** verse number -> highlight color */
  highlights: Record<number, HighlightColor>;
  notes: Note[];
};

export const EMPTY_ANNOTATIONS: ChapterAnnotations = { highlights: {}, notes: [] };

type AnnotationsState = {
  chapters: Record<string, ChapterAnnotations>;
  /** Chapter keys fetched (or in flight) this session — prevents duplicate loads. */
  loaded: Record<string, boolean>;
  /** Bumped by reset() so mounted chapters know to reload under the new auth state. */
  refreshKey: number;
  loadChapter: (bookId: string, chapter: number) => void;
  applyHighlight: (bookId: string, chapter: number, verses: number[], color: HighlightColor) => void;
  removeHighlight: (bookId: string, chapter: number, verses: number[]) => void;
  addNote: (bookId: string, chapter: number, verses: number[], content: string) => Promise<boolean>;
  editNote: (note: Note, content: string) => Promise<boolean>;
  removeNote: (note: Note) => Promise<boolean>;
  /** Sign-in/out or account switch: drop the cache; visible chapters refetch via refreshKey. */
  reset: () => void;
};

export const useAnnotationsStore = create<AnnotationsState>((set, get) => {
  /** Merge a partial update into one chapter's annotations. */
  const patchChapter = (key: string, patch: Partial<ChapterAnnotations>) =>
    set((state) => ({
      chapters: { ...state.chapters, [key]: { ...(state.chapters[key] ?? EMPTY_ANNOTATIONS), ...patch } },
    }));

  /** Re-pull one chapter from the server (used to recover after a failed optimistic write). */
  const refetch = (bookId: string, chapter: number) => {
    const key = chapterKey(bookId, chapter);
    fetchChapterAnnotations(bookId, chapter)
      .then(({ highlights, notes }) => {
        const byVerse: Record<number, HighlightColor> = {};
        for (const h of highlights) byVerse[h.verse] = h.color;
        patchChapter(key, { highlights: byVerse, notes });
      })
      .catch(() => {
        set((state) => {
          const loaded = { ...state.loaded };
          delete loaded[key];
          return { loaded };
        });
      });
  };

  return {
    chapters: {},
    loaded: {},
    refreshKey: 0,

    loadChapter: (bookId, chapter) => {
      const key = chapterKey(bookId, chapter);
      if (get().loaded[key]) return;
      set((state) => ({ loaded: { ...state.loaded, [key]: true } }));
      refetch(bookId, chapter);
    },

    applyHighlight: (bookId, chapter, verses, color) => {
      const key = chapterKey(bookId, chapter);
      const cur = get().chapters[key] ?? EMPTY_ANNOTATIONS;
      const highlights = { ...cur.highlights };
      for (const v of verses) highlights[v] = color;
      patchChapter(key, { highlights });
      saveHighlights(bookId, chapter, verses, color).then((ok) => {
        if (!ok) refetch(bookId, chapter);
      });
    },

    removeHighlight: (bookId, chapter, verses) => {
      const key = chapterKey(bookId, chapter);
      const cur = get().chapters[key] ?? EMPTY_ANNOTATIONS;
      const highlights = { ...cur.highlights };
      for (const v of verses) delete highlights[v];
      patchChapter(key, { highlights });
      removeHighlights(bookId, chapter, verses).then((ok) => {
        if (!ok) refetch(bookId, chapter);
      });
    },

    addNote: async (bookId, chapter, verses, content) => {
      const note = await createNote(bookId, chapter, verses, content);
      if (!note) return false;
      const key = chapterKey(bookId, chapter);
      const cur = get().chapters[key] ?? EMPTY_ANNOTATIONS;
      patchChapter(key, { notes: [...cur.notes, note] });
      return true;
    },

    editNote: async (note, content) => {
      const ok = await updateNote(note.id, content);
      if (!ok) return false;
      const key = chapterKey(note.bookId, note.chapter);
      const cur = get().chapters[key] ?? EMPTY_ANNOTATIONS;
      patchChapter(key, { notes: cur.notes.map((n) => (n.id === note.id ? { ...n, content } : n)) });
      return true;
    },

    removeNote: async (note) => {
      const ok = await deleteNote(note.id);
      if (!ok) return false;
      const key = chapterKey(note.bookId, note.chapter);
      const cur = get().chapters[key] ?? EMPTY_ANNOTATIONS;
      patchChapter(key, { notes: cur.notes.filter((n) => n.id !== note.id) });
      return true;
    },

    reset: () => set((state) => ({ chapters: {}, loaded: {}, refreshKey: state.refreshKey + 1 })),
  };
});
