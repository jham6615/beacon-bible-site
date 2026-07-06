import { useRouter } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EULA_URL,
  PRIVACY_POLICY_URL,
  SUBSCRIPTION_LENGTH,
  SUBSCRIPTION_TITLE,
} from '@/constants/legal';
import { Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { startWebCheckout } from '@/lib/billing';
import { getCurrentOffering, purchasePackage, purchasesReady, restorePurchases } from '@/lib/revenuecat';
import { FREE_DAILY_LIMIT } from '@/store/subscription-store';

/** Display price for the monthly plan. Keep in sync with the Stripe Price and the App Store subscription. */
const PRICE_LABEL = '$4.99';

/**
 * Required by App Store Review Guideline 3.1.2(c) for auto-renewable subscriptions: the paywall
 * must state the subscription's title, length, price, auto-renewal terms, and cancel path. Wording
 * follows Apple's recommended template — do not soften without revisiting that guideline.
 */
const APPLE_DISCLOSURE = `${SUBSCRIPTION_TITLE} is a ${SUBSCRIPTION_LENGTH} auto-renewing subscription at ${PRICE_LABEL}/month. Payment is charged to your Apple ID at purchase confirmation. The subscription renews automatically unless canceled at least 24 hours before the end of the current period. Manage or cancel anytime in your App Store account settings.`;

const WEB_DISCLOSURE = `${SUBSCRIPTION_TITLE} is a ${SUBSCRIPTION_LENGTH} auto-renewing subscription at ${PRICE_LABEL}/month, billed by Stripe. Cancel anytime from the Stripe billing portal linked in your receipt.`;

const openLegal = (href: string) =>
  void openBrowserAsync(href, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });

const BENEFITS = [
  'Unlimited AI conversations',
  'Every translation & language',
  'First access to new features',
  'Support the mission',
];

export default function PaywallScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { session } = useAuth();
  // Payment is only allowed when signed in, so every subscription is bound to a Supabase account from
  // the moment of purchase — that account is the source of truth and unlocks premium on every platform.
  const signedIn = !!session;
  const subscribeLabel = signedIn ? 'Subscribe' : 'Sign in to subscribe';

  const isWeb = Platform.OS === 'web';
  const ready = purchasesReady();
  const [loading, setLoading] = useState(true);
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!ready) {
      setLoading(false);
      return;
    }
    getCurrentOffering()
      .then((offering) => {
        if (!active) return;
        setPkg(offering?.monthly ?? offering?.availablePackages[0] ?? null);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const priceLabel = pkg?.product.priceString ?? PRICE_LABEL;

  // Web: hand off to Stripe Checkout (full-page redirect). On success Stripe returns the browser to
  // PUBLIC_SITE_URL/?checkout=success, where the app refreshes the entitlement and unlocks premium.
  const subscribeWeb = async () => {
    if (!signedIn) {
      router.push('/auth'); // must be signed in to subscribe; returns here after sign-in
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await startWebCheckout();
    if (!result.ok) {
      setBusy(false);
      setMessage(result.message ?? 'Could not start checkout. Please try again.');
    }
    // On success the browser navigates away to Stripe, so we intentionally leave `busy` set.
  };

  const subscribe = async () => {
    if (!signedIn) {
      router.push('/auth'); // must be signed in to subscribe; returns here after sign-in
      return;
    }
    if (!pkg) return;
    setBusy(true);
    setMessage(null);
    const result = await purchasePackage(pkg);
    setBusy(false);
    if (result.status === 'success') {
      router.back();
    } else if (result.status === 'error') {
      setMessage(result.message);
    }
    // 'cancelled' → silently stay on the paywall
  };

  const restore = async () => {
    setBusy(true);
    setMessage(null);
    const result = await restorePurchases();
    setBusy(false);
    if (result.premium) router.back();
    else setMessage(result.message ?? 'No previous purchases found.');
  };

  // When not signed in, the button is still tappable — it routes to sign-in (no package needed yet).
  const canBuy = ready && !busy && (!signedIn || !!pkg);

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + Spacing.five }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.kicker, { color: theme.textSecondary }]}>SCRIPTURE ASK PREMIUM</Text>
        <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.serif }]}>Go deeper, with no limits.</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Free includes {FREE_DAILY_LIMIT} AI questions a day. Premium removes the cap and opens everything up.
        </Text>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefitRow}>
              <Text style={[styles.check, { color: theme.text }]}>✓</Text>
              <Text style={[styles.benefitText, { color: theme.text }]}>{b}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        {isWeb ? (
          <>
            <SubscriptionPriceBlock priceLabel={PRICE_LABEL} theme={theme} />

            <Pressable
              onPress={subscribeWeb}
              disabled={busy}
              style={[styles.primary, { backgroundColor: theme.text, opacity: busy ? 0.4 : 1 }]}
            >
              {busy ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <Text style={[styles.primaryText, { color: theme.background }]}>{subscribeLabel}</Text>
              )}
            </Pressable>

            {message ? <Text style={[styles.note, { color: theme.textSecondary }]}>{message}</Text> : null}

            <Text style={[styles.note, { color: theme.textSecondary }]}>
              {signedIn
                ? WEB_DISCLOSURE
                : `Sign in so your Premium works across iPhone, web, and desktop. ${WEB_DISCLOSURE}`}
            </Text>
          </>
        ) : !ready ? (
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            Premium subscriptions are available in the Beacon Bible app on your phone.
          </Text>
        ) : loading ? (
          <ActivityIndicator color={theme.text} style={{ paddingVertical: Spacing.three }} />
        ) : (
          <>
            <SubscriptionPriceBlock priceLabel={priceLabel} theme={theme} />

            <Pressable
              onPress={subscribe}
              disabled={!canBuy}
              style={[styles.primary, { backgroundColor: theme.text, opacity: canBuy ? 1 : 0.4 }]}
            >
              {busy ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <Text style={[styles.primaryText, { color: theme.background }]}>{subscribeLabel}</Text>
              )}
            </Pressable>

            {signedIn && !pkg && (
              <Text style={[styles.note, { color: theme.textSecondary }]}>
                Subscriptions aren’t available just yet — please check back soon.
              </Text>
            )}

            {message ? <Text style={[styles.note, { color: theme.textSecondary }]}>{message}</Text> : null}

            <Text style={[styles.disclosure, { color: theme.textSecondary }]}>{APPLE_DISCLOSURE}</Text>

            <Pressable onPress={restore} disabled={busy} style={styles.linkBtn}>
              <Text style={[styles.link, { color: theme.textSecondary }]}>Restore purchases</Text>
            </Pressable>
          </>
        )}

        <LegalLinks theme={theme} />

        <Pressable onPress={() => router.back()} style={styles.linkBtn}>
          <Text style={[styles.link, { color: theme.textSecondary }]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

type ThemeShape = ReturnType<typeof useTheme>;

/** Subscription title + length + price stacked together — Apple wants these read as one unit. */
function SubscriptionPriceBlock({ priceLabel, theme }: { priceLabel: string; theme: ThemeShape }) {
  return (
    <View>
      <Text style={[styles.subTitle, { color: theme.textSecondary }]}>
        {SUBSCRIPTION_TITLE} · {SUBSCRIPTION_LENGTH}
      </Text>
      <Text style={[styles.price, { color: theme.text }]}>
        {priceLabel}
        <Text style={[styles.per, { color: theme.textSecondary }]}> / month</Text>
      </Text>
    </View>
  );
}

/** Required by Apple 3.1.2(c): functional links to Privacy Policy and Terms of Use on the paywall. */
function LegalLinks({ theme }: { theme: ThemeShape }) {
  return (
    <View style={styles.legalRow}>
      <Pressable
        onPress={() => openLegal(PRIVACY_POLICY_URL)}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel="Privacy Policy"
      >
        <Text style={[styles.legalLink, { color: theme.textSecondary }]}>Privacy Policy</Text>
      </Pressable>
      <Text style={[styles.legalSep, { color: theme.textSecondary }]}>·</Text>
      <Pressable
        onPress={() => openLegal(EULA_URL)}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel="Terms of Use"
      >
        <Text style={[styles.legalLink, { color: theme.textSecondary }]}>Terms of Use</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.four },
  content: { paddingBottom: Spacing.four, gap: Spacing.three },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: 32, fontWeight: '700' },
  subtitle: { fontSize: 16, lineHeight: 22 },
  benefits: { gap: Spacing.three, marginTop: Spacing.two },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  check: { fontSize: 18, fontWeight: '800' },
  benefitText: { fontSize: 17 },
  footer: { gap: Spacing.two },
  subTitle: { fontSize: 12, fontWeight: '700', textAlign: 'center', letterSpacing: 0.4 },
  price: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  per: { fontSize: 15, fontWeight: '500' },
  primary: {
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryText: { fontSize: 17, fontWeight: '700' },
  note: { fontSize: 12, textAlign: 'center', lineHeight: 16 },
  // Apple 3.1.2(c) disclosure: smaller than body text but explicitly readable, multi-line.
  disclosure: { fontSize: 11, textAlign: 'center', lineHeight: 15, paddingHorizontal: Spacing.two },
  linkBtn: { alignItems: 'center', paddingVertical: Spacing.two },
  link: { fontSize: 14 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.one },
  legalLink: { fontSize: 13, textDecorationLine: 'underline' },
  legalSep: { fontSize: 13 },
});
