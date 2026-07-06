import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { deleteAccount } from '@/features/auth/delete-account';
import {
  AppleAuthentication,
  isAppleSignInAvailable,
  signInWithApple,
} from '@/features/auth/sign-in-with-apple';
import { signInWithGoogle } from '@/features/auth/sign-in-with-google';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useSubscriptionStore } from '@/store/subscription-store';

export default function AuthScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const isPremium = useSubscriptionStore((s) => s.isPremium);

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isAppleSignInAvailable().then((ok) => {
      if (!cancelled) setAppleAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (session) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + Spacing.five }]}>
        <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.serif }]}>Account</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{session.user.email}</Text>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.cardRow}>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Plan</Text>
            <Text style={[styles.cardValue, { color: theme.text }]}>{isPremium ? 'Premium' : 'Free'}</Text>
          </View>
          {!isPremium && (
            <Pressable onPress={() => router.push('/paywall')} style={styles.cardAction}>
              <Text style={[styles.cardActionText, { color: theme.text }]}>Upgrade to Premium →</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={[styles.primary, { backgroundColor: theme.text }]}
        >
          <Text style={[styles.primaryText, { color: theme.background }]}>Done</Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            await supabase.auth.signOut();
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
          style={styles.linkBtn}
        >
          <Text style={[styles.link, { color: theme.textSecondary }]}>Sign out</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            const message =
              'This permanently deletes your account, saved conversations, and subscription record. This cannot be undone.';
            const runDelete = async () => {
              setDeleting(true);
              try {
                await deleteAccount();
                await supabase.auth.signOut();
                router.replace('/');
              } catch (e) {
                const msg = e instanceof Error ? e.message : 'Please try again.';
                if (Platform.OS === 'web') {
                  // eslint-disable-next-line no-alert
                  window.alert(`Could not delete account: ${msg}`);
                } else {
                  Alert.alert('Could not delete account', msg);
                }
              } finally {
                setDeleting(false);
              }
            };

            // React Native's Alert.alert is a no-op on react-native-web — use window.confirm there
            // so the click actually surfaces something to the user.
            if (Platform.OS === 'web') {
              // eslint-disable-next-line no-alert
              if (window.confirm(`Delete account?\n\n${message}`)) {
                void runDelete();
              }
            } else {
              Alert.alert('Delete account', message, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: runDelete },
              ]);
            }
          }}
          disabled={deleting}
          style={styles.linkBtn}
        >
          {deleting ? (
            <ActivityIndicator color={theme.textSecondary} />
          ) : (
            <Text style={[styles.link, styles.destructive]}>Delete account</Text>
          )}
        </Pressable>
      </View>
    );
  }

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !busy;

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'signUp') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          setMessage('Check your email to confirm your account, then sign in.');
          setMode('signIn');
        } else {
          router.back();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.back();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await signInWithGoogle();
      router.back(); // straight back to reading after signing in
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Google sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onApple = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await signInWithApple();
      router.back();
    } catch (e) {
      // The Apple sheet throws ERR_REQUEST_CANCELED when the user dismisses it — not a real error.
      const code = (e as { code?: string })?.code;
      if (code === 'ERR_REQUEST_CANCELED') return;
      setMessage(e instanceof Error ? e.message : 'Apple sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + Spacing.five }]}>
        <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.serif }]}>
          {mode === 'signUp' ? 'Create your account' : 'Welcome back'}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {mode === 'signUp' ? 'Sign up to explore with Beacon Bible.' : 'Sign in to continue.'}
        </Text>

        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              mode === 'signUp'
                ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            buttonStyle={
              scheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={14}
            style={styles.appleBtn}
            onPress={onApple}
          />
        )}

        <Pressable
          onPress={onGoogle}
          disabled={busy}
          style={[styles.googleBtn, { borderColor: theme.backgroundSelected, opacity: busy ? 0.5 : 1 }]}
        >
          <Text style={[styles.googleText, { color: theme.text }]}>Continue with Google</Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={[styles.line, { backgroundColor: theme.backgroundSelected }]} />
          <Text style={[styles.or, { color: theme.textSecondary }]}>or</Text>
          <View style={[styles.line, { backgroundColor: theme.backgroundSelected }]} />
        </View>

        <TextInput
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
        />
        <TextInput
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          placeholder="Password (6+ characters)"
          placeholderTextColor={theme.textSecondary}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          secureTextEntry
        />

        {message ? <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={[styles.primary, { backgroundColor: theme.text, opacity: canSubmit ? 1 : 0.4 }]}
        >
          {busy ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <Text style={[styles.primaryText, { color: theme.background }]}>
              {mode === 'signUp' ? 'Create account' : 'Sign in'}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setMode(mode === 'signUp' ? 'signIn' : 'signUp');
            setMessage(null);
          }}
          style={styles.linkBtn}
        >
          <Text style={[styles.link, { color: theme.textSecondary }]}>
            {mode === 'signUp' ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.linkBtn}>
          <Text style={[styles.link, { color: theme.textSecondary }]}>Cancel</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.three },
  title: { fontSize: 30, fontWeight: '700' },
  subtitle: { fontSize: 15, marginTop: -Spacing.one, marginBottom: Spacing.one },
  input: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16 },
  appleBtn: { height: 50 },
  googleBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  googleText: { fontSize: 16, fontWeight: '600' },
  destructive: { color: '#c0392b', fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  line: { flex: 1, height: 1 },
  or: { fontSize: 13 },
  message: { fontSize: 14 },
  primary: {
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryText: { fontSize: 16, fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: Spacing.two },
  link: { fontSize: 14 },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two, marginTop: Spacing.two },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontSize: 14 },
  cardValue: { fontSize: 16, fontWeight: '700' },
  cardAction: { paddingTop: Spacing.one },
  cardActionText: { fontSize: 14, fontWeight: '600' },
});
