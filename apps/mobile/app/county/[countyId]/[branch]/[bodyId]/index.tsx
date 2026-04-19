import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Calendar as RNCalendar } from 'react-native-calendars';
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  MapPin,
  User as UserIcon,
  Video,
} from 'lucide-react-native';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getBody, listMeetingsForBody } from '@/lib/queries';
import { listBodyMembers } from '@/lib/queries/people';
import type { Body, Meeting, PersonWithRole } from '@/types/db';

export default function BodyCalendarScreen() {
  const { countyId, branch, bodyId } = useLocalSearchParams<{
    countyId: string;
    branch: string;
    bodyId: string;
  }>();

  const router = useRouter();

  const [body, setBody] = useState<Body | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [members, setMembers] = useState<PersonWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('calendar');

  useEffect(() => {
    if (!bodyId) return;

    Promise.all([
      getBody(bodyId),
      listMeetingsForBody(bodyId),
      listBodyMembers(bodyId),
    ])
      .then(([b, m, ms]) => {
        setBody(b);
        setMeetings(m ?? []);
        setMembers(ms ?? []);
      })
      .finally(() => setLoading(false));
  }, [bodyId]);

  const markedDates = useMemo(() => {
    const marks: Record<
      string,
      {
        marked?: boolean;
        dotColor?: string;
        selected?: boolean;
        selectedColor?: string;
      }
    > = {};

    for (const meeting of meetings) {
      const key = meeting.start_time.slice(0, 10);
      marks[key] = {
        ...(marks[key] ?? {}),
        marked: true,
        dotColor: '#0b2a6f',
      };
    }

    if (selectedDate) {
      marks[selectedDate] = {
        ...(marks[selectedDate] ?? {}),
        selected: true,
        selectedColor: '#0b2a6f',
      };
    }

    return marks;
  }, [meetings, selectedDate]);

  const visibleMeetings = useMemo(() => {
    if (!selectedDate) return meetings;
    return meetings.filter((m) => m.start_time.slice(0, 10) === selectedDate);
  }, [meetings, selectedDate]);

  const nowIso = new Date().toISOString();

  const upcomingMeetings = useMemo(
    () => visibleMeetings.filter((m) => m.start_time >= nowIso),
    [visibleMeetings, nowIso]
  );

  const pastMeetings = useMemo(
    () => visibleMeetings.filter((m) => m.start_time < nowIso),
    [visibleMeetings, nowIso]
  );

  const goToMeeting = (meetingId: string) => {
    router.push(`/county/${countyId}/${branch}/${bodyId}/meeting/${meetingId}`);
  };

  const goToPerson = (personId: string) => {
    router.push(`/person/${personId}`);
  };

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Header activeItem="Select" countyId={countyId} />
          <View style={styles.hero}>
            <ThemedText style={styles.eyebrow}>CIVIC MEETING ARCHIVE</ThemedText>
            <ThemedText style={styles.title}>
              {body?.name ?? 'Body Calendar'}
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              {meetings.length} meetings loaded. Tap a date to filter the archive.
            </ThemedText>
          </View>

          <MembersSection members={members} onPress={goToPerson} />

          <View style={styles.calendarCard}>
            <RNCalendar
              markedDates={markedDates}
              onDayPress={(day) => {
                setSelectedDate((prev) =>
                  prev === day.dateString ? null : day.dateString
                );
              }}
              theme={{
                todayTextColor: '#0b2a6f',
                arrowColor: '#0b2a6f',
                selectedDayTextColor: '#ffffff',
                dotColor: '#0b2a6f',
                textDayFontWeight: '600',
                textMonthFontWeight: '800',
                textDayHeaderFontWeight: '700',
                monthTextColor: '#0b2a6f',
                calendarBackground: '#ffffff',
                textSectionTitleColor: '#7a8599',
              }}
              enableSwipeMonths
              style={styles.calendar}
            />
          </View>

          <View style={styles.feedHeader}>
            <View>
              <ThemedText style={styles.feedTitle}>Chronicle of Events</ThemedText>
              <ThemedText style={styles.feedSubtitle}>
                {selectedDate
                  ? `Filtered by ${selectedDate}`
                  : 'Browse upcoming and past meetings for this body.'}
              </ThemedText>
            </View>

            {selectedDate ? (
              <Pressable onPress={() => setSelectedDate(null)}>
                <ThemedText style={styles.clearFilter}>Clear Filter</ThemedText>
              </Pressable>
            ) : null}
          </View>

          <MeetingSection
            title="Upcoming"
            meetings={upcomingMeetings}
            onPress={goToMeeting}
          />

          <MeetingSection
            title="Past"
            meetings={pastMeetings}
            onPress={goToMeeting}
          />

          {visibleMeetings.length === 0 ? (
            <ThemedText style={styles.emptyText}>
              No meetings on this day.
            </ThemedText>
          ) : null}

          <Footer />
        </ScrollView>
      )}

      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
    </ThemedView>
  );
}

function MembersSection({
  members,
  onPress,
}: {
  members: PersonWithRole[];
  onPress: (id: string) => void;
}) {
  if (members.length === 0) {
    return (
      <View style={styles.membersBlock}>
        <ThemedText style={styles.sectionTitle}>Members</ThemedText>
        <View style={styles.membersEmpty}>
          <ThemedText style={styles.membersEmptyText}>
            Member roster not yet available for this body.
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.membersBlock}>
      <ThemedText style={styles.sectionTitle}>
        Members ({members.length})
      </ThemedText>
      <View style={styles.membersList}>
        {members.map(({ person, role }) => (
          <Pressable
            key={role.id}
            style={styles.memberCard}
            onPress={() => onPress(person.id)}
          >
            <View style={styles.memberAvatar}>
              <UserIcon size={18} color="#0b2a6f" />
            </View>
            <View style={styles.memberMain}>
              <ThemedText style={styles.memberName}>{person.name}</ThemedText>
              <ThemedText style={styles.memberMeta}>
                {role.title ?? 'Member'}
                {role.district ? ` · ${role.district}` : ''}
              </ThemedText>
            </View>
            <ChevronRight size={18} color="#7c8798" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function MeetingSection({
  title,
  meetings,
  onPress,
}: {
  title: string;
  meetings: Meeting[];
  onPress: (id: string) => void;
}) {
  if (meetings.length === 0) return null;

  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>

      <View style={styles.sectionList}>
        {meetings.map((meeting) => (
          <Pressable
            key={meeting.id}
            style={styles.eventCard}
            onPress={() => onPress(meeting.id)}
          >
            <View style={styles.eventDateCol}>
              <ThemedText style={styles.eventDate}>
                {formatShortDate(meeting.start_time)}
              </ThemedText>
              <ThemedText style={styles.eventDay}>
                {formatWeekday(meeting.start_time)}
              </ThemedText>
            </View>

            <View style={styles.eventMain}>
              <View style={styles.eventMetaRow}>
                <View style={styles.dot} />
                <ThemedText style={styles.eventCategory}>
                  PUBLIC MEETING
                </ThemedText>
              </View>

              <ThemedText style={styles.eventTitle}>
                {meeting.title ?? 'Untitled Meeting'}
              </ThemedText>

              <View style={styles.infoRow}>
                <Clock3 size={14} color="#6b7280" />
                <ThemedText style={styles.infoText}>
                  {formatDateTime(meeting.start_time)}
                </ThemedText>
              </View>

              {meeting.location ? (
                <View style={styles.infoRow}>
                  <MapPin size={14} color="#6b7280" />
                  <ThemedText style={styles.infoText}>
                    {meeting.location}
                  </ThemedText>
                </View>
              ) : null}

              <View style={styles.eventFooter}>
                <Pressable
                  style={styles.eventButton}
                  onPress={() => onPress(meeting.id)}
                >
                  <ThemedText style={styles.eventButtonText}>
                    View Meeting
                  </ThemedText>
                  <ArrowRight size={14} color="#ffffff" />
                </Pressable>

                {'video_url' in meeting && meeting.video_url ? (
                  <View style={styles.liveWrap}>
                    <Video size={16} color="#0b2a6f" />
                    <ThemedText style={styles.liveText}>Live Stream</ThemedText>
                  </View>
                ) : null}
              </View>
            </View>
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

function formatShortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function formatWeekday(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'short' }).toUpperCase();
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
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 120,
  },

  hero: {
    marginTop: 8,
    marginBottom: 24,
    alignItems: 'center',
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#7c8798',
    marginBottom: 10,
  },

  title: {
    fontSize: 32,
    lineHeight: 36,
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

  calendarCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.12)',
    marginBottom: 28,
  },

  calendar: {
    paddingBottom: 8,
  },

  feedHeader: {
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },

  feedTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0b2a6f',
    marginBottom: 4,
  },

  feedSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },

  clearFilter: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#0b2a6f',
    textTransform: 'uppercase',
  },

  section: {
    marginBottom: 26,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0b2a6f',
    marginBottom: 12,
  },

  sectionList: {
    gap: 12,
  },

  eventCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
  },

  eventDateCol: {
    width: 58,
  },

  eventDate: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#7c8798',
    textTransform: 'uppercase',
  },

  eventDay: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0b2a6f',
    marginTop: 2,
  },

  eventMain: {
    flex: 1,
  },

  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0b2a6f',
  },

  eventCategory: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7c8798',
    letterSpacing: 1.2,
  },

  eventTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
    color: '#0b2a6f',
    marginBottom: 10,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },

  infoText: {
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
  },

  eventFooter: {
    marginTop: 10,
    gap: 10,
  },

  eventButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0b2a6f',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  eventButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },

  liveWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  liveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0b2a6f',
    textTransform: 'uppercase',
  },

  emptyText: {
    marginTop: 20,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 14,
  },

  membersBlock: {
    marginBottom: 28,
  },

  membersList: {
    gap: 8,
  },

  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
  },

  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(11,42,111,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  memberMain: {
    flex: 1,
  },

  memberName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0b2a6f',
  },

  memberMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#7c8798',
    fontWeight: '600',
  },

  membersEmpty: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
  },

  membersEmptyText: {
    fontSize: 13,
    color: '#7c8798',
    textAlign: 'center',
  },
});