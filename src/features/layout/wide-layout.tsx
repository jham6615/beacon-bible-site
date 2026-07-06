import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SplitPane } from '@/components/split-pane';
import { Spacing } from '@/constants/theme';
import { ChatColumnHeader } from '@/features/chat/chat-column-header';
import { ChatHistoryPanel } from '@/features/chat/chat-history-panel';
import { ChatPanel } from '@/features/chat/chat-panel';
import { useSendQuestion } from '@/features/chat/use-send-question';
import { ReaderScreen } from '@/features/reader/reader-screen';
import { useReaderKeyboard } from '@/features/reader/use-reader-keyboard';
import { formatReference } from '@/features/selection/actions';
import { useTheme } from '@/hooks/use-theme';
import { useChatStore } from '@/store/chat-store';
import { useLayoutStore } from '@/store/layout-store';
import { useSelectionStore } from '@/store/selection-store';

/**
 * Desktop / wide viewport: reader on the left, chat as a resizable column on the right. The divider
 * between them doubles as a collapse button (see SplitPane); collapsing slides the chat off to the
 * right. Chat history slides in over the chat column from the right.
 */
export function WideLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const selection = useSelectionStore((s) => s.selection);
  const sendQuestion = useSendQuestion();

  const chatWidth = useLayoutStore((s) => s.chatWidth);
  const collapsed = useLayoutStore((s) => s.chatCollapsed);
  const setChatWidth = useLayoutStore((s) => s.setChatWidth);
  const setCollapsed = useLayoutStore((s) => s.setChatCollapsed);
  const hydrate = useLayoutStore((s) => s.hydrate);

  const historyOpen = useChatStore((s) => s.historyOpen);

  // Restore persisted chat width + collapsed state on first mount of the wide layout.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Opening history while the chat is collapsed would have nowhere to land — expand first so the
  // panel slides into a visible column.
  useEffect(() => {
    if (historyOpen && collapsed) setCollapsed(false);
  }, [historyOpen, collapsed, setCollapsed]);

  // Web-only: ←/→ navigate chapters, Esc clears the selection.
  useReaderKeyboard();

  const contextLabel = selection ? formatReference(selection) : undefined;

  const chat = (
    <View
      style={[
        styles.chatColumn,
        { backgroundColor: theme.backgroundElement, paddingTop: insets.top + Spacing.three },
      ]}
    >
      <ChatColumnHeader />
      <ChatPanel mode="column" onSend={sendQuestion} contextLabel={contextLabel} />
      <ChatHistoryPanel />
    </View>
  );

  return (
    <SplitPane
      left={(readerWidth) => <ReaderScreen mode="column" paneWidth={readerWidth} />}
      right={chat}
      chatWidth={chatWidth}
      collapsed={collapsed}
      onResizeEnd={setChatWidth}
      onToggleCollapse={setCollapsed}
      totalWidth={width}
      dividerColor={theme.backgroundSelected}
      surfaceColor={theme.backgroundElement}
      handleBg={theme.background}
      handleColor={theme.text}
    />
  );
}

const styles = StyleSheet.create({
  chatColumn: { flex: 1, gap: Spacing.two },
});
