import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { MeetingChat } from '@/components/meeting-chat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getMeeting } from '@/lib/queries';
import type { Meeting } from '@/types/db';

export default function MeetingDetailScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!meetingId) return;
    getMeeting(meetingId)
      .then(setMeeting)
      .finally(() => setLoading(false));
  }, [meetingId]);

  if (loading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center' }}>
        <Stack.Screen options={{ title: 'Meeting' }} />
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!meeting) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
        <Stack.Screen options={{ title: 'Meeting' }} />
        <ThemedText>Meeting not found.</ThemedText>
      </ThemedView>
    );
  }

  const isUpcoming = meeting.start_time >= new Date().toISOString();
  const formatted = formatDateTime(meeting.start_time);

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Meeting' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">{meeting.title}</ThemedText>
        <ThemedText style={styles.when}>{formatted}</ThemedText>

        {meeting.location ? (
          <Field label="Where">{meeting.location}</Field>
        ) : null}

        {isUpcoming ? (
          <Section title="How to attend">
            {meeting.location ? (
              <ThemedText style={styles.body}>
                In person: {meeting.location}
              </ThemedText>
            ) : null}
            {meeting.join_url ? (
              <LinkButton label="Join online" url={meeting.join_url} />
            ) : (
              <ThemedText style={styles.muted}>
                No online link provided.
              </ThemedText>
            )}
          </Section>
        ) : null}

        <Section title="Agenda">
          {meeting.agenda_url ? (
            <LinkButton
              label="Open agenda on Legistar"
              url={meeting.agenda_url}
            />
          ) : (
            <ThemedText style={styles.muted}>No agenda link.</ThemedText>
          )}
        </Section>

        <Section title="AI Summary">
          <ThemedText style={styles.placeholder}>
            {meeting.ai_summary ?? 'Summary will appear here once generated.'}
          </ThemedText>
        </Section>

        <Section title="Transcript">
          <ThemedText style={styles.placeholder}>
            Transcript with timestamps will appear here once generated.
          </ThemedText>
        </Section>

        {!isUpcoming ? (
          <Section title="Attendees">
            <ThemedText style={styles.placeholder}>
              Attendee list will appear here.
            </ThemedText>
          </Section>
        ) : null}

        <Section title="Video">
          {meeting.video_url ? (
            <LinkButton label="Open meeting video" url={meeting.video_url} />
          ) : (
            <ThemedText style={styles.muted}>No video available.</ThemedText>
          )}
        </Section>

        {!isUpcoming ? (
          <Section title="Ask about this meeting">
            <MeetingChat context={buildChatContext(meeting)} />
          </Section>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <ThemedText>{children}</ThemedText>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <View style={{ marginTop: 6 }}>{children}</View>
    </View>
  );
}

function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <Pressable style={styles.linkBtn} onPress={() => WebBrowser.openBrowserAsync(url)}>
      <ThemedText style={styles.linkBtnText}>{label}</ThemedText>
    </Pressable>
  );
}

function buildChatContext(meeting: Meeting): string {
  const parts = [
    `Title: ${meeting.title}`,
    `Date: ${formatDateTime(meeting.start_time)}`,
  ];
  if (meeting.location) parts.push(`Location: ${meeting.location}`);
  if (meeting.ai_summary) parts.push(`Summary:\n${meeting.ai_summary}`);
  return parts.join('\n\n');
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  when: { marginTop: 6, opacity: 0.8 },
  field: { marginTop: 12 },
  fieldLabel: { opacity: 0.6, marginBottom: 2 },
  section: { marginTop: 24 },
  body: { marginTop: 4 },
  muted: { opacity: 0.6 },
  placeholder: { opacity: 0.7, fontStyle: 'italic' },
  linkBtn: {
    marginTop: 6,
    padding: 12,
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  linkBtnText: { color: '#fff', fontWeight: '600' },
});
