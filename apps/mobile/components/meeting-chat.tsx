import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { sendChat, type ChatMessage } from '@/lib/chat';

interface Props {
  context: string;
}

export function MeetingChat({ context }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const onSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const reply = await sendChat(context, next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        style={styles.log}
        contentContainerStyle={styles.logContent}
      >
        {messages.length === 0 ? (
          <ThemedText style={styles.empty}>
            Ask a question about this meeting.
          </ThemedText>
        ) : (
          messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === 'user' ? styles.user : styles.assistant,
              ]}
            >
              <ThemedText
                style={m.role === 'user' ? styles.userText : undefined}
              >
                {m.content}
              </ThemedText>
            </View>
          ))
        )}
        {loading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
        {error ? (
          <ThemedText style={styles.error}>{error}</ThemedText>
        ) : null}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask a question…"
          placeholderTextColor="#888"
          style={styles.input}
          editable={!loading}
          onSubmitEditing={onSend}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.sendBtn, (loading || !input.trim()) && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={loading || !input.trim()}
        >
          <ThemedText style={styles.sendBtnText}>Send</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  log: { maxHeight: 260 },
  logContent: { padding: 10 },
  empty: { opacity: 0.6, fontStyle: 'italic' },
  bubble: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    maxWidth: '90%',
  },
  user: {
    backgroundColor: '#0a7ea4',
    alignSelf: 'flex-end',
  },
  userText: { color: '#fff' },
  assistant: {
    backgroundColor: '#eef1f4',
    alignSelf: 'flex-start',
  },
  error: { color: '#b00020', marginTop: 6 },
  inputRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    padding: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
  },
  sendBtn: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: '#0a7ea4',
    borderRadius: 6,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontWeight: '600' },
});
