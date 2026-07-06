import { type ReactElement, type ReactNode, cloneElement, isValidElement, useEffect, useState } from 'react';
import { Keyboard, type LayoutChangeEvent, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const SHEET_COLLAPSED_RATIO = 0.08;
// Ordered from most-collapsed to most-expanded. Defined outside the component so the tap
// gesture worklet captures a stable reference that never changes between renders.
const SNAP_ORDER: SheetSnap[] = ['collapsed', 'reveal', 'half', 'expanded'];
/** Half-height snap: reader and chat both visible at once. */
export const SHEET_HALF_RATIO = 0.5;
export const SHEET_EXPANDED_RATIO = 0.8;

export type SheetSnap = 'collapsed' | 'reveal' | 'half' | 'expanded';

const SPRING = { damping: 24, stiffness: 240, mass: 0.7 };

type Props = {
  openSnap?: SheetSnap;
  onSnapChange?: (snap: SheetSnap) => void;
  header?: ReactNode;
  children?: ReactNode;
  /** Natural pixel height of the expanded conversation; lets the sheet hug it instead of a fixed ratio. */
  expandedContentH?: number;
  /** Reports the sheet's settled height (px from screen bottom) so siblings — e.g. the reader's
   *  floating chapter arrows — can position themselves just above it. */
  onTargetHeight?: (h: number) => void;
};

export function BottomSheet({
  openSnap = 'reveal',
  onSnapChange,
  header,
  children,
  expandedContentH = 0,
  onTargetHeight,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const expandedH = screenH * SHEET_EXPANDED_RATIO;
  const topMargin = insets.top + Spacing.three;

  const [handleH, setHandleH] = useState(52);
  const [contentH, setContentH] = useState(180);
  const [kbH, setKbH] = useState(0);
  // The conversation list is visible at both 'half' and 'expanded' — so chrome (contentH) is only
  // measured at 'collapsed'/'reveal' where the list isn't rendered.
  const showConvo = openSnap === 'expanded' || openSnap === 'half';
  // The sheet floats above the keyboard, so when it's up the usable height shrinks to fit above it.
  const availH = kbH > 0 ? screenH - kbH - topMargin : expandedH;
  // Add bottom safe-area so the handle sits ABOVE the iPhone home-indicator zone. Without this,
  // the grab area overlaps the system home-swipe area and iOS captures the touch before the pan
  // gesture can activate.
  const collapsedH = handleH + insets.bottom;
  const revealH = Math.min(expandedH, handleH + contentH);
  // Half-height snap: ~50% screen so reader and chat are both visible. Capped by availH so the
  // keyboard never pushes it off-screen.
  const halfH = Math.min(availH, screenH * SHEET_HALF_RATIO);
  // Expanded hugs the conversation (chrome = contentH, measured while collapsed/reveal) up to the usable cap,
  // so a short chat leaves no empty band and a long one fills it and scrolls inside.
  const fullH = Math.min(availH, handleH + contentH + expandedContentH);
  // The conversation cap depends on which snap is active — it's the leftover room inside the sheet
  // at that snap (so the input row stays pinned and a tall convo scrolls inside instead of overflowing).
  const targetH =
    openSnap === 'expanded' ? fullH : openSnap === 'half' ? halfH : openSnap === 'reveal' ? revealH : collapsedH;
  const convoMaxH = Math.max(0, targetH - handleH - contentH);

  const heightSV = useSharedValue(handleH + contentH);
  const startH = useSharedValue(0);
  const kbOffset = useSharedValue(0);

  // Let siblings track where the sheet's top edge settles (drag positions in between aren't reported).
  useEffect(() => {
    onTargetHeight?.(targetH);
  }, [targetH, onTargetHeight]);

  useEffect(() => {
    const target =
      openSnap === 'expanded' ? fullH : openSnap === 'half' ? halfH : openSnap === 'reveal' ? revealH : collapsedH;
    if (openSnap === 'collapsed') Keyboard.dismiss();
    heightSV.value = withSpring(target, SPRING);
  }, [openSnap, collapsedH, revealH, halfH, fullH, heightSV]);

  // Float the sheet above the keyboard so the reader stays visible while typing.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => {
      setKbH(e.endCoordinates.height);
      kbOffset.value = withTiming(e.endCoordinates.height, { duration: e.duration ?? 220 });
    });
    const hide = Keyboard.addListener(hideEvt, (e) => {
      setKbH(0);
      kbOffset.value = withTiming(0, { duration: e.duration ?? 220 });
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [kbOffset]);

  const onHandleLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && Math.abs(h - handleH) > 1) setHandleH(h);
  };
  const onContentLayout = (e: LayoutChangeEvent) => {
    // Skip measurement when the conversation list is shown ('half' or 'expanded'), since that
    // would conflate chrome height with the list height and pump revealH way up.
    if (showConvo) return;
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && Math.abs(h - contentH) > 1) setContentH(h);
  };

  const onGrab = () => Keyboard.dismiss();
  const settle = (snap: SheetSnap) => {
    if (snap === 'collapsed') Keyboard.dismiss();
    onSnapChange?.(snap);
  };

  // Track current snap as a shared value so the worklet-side tap handler can read it.
  const snapIdxSV = useSharedValue(SNAP_ORDER.indexOf(openSnap));
  useEffect(() => {
    snapIdxSV.value = SNAP_ORDER.indexOf(openSnap);
  }, [openSnap, snapIdxSV]);

  // Single tap advances the sheet one level up (collapsed→reveal→half→expanded).
  // This lets users open the sheet with a simple tap rather than requiring a precise drag.
  const tap = Gesture.Tap()
    .maxDuration(200)
    .onEnd(() => {
      'worklet';
      const nextIdx = Math.min(snapIdxSV.value + 1, SNAP_ORDER.length - 1);
      runOnJS(settle)(SNAP_ORDER[nextIdx]);
    });

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onStart(() => {
      startH.value = heightSV.value;
      runOnJS(onGrab)();
    })
    .onUpdate((e) => {
      const next = startH.value - e.translationY;
      heightSV.value = next < collapsedH ? collapsedH : next > fullH ? fullH : next;
    })
    .onEnd((e) => {
      // Project where the sheet would land if velocity continued, then snap to the nearest of 4 stops.
      const projected = heightSV.value - e.velocityY * 0.08;
      const stops: { snap: SheetSnap; h: number }[] = [
        { snap: 'collapsed', h: collapsedH },
        { snap: 'reveal', h: revealH },
        { snap: 'half', h: halfH },
        { snap: 'expanded', h: fullH },
      ];
      const nearest = stops.reduce((best, s) =>
        Math.abs(projected - s.h) < Math.abs(projected - best.h) ? s : best,
      );
      heightSV.value = withSpring(nearest.h, SPRING);
      runOnJS(settle)(nearest.snap);
    });

  // Race: quick lift without movement → tap wins; sustained movement → pan wins immediately.
  const gesture = Gesture.Race(tap, pan);

  const animatedStyle = useAnimatedStyle(() => {
    const kb = kbOffset.value;
    const maxH = kb > 0 ? screenH - kb - topMargin : screenH;
    return {
      height: Math.min(heightSV.value, maxH),
      bottom: kb,
    };
  });

  return (
    <Animated.View style={[styles.sheet, { backgroundColor: theme.backgroundElement }, animatedStyle]}>
      <View style={styles.clip}>
        <GestureDetector gesture={gesture}>
          <View style={styles.handleArea} onLayout={onHandleLayout}>
            <View style={[styles.grabber, { backgroundColor: theme.textSecondary }]} />
            {header}
          </View>
        </GestureDetector>

        <View onLayout={onContentLayout}>
          {isValidElement(children)
            ? cloneElement(children as ReactElement<{ convoMaxH?: number }>, { convoMaxH })
            : children}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  clip: { flex: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  handleArea: { paddingTop: Spacing.two, paddingBottom: Spacing.one, gap: Spacing.two },
  grabber: { width: 40, height: 5, borderRadius: 3, opacity: 0.4, alignSelf: 'center' },
});
