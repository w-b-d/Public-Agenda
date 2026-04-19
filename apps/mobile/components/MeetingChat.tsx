import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Send, MessageCircle } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const COLAB_URL = process.env.EXPO_PUBLIC_COLAB_URL?.replace(/\/$/, '') ?? '';

export default function MeetingChat({ context }: { context: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    if (!COLAB_URL) {
      setError('EXPO_PUBLIC_COLAB_URL is not configured.');
      return;
    }

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const resp = await fetch(`${COLAB_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, messages: next }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { reply: string };
      setMessages([...next, { role: 'assistant', content: data.reply }]);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      setError(msg);
      setMessages(next);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.wrap}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <MessageCircle size={22} color="#9ca3af" />
            <ThemedText style={styles.emptyText}>
              Ask a question about this meeting.
            </ThemedText>
          </View>
        ) : null}

        {messages.map((m, i) => (
          <View
            key={i}
            style={[
              styles.bubble,
              m.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}
          >
            <ThemedText
              style={[
                styles.bubbleText,
                m.role === 'user' ? styles.userText : styles.assistantText,
              ]}
            >
              {m.content}
            </ThemedText>
          </View>
        ))}

        {sending ? (
          <View style={[styles.bubble, styles.assistantBubble]}>
            <ActivityIndicator size="small" color="#0b2a6f" />
          </View>
        ) : null}

        {error ? (
          <ThemedText style={styles.errorText}>Error: {error}</ThemedText>
        ) : null}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask about this meeting..."
          placeholderTextColor="#9ca3af"
          style={styles.input}
          multiline
          onSubmitEditing={send}
          editable={!sending}
        />
        <Pressable
          onPress={send}
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          disabled={!input.trim() || sending}
        >
          <Send size={16} color="#ffffff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 420,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    gap: 8,
    paddingVertical: 6,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#0b2a6f',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef1f7',
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: '#ffffff',
  },
  assistantText: {
    color: '#1f2937',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(120,130,150,0.15)',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#f6f7fb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.15)',
  },
  sendBtn: {
    backgroundColor: '#0b2a6f',
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
