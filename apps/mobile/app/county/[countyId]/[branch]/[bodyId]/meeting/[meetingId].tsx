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
import {
  CalendarDays,
  Clock3,
  MapPin,
  Video,
  FileText,
  Sparkles,
  Users,
  ArrowUpRight,
} from 'lucide-react-native';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getMeeting } from '@/lib/queries';
import type { Meeting } from '@/types/db';

export default function MeetingDetailScreen() {
  const { countyId, branch, bodyId, meetingId } = useLocalSearchParams<{
    countyId: string;
    branch: string;
    bodyId: string;
    meetingId: string;
  }>();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Calendar');

  useEffect(() => {
    if (!meetingId) return;

    getMeeting(meetingId)
      .then(setMeeting)
      .finally(() => setLoading(false));
  }, [meetingId]);

  if (loading) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header activeItem="Calendar" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" />
        </View>
        <BottomNav activeTab="Calendar" onChangeTab={setActiveTab} />
      </ThemedView>
    );
  }

  if (!meeting) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header activeItem="Calendar" />
        <View style={styles.loadingWrap}>
          <ThemedText style={styles.emptyStateTitle}>Meeting not found.</ThemedText>
          <ThemedText style={styles.emptyStateText}>
            This record may have been removed or is unavailable.
          </ThemedText>
        </View>
        <BottomNav activeTab="Calendar" onChangeTab={setActiveTab} />
      </ThemedView>
    );
  }

  const isUpcoming = meeting.start_time >= new Date().toISOString();
  const formatted = formatDateTime(meeting.start_time);

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Header activeItem="Select" countyId={countyId} />
        <View style={styles.hero}>
          <ThemedText style={styles.eyebrow}>MEETING RECORD</ThemedText>
          <ThemedText style={styles.title}>
            {meeting.title ?? 'Untitled Meeting'}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Detailed public record, access links, and generated materials.
          </ThemedText>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <CalendarDays size={18} color="#0b2a6f" />
            <ThemedText style={styles.summaryText}>{formatted}</ThemedText>
          </View>

          {meeting.location ? (
            <View style={styles.summaryRow}>
              <MapPin size={18} color="#0b2a6f" />
              <ThemedText style={styles.summaryText}>{meeting.location}</ThemedText>
            </View>
          ) : null}

          <View style={styles.statusPillWrap}>
            <View
              style={[
                styles.statusPill,
                isUpcoming ? styles.statusUpcoming : styles.statusPast,
              ]}
            >
              <ThemedText
                style={[
                  styles.statusText,
                  isUpcoming ? styles.statusTextUpcoming : styles.statusTextPast,
                ]}
              >
                {isUpcoming ? 'UPCOMING' : 'PAST'}
              </ThemedText>
            </View>
          </View>
        </View>

        {meeting.location ? (
          <InfoField icon={<MapPin size={16} color="#6b7280" />} label="Where">
            {meeting.location}
          </InfoField>
        ) : null}

        {isUpcoming ? (
          <Section
            title="How to Attend"
            icon={<Clock3 size={18} color="#0b2a6f" />}
          >
            {meeting.location ? (
              <ThemedText style={styles.bodyText}>
                In person: {meeting.location}
              </ThemedText>
            ) : null}

            {meeting.join_url ? (
              <LinkButton label="Join Online" url={meeting.join_url} />
            ) : (
              <ThemedText style={styles.mutedText}>
                No online link provided.
              </ThemedText>
            )}
          </Section>
        ) : null}

        <Section
          title="Agenda"
          icon={<FileText size={18} color="#0b2a6f" />}
        >
          {meeting.agenda_url ? (
            <LinkButton label="Open Agenda" url={meeting.agenda_url} />
          ) : (
            <ThemedText style={styles.mutedText}>No agenda link.</ThemedText>
          )}
        </Section>

        <Section
          title="AI Summary"
          icon={<Sparkles size={18} color="#0b2a6f" />}
        >
          <ThemedText style={styles.placeholderText}>
            {meeting.ai_summary ?? 'Summary will appear here once generated.'}
          </ThemedText>
        </Section>

        <Section
          title="Transcript"
          icon={<FileText size={18} color="#0b2a6f" />}
        >
          {meeting.transcript ? (
            <ThemedText style={styles.bodyText}>{meeting.transcript}</ThemedText>
          ) : (
            <ThemedText style={styles.placeholderText}>
              Transcript will appear here once generated.
            </ThemedText>
          )}
        </Section>

        {!isUpcoming ? (
          <Section
            title="Attendees"
            icon={<Users size={18} color="#0b2a6f" />}
          >
            <ThemedText style={styles.placeholderText}>
              Attendee list will appear here.
            </ThemedText>
          </Section>
        ) : null}

        <Section
          title="Video"
          icon={<Video size={18} color="#0b2a6f" />}
        >
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
              <LinkButton label="Open in Browser" url={meeting.video_url} />
            </>
          ) : (
            <ThemedText style={styles.mutedText}>No video available.</ThemedText>
          )}
        </Section>

        <Footer />
      </ScrollView>

      <BottomNav activeTab="Calendar" onChangeTab={setActiveTab} />
    </ThemedView>
  );
}

function InfoField({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.infoField}>
      <View style={styles.sectionHeaderRow}>
        {icon}
        <ThemedText style={styles.infoLabel}>{label}</ThemedText>
      </View>
      <ThemedText style={styles.infoValue}>{children}</ThemedText>
    </View>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeaderRow}>
        {icon}
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      style={styles.linkButton}
      onPress={() => WebBrowser.openBrowserAsync(url)}
    >
      <ThemedText style={styles.linkButtonText}>{label}</ThemedText>
      <ArrowUpRight size={15} color="#ffffff" />
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
  screen: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },

  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0b2a6f',
    marginBottom: 8,
    textAlign: 'center',
  },

  emptyStateText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 120,
  },

  hero: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 22,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#7c8798',
    marginBottom: 10,
  },

  title: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    color: '#0b2a6f',
    textAlign: 'center',
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.12)',
    padding: 18,
    marginBottom: 18,
    gap: 12,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  summaryText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    fontWeight: '600',
  },

  statusPillWrap: {
    marginTop: 4,
    alignItems: 'flex-start',
  },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  statusUpcoming: {
    backgroundColor: '#dbeafe',
  },

  statusPast: {
    backgroundColor: '#e5e7eb',
  },

  statusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  statusTextUpcoming: {
    color: '#0b2a6f',
  },

  statusTextPast: {
    color: '#4b5563',
  },

  infoField: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
    marginBottom: 14,
  },

  infoLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0b2a6f',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  infoValue: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
  },

  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
    marginBottom: 14,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0b2a6f',
  },

  sectionBody: {
    marginTop: 10,
  },

  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    marginBottom: 8,
  },

  mutedText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 21,
  },

  placeholderText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 22,
    fontStyle: 'italic',
  },

  linkButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#0b2a6f',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  linkButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },

  videoWrap: {
    marginTop: 8,
    marginBottom: 8,
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
  },
});
