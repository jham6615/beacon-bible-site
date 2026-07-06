import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic config layer over app.json. Three jobs:
 *
 * 1. Dev vs production variant. When APP_VARIANT=development (set by the development EAS
 *    profile in eas.json), bundle ID becomes com.shuttlementor.biblefriend.dev and the
 *    display name becomes "Beacon Bible Dev" so the dev client coexists with TestFlight.
 *    Production builds (no env var) stay identical to before.
 *
 * 2. runtimeVersion policy = "appVersion". OTA updates published via EAS Update only ship
 *    to binaries whose runtime version matches. Bumping app.json's "version" forces a new
 *    binary (which is the right behavior — version bumps usually mean native changes too).
 *
 * 3. updates.url points at this project's EAS Update endpoint. Production builds check this
 *    URL on launch and download a new JS bundle in the background when one's available, so
 *    JS-only fixes can ship in seconds via `eas update --branch production ...` instead of
 *    waiting on Apple Review.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const isDev = process.env.APP_VARIANT === 'development';
  return {
    ...config,
    name: isDev ? `${config.name} Dev` : (config.name as string),
    slug: config.slug as string,
    ios: {
      ...config.ios,
      bundleIdentifier: isDev
        ? `${config.ios?.bundleIdentifier}.dev`
        : config.ios?.bundleIdentifier,
      // Dev builds load the Metro server over plain http (LAN IPs, exp.direct tunnel), which iOS
      // App Transport Security blocks by default ("requires the use of a secure connection").
      // Allow cleartext in the DEV variant only — production keeps Apple's strict default.
      ...(isDev && {
        infoPlist: {
          ...config.ios?.infoPlist,
          NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
        },
      }),
    },
    android: {
      ...config.android,
      package: isDev ? `${config.android?.package}.dev` : config.android?.package,
    },
    runtimeVersion: { policy: 'appVersion' as const },
    updates: {
      url: 'https://u.expo.dev/acd5692a-824c-4ed7-b5c1-869ae5d9a194',
    },
  };
};
