import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { BottomSheet, SHEET_COLLAPSED_RATIO, type SheetSnap } from '@/components/bottom-sheet';
import { ChatHistory } from '@/features/chat/chat-history';
import { ChatPanel } from '@/features/chat/chat-panel';
import { SheetHeader } from '@/features/chat/sheet-header';
import { useSendQuestion } from '@/features/chat/use-send-question';
import { ReaderScreen } from '@/features/reader/reader-screen';
import { useReaderKeyboard } from '@/features/reader/use-reader-keyboard';
import { formatReference } from '@/features/selection/actions';
import { useChatStore } from '@/store/chat-store';
import { useSelectionStore } from '@/store/selection-store';

/** Mobile / narrow viewport: chat lives in a draggable bottom sheet over the full-width reader. */
export function NarrowLayout() {
  const { height } = useWindowDimensions();
  const peek = height * SHEET_COLLAPSED_RATIO;

  const selection = useSelectionStore((s) => s.selection);
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const hasSelection = !!selection && selection.verses.length > 0;
  const sendQuestion = useSendQuestion();

  // Web-only: physical-keyboard arrows on iPad / Chromebook still navigate chapters in narrow mode.
  useReaderKeyboard();

  // Default to "reveal" so whole-chapter suggestions are always available, even with nothing selected.
  const [snap, setSnap] = useState<SheetSnap>('reveal');
  const [convoH, setConvoH] = useState(0);
  // Live sheet height so the reader's floating chapter arrows ride just above it.
  const [sheetH, setSheetH] = useState(0);
  const prevHasSelection = useRef(false);

  useEffect(() => {
    if (hasSelection === prevHasSelection.current) return;
    prevHasSelection.current = hasSelection;
    // Selecting, or clearing with no conversation, rests at reveal (suggestions visible).
    if (hasSelection || !hasMessages) setSnap('reveal');
  }, [hasSelection, hasMessages]);

  const handleSend = (text: string, prompt?: string) => {
    if (sendQuestion(text, prompt)) setSnap('expanded');
  };

  const contextLabel = selection ? formatReference(selection) : undefined;

  return (
    <View style={{ flex: 1 }}>
      <ReaderScreen mode="sheet" peekInset={peek} navInset={sheetH} />
      <BottomSheet
        openSnap={snap}
        onSnapChange={setSnap}
        header={<SheetHeader />}
        expandedContentH={convoH}
        onTargetHeight={setSheetH}
      >
        <ChatPanel
          mode="sheet"
          expanded={snap === 'expanded' || snap === 'half'}
          onSend={handleSend}
          onConvoHeight={setConvoH}
          contextLabel={contextLabel}
        />
      </BottomSheet>
      <ChatHistory onOpened={() => setSnap('expanded')} />
    </View>
  );
}
