// Per-account verse highlights + notes (YouVersion-style), backed by the `highlights` and `notes`
// tables in Supabase. Calls are no-ops for signed-out users (RLS + the uid() guard) — the UI routes
// signed-out users to sign-in before offering these actions.

import { supabase } from '@/lib/supabase';

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

const isColor = (v: unknown): v is HighlightColor => HIGHLIGHT_COLORS.includes(v as HighlightColor);

export type Highlight = {
  bookId: string;
  chapter: number;
  verse: number;
  color: HighlightColor;
};

export type Note = {
  id: string;
  bookId: string;
  chapter: number;
  verses: number[];
  content: string;
  updatedAt: string;
};

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

type NoteRow = { id: string; book_id: string; chapter: number; verses: number[]; content: string; updated_at: string };

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  bookId: r.book_id,
  chapter: r.chapter,
  verses: Array.isArray(r.verses) ? r.verses : [],
  content: r.content,
  updatedAt: r.updated_at,
});

/** All of the user's highlights + notes for one chapter. Empty for signed-out users. */
export async function fetchChapterAnnotations(
  bookId: string,
  chapter: number,
): Promise<{ highlights: Highlight[]; notes: Note[] }> {
  const [h, n] = await Promise.all([
    supabase.from('highlights').select('verse, color').eq('book_id', bookId).eq('chapter', chapter),
    supabase
      .from('notes')
      .select('id, book_id, chapter, verses, content, updated_at')
      .eq('book_id', bookId)
      .eq('chapter', chapter),
  ]);
  return {
    highlights: (h.data ?? [])
      .filter((r) => isColor(r.color))
      .map((r) => ({ bookId, chapter, verse: r.verse, color: r.color as HighlightColor })),
    notes: (n.data ?? []).map((r) => toNote(r as NoteRow)),
  };
}

/** Highlight verses in a color (replaces any existing color on those verses). */
export async function saveHighlights(
  bookId: string,
  chapter: number,
  verses: number[],
  color: HighlightColor,
): Promise<boolean> {
  const userId = await uid();
  if (!userId) return false;
  const rows = verses.map((verse) => ({ user_id: userId, book_id: bookId, chapter, verse, color }));
  const { error } = await supabase
    .from('highlights')
    .upsert(rows, { onConflict: 'user_id,book_id,chapter,verse' });
  return !error;
}

export async function removeHighlights(bookId: string, chapter: number, verses: number[]): Promise<boolean> {
  const { error } = await supabase
    .from('highlights')
    .delete()
    .eq('book_id', bookId)
    .eq('chapter', chapter)
    .in('verse', verses);
  return !error;
}

export async function createNote(
  bookId: string,
  chapter: number,
  verses: number[],
  content: string,
): Promise<Note | null> {
  const userId = await uid();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('notes')
    .insert({ user_id: userId, book_id: bookId, chapter, verses, content })
    .select('id, book_id, chapter, verses, content, updated_at')
    .single();
  if (error || !data) return null;
  return toNote(data as NoteRow);
}

export async function updateNote(id: string, content: string): Promise<boolean> {
  const { error } = await supabase
    .from('notes')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function deleteNote(id: string): Promise<boolean> {
  const { error } = await supabase.from('notes').delete().eq('id', id);
  return !error;
}

/** Every highlight the user has, for the browse screen. */
export async function listAllHighlights(): Promise<Highlight[]> {
  const { data } = await supabase
    .from('highlights')
    .select('book_id, chapter, verse, color')
    .order('book_id')
    .order('chapter')
    .order('verse');
  return (data ?? [])
    .filter((r) => isColor(r.color))
    .map((r) => ({ bookId: r.book_id, chapter: r.chapter, verse: r.verse, color: r.color as HighlightColor }));
}

/** Every note the user has, most recent first, for the browse screen. */
export async function listAllNotes(): Promise<Note[]> {
  const { data } = await supabase
    .from('notes')
    .select('id, book_id, chapter, verses, content, updated_at')
    .order('updated_at', { ascending: false });
  return (data ?? []).map((r) => toNote(r as NoteRow));
}
