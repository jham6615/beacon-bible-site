import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type VersionMeta, fetchVersions } from '@/lib/bible/versions';
import { useVersionStore } from '@/store/versions-store';
import { BackRow, SearchInput } from './picker-chrome';

type Props = {
  currentCode: string;
  onSelect: (code: string, name: string) => void;
};

type PickerView = 'mine' | 'browse' | 'languages';

/**
 * YouVersion-style three-level version picker:
 *  - "My Versions": the user's shortlist (every version they've read), with a manage mode to remove.
 *  - Browse: search everything, or the versions of one language at a time.
 *  - "Bible Languages": all languages with version counts; picking one scopes the browse view.
 * Selecting a version anywhere makes it active and puts it on top of My Versions.
 */
export function VersionPicker({ currentCode, onSelect }: Props) {
  const theme = useTheme();
  const myVersions = useVersionStore((s) => s.myVersions);
  const removeMyVersion = useVersionStore((s) => s.removeMyVersion);

  const [view, setView] = useState<PickerView>('mine');
  const [editing, setEditing] = useState(false);
  const [browseLang, setBrowseLang] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [langQuery, setLangQuery] = useState('');

  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetchVersions()
      .then((v) => !cancelled && setVersions(v))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Languages, English first then alphabetical.
  const groups = useMemo(() => {
    if (!versions) return [] as [string, VersionMeta[]][];
    const byLang = new Map<string, VersionMeta[]>();
    for (const v of versions) {
      const arr = byLang.get(v.languageName) ?? [];
      arr.push(v);
      byLang.set(v.languageName, arr);
    }
    return [...byLang.entries()].sort((a, b) => {
      if (a[0] === 'English') return -1;
      if (b[0] === 'English') return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [versions]);

  // Browse opens scoped to the current version's language (once — then the user drives).
  const didInitLang = useRef(false);
  useEffect(() => {
    if (didInitLang.current || !versions) return;
    didInitLang.current = true;
    setBrowseLang(versions.find((v) => v.code === currentCode)?.languageName ?? 'English');
  }, [versions, currentCode]);

  const totalLine = versions ? `${versions.length} Versions in ${groups.length} Languages` : null;

  const q = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q || !versions) return [];
    return versions.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.code.toLowerCase().includes(q) ||
        v.languageName.toLowerCase().includes(q),
    );
  }, [versions, q]);

  const badge = (code: string) => (
    <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
      <Text style={[styles.badgeText, { color: theme.text, fontFamily: Fonts.serif }]} numberOfLines={1}>
        {code.toUpperCase()}
      </Text>
    </View>
  );

  const versionRow = (code: string, name: string, subtitle?: string) => {
    const active = code === currentCode;
    return (
      <Pressable
        key={code}
        onPress={() => onSelect(code, name)}
        style={[styles.row, active && { backgroundColor: theme.backgroundElement }]}
      >
        {badge(code)}
        <View style={styles.rowBody}>
          {subtitle ? (
            <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={2}>
            {name}
          </Text>
        </View>
        <Text style={[styles.rowMeta, { color: active ? theme.text : theme.textSecondary }]}>
          {active ? '✓' : '›'}
        </Text>
      </Pressable>
    );
  };

  // ---- My Versions --------------------------------------------------------------------------

  if (view === 'mine') {
    return (
      <View style={styles.fill}>
        <View style={styles.inner}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.serif }]}>
              {editing ? 'Settings' : 'My Versions'}
            </Text>
            <View style={styles.titleActions}>
              {editing ? (
                <Pressable
                  onPress={() => setEditing(false)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Done managing versions"
                  style={[styles.titleButton, { backgroundColor: theme.text }]}
                >
                  <Text style={[styles.titleButtonText, { color: theme.background }]}>✓</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    onPress={() => setEditing(true)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Manage my versions"
                    style={styles.titleButton}
                  >
                    <Ionicons name="settings-outline" size={20} color={theme.text} />
                  </Pressable>
                  <Pressable
                    onPress={() => setView('browse')}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Add more versions"
                    style={styles.titleButton}
                  >
                    <Text style={[styles.titleGlyph, { color: theme.text }]}>＋</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </View>

        <ScrollView style={styles.fill} contentContainerStyle={styles.inner} bounces={false}>
          {myVersions.map((v) => {
            const active = v.code === currentCode;
            return (
              <View key={v.code} style={styles.manageRow}>
                {editing && (
                  <Pressable
                    onPress={() => removeMyVersion(v.code)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${v.name}`}
                    style={styles.removeDot}
                  >
                    <Text style={styles.removeMinus}>−</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={editing ? undefined : () => onSelect(v.code, v.name)}
                  style={[styles.row, styles.rowGrow, active && !editing && { backgroundColor: theme.backgroundElement }]}
                >
                  {badge(v.code)}
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={2}>
                      {v.name}
                    </Text>
                  </View>
                  {!editing && (
                    <Text style={[styles.rowMeta, { color: active ? theme.text : theme.textSecondary }]}>
                      {active ? '✓' : '›'}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })}

          {!editing && (
            <Pressable
              onPress={() => setView('browse')}
              style={[styles.moreButton, { backgroundColor: theme.backgroundElement }]}
            >
              <Text style={[styles.moreButtonText, { color: theme.text }]}>More Versions</Text>
            </Pressable>
          )}
          {totalLine && <Text style={[styles.totalLine, { color: theme.textSecondary }]}>{totalLine}</Text>}
        </ScrollView>
      </View>
    );
  }

  // ---- Shared loading / failure states for the catalog-backed views ---------------------------

  if (failed) {
    return (
      <View style={[styles.fill, styles.center]}>
        <Text style={{ color: theme.textSecondary }}>Couldn’t load versions.</Text>
        <Pressable onPress={() => setReloadKey((k) => k + 1)} style={[styles.retry, { backgroundColor: theme.text }]}>
          <Text style={{ color: theme.background, fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (!versions) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }

  // ---- Bible Languages -----------------------------------------------------------------------

  if (view === 'languages') {
    const lq = langQuery.trim().toLowerCase();
    const langs = lq ? groups.filter(([lang]) => lang.toLowerCase().includes(lq)) : groups;
    return (
      <View style={styles.fill}>
        <View style={styles.inner}>
          <BackRow label="Versions" onPress={() => setView('browse')} />
          <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.serif }]}>Bible Languages</Text>
          <SearchInput value={langQuery} onChangeText={setLangQuery} placeholder="Search languages" />
        </View>
        <ScrollView style={styles.fill} contentContainerStyle={styles.inner} bounces={false} keyboardShouldPersistTaps="handled">
          {langs.map(([lang, items]) => (
            <Pressable
              key={lang}
              onPress={() => {
                setBrowseLang(lang);
                setLangQuery('');
                setView('browse');
              }}
              style={styles.langRow}
            >
              <Text style={[styles.langName, { color: theme.text }]}>{lang}</Text>
              <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                {items.length} {browseLang === lang ? ' ✓' : ' ›'}
              </Text>
            </Pressable>
          ))}
          {langs.length === 0 && (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>No languages match “{langQuery}”.</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ---- Browse (search all, or one language's versions) ----------------------------------------

  const langItems = groups.find(([lang]) => lang === browseLang)?.[1] ?? [];

  return (
    <View style={styles.fill}>
      <View style={styles.inner}>
        <BackRow label="My Versions" onPress={() => setView('mine')} />
        {totalLine && <Text style={[styles.browseTitle, { color: theme.text }]}>{totalLine}</Text>}
        <SearchInput value={query} onChangeText={setQuery} placeholder="Search Versions" />
      </View>
      <ScrollView style={styles.fill} contentContainerStyle={styles.inner} bounces={false} keyboardShouldPersistTaps="handled">
        {q ? (
          <>
            {searchResults.map((v) => versionRow(v.code, v.name, v.languageName))}
            {searchResults.length === 0 && (
              <Text style={[styles.empty, { color: theme.textSecondary }]}>No versions match “{query}”.</Text>
            )}
          </>
        ) : (
          <>
            <Pressable onPress={() => setView('languages')} style={styles.langJumpRow}>
              <Ionicons name="globe-outline" size={18} color={theme.text} />
              <Text style={[styles.langName, { color: theme.text }]}>{browseLang ?? 'Languages'}</Text>
              <View style={[styles.countPill, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.countPillText, { color: theme.textSecondary }]}>{langItems.length}</Text>
              </View>
              <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>›</Text>
            </Pressable>
            {langItems.map((v) => versionRow(v.code, v.name))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  retry: { borderRadius: 12, paddingVertical: Spacing.two, paddingHorizontal: Spacing.four },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingBottom: Spacing.three },

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.two },
  title: { fontSize: 24, fontWeight: '700', marginBottom: Spacing.one },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  titleButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  titleButtonText: { fontSize: 16, fontWeight: '700' },
  titleGlyph: { fontSize: 20, fontWeight: '600' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: 12,
  },
  rowGrow: { flex: 1 },
  rowBody: { flex: 1, gap: 1 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowSubtitle: { fontSize: 12 },
  rowMeta: { fontSize: 14, fontWeight: '700' },
  badge: {
    minWidth: 52,
    maxWidth: 76,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },

  manageRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  removeDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E5484D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMinus: { color: '#fff', fontSize: 16, fontWeight: '800', lineHeight: 18 },

  moreButton: {
    alignSelf: 'center',
    borderRadius: 22,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.five,
    marginTop: Spacing.three,
  },
  moreButtonText: { fontSize: 15, fontWeight: '700' },
  totalLine: { fontSize: 13, textAlign: 'center', marginTop: Spacing.three },

  browseTitle: { fontSize: 16, fontWeight: '700', marginBottom: Spacing.two },
  langJumpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  langName: { fontSize: 16, fontWeight: '600' },
  countPill: { borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  countPillText: { fontSize: 12, fontWeight: '700' },
  empty: { fontSize: 15, textAlign: 'center', paddingTop: Spacing.five },
});
