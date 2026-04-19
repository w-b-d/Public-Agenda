export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

const COLAB_URL = process.env.EXPO_PUBLIC_COLAB_URL;

export async function sendChat(
  context: string,
  messages: ChatMessage[],
): Promise<string> {
  if (!COLAB_URL) {
    throw new Error(
      'EXPO_PUBLIC_COLAB_URL is not set. Add it to apps/mobile/.env.',
    );
  }
  const res = await fetch(`${COLAB_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, messages }),
  });
  if (!res.ok) {
    throw new Error(`Chat request failed: ${res.status}`);
  }
  const data = (await res.json()) as { reply?: string };
  return data.reply ?? '';
}
