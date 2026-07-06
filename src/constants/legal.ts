/**
 * Centralized URLs for legal pages and support. Apple's App Review (3.1.2) and Google Play both
 * require functional links from the in-app purchase flow to these documents — keep them here so
 * every consumer (paywall, settings, sign-up) uses the same source of truth.
 */

/** Privacy policy hosted on GitHub Pages at github.com/jham6615/scripture-ask. */
export const PRIVACY_POLICY_URL = 'https://jham6615.github.io/Scripture-Ask/privacy.html';

/**
 * Apple's standard EULA. Use this as long as we haven't published our own; if we ever publish a
 * custom EULA at /terms.html, swap this constant and add a Custom EULA in App Store Connect.
 * Reference: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
 */
export const EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** Public support page hosted on GitHub Pages at github.com/jham6615/scripture-ask. */
export const SUPPORT_URL = 'https://jham6615.github.io/Scripture-Ask/support.html';

/** Display string + length used in the auto-renewal disclosure on the paywall. */
export const SUBSCRIPTION_TITLE = 'Beacon Bible Premium';
export const SUBSCRIPTION_LENGTH = '1-month';
