import { Modal, Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useChatStore } from '@/store/chat-store';
import { HistoryContent } from './history-content';

/**
 * Mobile chat history: a slide-up page sheet. (Desktop uses the in-column ChatHistoryPanel instead.)
 * Both share HistoryContent for the actual list.
 */
export function ChatHistory({ onOpened }: { onOpened?: () => void }) {
  const theme = useTheme();
  const open = useChatStore((s) => s.historyOpen);
  const setOpen = useChatStore((s) => s.setHistoryOpen);
  const close = () => setOpen(false);

  // react-native-web's Modal doesn't reliably hide when `visible` flips back to false (RNW 0.21 +
  // React 19): the portal stays painted at full opacity. Unmount it entirely on web instead.
  // Native keeps the Modal mounted so iOS can play its animated dismissal.
  if (Platform.OS === 'web' && !open) return null;

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <HistoryContent onClose={close} onOpened={onOpened} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
