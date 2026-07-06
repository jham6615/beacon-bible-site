import { type ReactNode, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  open: boolean;
  onClose: () => void;
  /** Y offset where the dropdown anchors (below the header). */
  top: number;
  /** Fixed content height. Defaults to the tall book/version-picker height; short panels
   *  (e.g. the Aa display settings) pass their own so the dropdown hugs the content. */
  contentH?: number;
  children: ReactNode;
};

/**
 * Slide-down container for the book/version pickers. Animates its own HEIGHT (0 → fixed open height)
 * rather than transforming the inner scroll view — height-reveal keeps react-native-web's internal
 * wheel/touch scrolling intact. A fading scrim sits behind it; tapping the scrim closes.
 *
 * Children mount on open and unmount after the close animation, so each open starts fresh (the picker
 * resets to the current book/version) and nothing fetches at app launch.
 */
export function PickerDropdown({ open, onClose, top, contentH, children }: Props) {
  const theme = useTheme();
  const { height: screenH } = useWindowDimensions();
  // Fixed open height so book↔version swaps don't jump; the list scrolls within it.
  const openH = Math.min(contentH ?? 460, Math.max(220, screenH - top - 24));

  const [mounted, setMounted] = useState(open);
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      progress.value = withTiming(1, { duration: 220 });
    } else {
      progress.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [open, progress]);

  // Web: Esc closes the dropdown.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const clipStyle = useAnimatedStyle(() => ({ height: openH * progress.value }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: 0.22 * progress.value }));

  if (!mounted) return null;

  return (
    <>
      <AnimatedPressable
        onPress={onClose}
        accessibilityLabel="Close"
        style={[styles.scrim, { top }, scrimStyle]}
        pointerEvents={open ? 'auto' : 'none'}
      />
      <Animated.View
        style={[styles.clip, { top, backgroundColor: theme.background, borderBottomColor: theme.backgroundSelected }, clipStyle]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <View style={{ height: openH, paddingHorizontal: Spacing.four, paddingTop: Spacing.two }}>{children}</View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 28 },
  clip: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 30,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // Soft shadow so it reads as a sheet dropping over the text.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
});
