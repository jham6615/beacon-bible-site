-- Verse highlights and notes (YouVersion-style), per account. Free feature — any signed-in user.
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor) for project gkwcekrthkkumwfztlln,
-- or via `supabase db push`.

-- One row per highlighted verse; re-highlighting a verse in a new color replaces the row.
create table if not exists public.highlights (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  book_id     text not null,                          -- canonical bundled id, e.g. "JHN"
  chapter     int  not null,
  verse       int  not null,
  color       text not null,                          -- token: yellow|green|blue|pink|purple|orange
  created_at  timestamptz not null default now(),
  unique (user_id, book_id, chapter, verse)
);

alter table public.highlights enable row level security;

create policy "Users manage own highlights"
  on public.highlights for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Chapter loads ("all my highlights in John 3") and the browse screen.
create index if not exists highlights_user_book_chapter_idx
  on public.highlights (user_id, book_id, chapter);

-- One note per saved verse range (a note may span several verses).
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  book_id     text not null,
  chapter     int  not null,
  verses      int[] not null,                         -- sorted verse numbers the note attaches to
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy "Users manage own notes"
  on public.notes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists notes_user_book_chapter_idx
  on public.notes (user_id, book_id, chapter);

-- Most-recent-first listing for the browse screen.
create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);
