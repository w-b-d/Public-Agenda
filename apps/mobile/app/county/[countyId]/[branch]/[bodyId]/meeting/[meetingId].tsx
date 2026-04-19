import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

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
            <LinkButton label="Open agenda" url={meeting.agenda_url} />
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
            <>
              <View style={styles.videoWrap}>
                {Platform.OS === 'web' ? (
                  // react-native-webview doesn't support the web target.
                  // On web we render a plain iframe instead — same effect.
                  // @ts-expect-error — `iframe` isn't a standard RN element but renders fine on web.
                  <iframe
                    src={meeting.video_url}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    allowFullScreen
                  />
                ) : (
                  <WebView
                    source={{ uri: meeting.video_url }}
                    style={{ flex: 1 }}
                    allowsInlineMediaPlayback
                    mediaPlaybackRequiresUserAction={false}
                  />
                )}
              </View>
              <Pressable
                style={styles.secondaryLink}
                onPress={() => WebBrowser.openBrowserAsync(meeting.video_url!)}
              >
                <ThemedText style={styles.secondaryLinkText}>
                  Open video in browser
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <ThemedText style={styles.muted}>No video available.</ThemedText>
          )}
        </Section>
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
  videoWrap: {
    marginTop: 8,
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
  },
  secondaryLink: { marginTop: 8 },
  secondaryLinkText: { color: '#0a7ea4', fontWeight: '600' },
});
