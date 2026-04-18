import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getBody, listMeetingsForBody } from '@/lib/queries';
import type { Body, Meeting } from '@/types/db';

export default function BodyCalendarScreen() {
  const { countyId, branch, bodyId } = useLocalSearchParams<{
    countyId: string;
    branch: string;
    bodyId: string;
  }>();
  const router = useRouter();

  const [body, setBody] = useState<Body | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!bodyId) return;
    Promise.all([getBody(bodyId), listMeetingsForBody(bodyId)])
      .then(([b, m]) => {
        setBody(b);
        setMeetings(m);
      })
      .finally(() => setLoading(false));
  }, [bodyId]);

  const markedDates = useMemo(() => {
    const marks: Record<string, { marked?: boolean; dotColor?: string; selected?: boolean; selectedColor?: string }> = {};
    for (const m of meetings) {
      const key = m.start_time.slice(0, 10);
      marks[key] = { marked: true, dotColor: '#0a7ea4' };
    }
    if (selectedDate) {
      marks[selectedDate] = {
        ...(marks[selectedDate] ?? {}),
        selected: true,
        selectedColor: '#0a7ea4',
      };
    }
    return marks;
  }, [meetings, selectedDate]);

  const visible = selectedDate
    ? meetings.filter((m) => m.start_time.slice(0, 10) === selectedDate)
    : meetings;

  const nowIso = new Date().toISOString();
  const upcoming = visible.filter((m) => m.start_time >= nowIso);
  const past = visible.filter((m) => m.start_time < nowIso);

  const go = (meetingId: string) =>
    router.push(`/county/${countyId}/${branch}/${bodyId}/meeting/${meetingId}`);

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: body?.name ?? 'Body' }} />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <ThemedText type="title">{body?.name}</ThemedText>
          <ThemedText style={styles.subtitle}>
            {meetings.length} meetings loaded. Tap a date to filter.
          </ThemedText>

          <Calendar
            markedDates={markedDates}
            onDayPress={(day) =>
              setSelectedDate(
                selectedDate === day.dateString ? null : day.dateString,
              )
            }
            theme={{ todayTextColor: '#0a7ea4', arrowColor: '#0a7ea4' }}
          />

          {upcoming.length > 0 && (
            <Section title="Upcoming" meetings={upcoming} onPress={go} />
          )}
          {past.length > 0 && (
            <Section title="Past" meetings={past} onPress={go} />
          )}
          {visible.length === 0 && (
            <ThemedText style={styles.empty}>No meetings on this day.</ThemedText>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

function Section({
  title,
  meetings,
  onPress,
}: {
  title: string;
  meetings: Meeting[];
  onPress: (id: string) => void;
}) {
  return (
    <View style={{ marginTop: 20 }}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <View style={{ gap: 8, marginTop: 8 }}>
        {meetings.map((m) => (
          <Pressable key={m.id} style={styles.row} onPress={() => onPress(m.id)}>
            <ThemedText style={{ fontWeight: '600' }}>
              {formatDateTime(m.start_time)}
            </ThemedText>
            {m.location ? (
              <ThemedText style={styles.loc}>{m.location}</ThemedText>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  subtitle: { opacity: 0.7, marginTop: 4, marginBottom: 16 },
  row: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 10,
  },
  loc: { opacity: 0.7, marginTop: 4 },
  empty: { marginTop: 24, opacity: 0.6, textAlign: 'center' },
});
