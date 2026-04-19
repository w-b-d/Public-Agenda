import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Calendar as RNCalendar } from 'react-native-calendars';
import {
  ArrowRight,
  Clock3,
  MapPin,
  Search,
  Video,
} from 'lucide-react-native';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  getJurisdiction,
  listBodiesForCounty,
  listMeetingsForCounty,
} from '@/lib/queries';
import type { Body, Jurisdiction, Meeting } from '@/types/db';

type MeetingWithBody = Meeting & {
  body?: {
    id: string;
    name: string;
    category?: string;
    jurisdiction_id?: string;
  };
  body_id?: string;
};

type Suggestion = {
  type: 'branch' | 'body';
  label: string;
  value: string;
};

const PAGE_SIZE = 10;

function getMeetingBodyId(meeting: MeetingWithBody) {
  return meeting.body?.id ?? meeting.body_id ?? '';
}

export default function CountyDashboard() {
  const { countyId } = useLocalSearchParams<{ countyId: string }>();
  const router = useRouter();

  const [county, setCounty] = useState<Jurisdiction | null>(null);
  const [bodies, setBodies] = useState<Body[]>([]);
  const [meetings, setMeetings] = useState<MeetingWithBody[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [selectedBodies, setSelectedBodies] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('Calendar');

  const [upcomingPage, setUpcomingPage] = useState(1);
  const [pastPage, setPastPage] = useState(1);

  useEffect(() => {
    if (!countyId) return;

    Promise.all([
      getJurisdiction(countyId),
      listBodiesForCounty(countyId),
      listMeetingsForCounty(countyId),
    ])
      .then(([countyData, bodiesData, meetingsData]) => {
        const safeBodies = (bodiesData ?? []) as Body[];
        const safeMeetings = (meetingsData as MeetingWithBody[]) ?? [];

        setCounty(countyData);
        setBodies(safeBodies);
        setMeetings(safeMeetings);
        setSelectedBodies(safeBodies.map((body) => body.id));
      })
      .finally(() => setLoading(false));
  }, [countyId]);

  const normalizedSearch = searchText.trim().toLowerCase();

  useEffect(() => {
    setUpcomingPage(1);
    setPastPage(1);
  }, [selectedDate, normalizedSearch, selectedBodies]);

  const groupedBodies = useMemo(() => {
    const groups: Record<string, Body[]> = {};

    for (const body of bodies) {
      const key =
        typeof body.category === 'string' && body.category.length > 0
          ? body.category
          : 'other';

      if (!groups[key]) groups[key] = [];
      groups[key].push(body);
    }

    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.name.localeCompare(b.name));
    }

    return groups;
  }, [bodies]);

  const suggestions = useMemo(() => {
    if (!normalizedSearch) return [];

    const branchMap = new Map<string, Suggestion>();
    const bodyMap = new Map<string, Suggestion>();

    for (const meeting of meetings) {
      const branch = meeting.body?.category?.trim();
      const bodyName = meeting.body?.name?.trim();

      if (branch) {
        const key = branch.toLowerCase();
        if (!branchMap.has(key)) {
          branchMap.set(key, {
            type: 'branch',
            label: branch,
            value: branch,
          });
        }
      }

      if (bodyName) {
        const key = bodyName.toLowerCase();
        if (!bodyMap.has(key)) {
          bodyMap.set(key, {
            type: 'body',
            label: bodyName,
            value: bodyName,
          });
        }
      }
    }

    for (const body of bodies) {
      const bodyName = body.name?.trim();
      const branch =
        typeof body.category === 'string' ? body.category.trim() : '';

      if (bodyName) {
        const key = bodyName.toLowerCase();
        if (!bodyMap.has(key)) {
          bodyMap.set(key, {
            type: 'body',
            label: bodyName,
            value: bodyName,
          });
        }
      }

      if (branch) {
        const key = branch.toLowerCase();
        if (!branchMap.has(key)) {
          branchMap.set(key, {
            type: 'branch',
            label: branch,
            value: branch,
          });
        }
      }
    }

    const all = [...branchMap.values(), ...bodyMap.values()];

    return all
      .filter((item) => item.label.toLowerCase().includes(normalizedSearch))
      .sort((a, b) => {
        const aStarts = a.label.toLowerCase().startsWith(normalizedSearch)
          ? 0
          : 1;
        const bStarts = b.label.toLowerCase().startsWith(normalizedSearch)
          ? 0
          : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 8);
  }, [normalizedSearch, meetings, bodies]);

  const toggleBody = (bodyId: string) => {
    setSelectedBodies((prev) =>
      prev.includes(bodyId)
        ? prev.filter((id) => id !== bodyId)
        : [...prev, bodyId]
    );
  };

  const toggleBranch = (branch: string) => {
    const branchBodies = (groupedBodies[branch] ?? []).map((b) => b.id);
    const allSelected =
      branchBodies.length > 0 &&
      branchBodies.every((id) => selectedBodies.includes(id));

    setSelectedBodies((prev) => {
      if (allSelected) {
        return prev.filter((id) => !branchBodies.includes(id));
      }
      return Array.from(new Set([...prev, ...branchBodies]));
    });
  };

  const isBranchSelected = (branch: string) => {
    const branchBodies = (groupedBodies[branch] ?? []).map((b) => b.id);
    if (branchBodies.length === 0) return false;
    return branchBodies.every((id) => selectedBodies.includes(id));
  };

  const filteredMeetings = useMemo(() => {
    let result = meetings;

    if (normalizedSearch) {
      result = result.filter((meeting) => {
        const bodyName = meeting.body?.name?.toLowerCase() ?? '';
        const branchName = meeting.body?.category?.toLowerCase() ?? '';
        const title = meeting.title?.toLowerCase() ?? '';

        return (
          bodyName.includes(normalizedSearch) ||
          branchName.includes(normalizedSearch) ||
          title.includes(normalizedSearch)
        );
      });
    }

    if (selectedBodies.length > 0) {
      result = result.filter((meeting) => {
        const meetingBodyId = getMeetingBodyId(meeting);
        return !!meetingBodyId && selectedBodies.includes(meetingBodyId);
      });
    } else {
      result = [];
    }

    if (selectedDate) {
      result = result.filter(
        (meeting) => meeting.start_time.slice(0, 10) === selectedDate
      );
    }

    return result;
  }, [meetings, normalizedSearch, selectedBodies, selectedDate]);

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

    const calendarMeetings = meetings.filter((meeting) => {
      const matchesSearch = normalizedSearch
        ? (() => {
            const bodyName = meeting.body?.name?.toLowerCase() ?? '';
            const branchName = meeting.body?.category?.toLowerCase() ?? '';
            const title = meeting.title?.toLowerCase() ?? '';

            return (
              bodyName.includes(normalizedSearch) ||
              branchName.includes(normalizedSearch) ||
              title.includes(normalizedSearch)
            );
          })()
        : true;

      const matchesBodies =
        selectedBodies.length > 0
          ? (() => {
              const meetingBodyId = getMeetingBodyId(meeting);
              return !!meetingBodyId && selectedBodies.includes(meetingBodyId);
            })()
          : false;

      return matchesSearch && matchesBodies;
    });

    for (const meeting of calendarMeetings) {
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
  }, [meetings, normalizedSearch, selectedBodies, selectedDate]);

  const nowIso = new Date().toISOString();

  const upcomingMeetings = useMemo(
    () => filteredMeetings.filter((meeting) => meeting.start_time >= nowIso),
    [filteredMeetings, nowIso]
  );

  const pastMeetings = useMemo(
    () => filteredMeetings.filter((meeting) => meeting.start_time < nowIso),
    [filteredMeetings, nowIso]
  );

  const visibleUpcomingMeetings = useMemo(
    () => upcomingMeetings.slice(0, upcomingPage * PAGE_SIZE),
    [upcomingMeetings, upcomingPage]
  );

  const visiblePastMeetings = useMemo(
    () => pastMeetings.slice(0, pastPage * PAGE_SIZE),
    [pastMeetings, pastPage]
  );

  const hasMoreUpcoming =
    visibleUpcomingMeetings.length < upcomingMeetings.length;
  const hasMorePast = visiblePastMeetings.length < pastMeetings.length;

  const goToMeeting = (meeting: MeetingWithBody) => {
    const meetingBodyId = getMeetingBodyId(meeting);
    if (!meetingBodyId || !meeting.id || !countyId) return;
    const branch = meeting.body?.category;
    if (!branch) return;

    router.push(
      `/county/${countyId}/${branch}/${meetingBodyId}/meeting/${meeting.id}`
    );
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
          keyboardShouldPersistTaps="handled"
        >
          <Header activeItem="Calendar" countyId={countyId} />

          <View style={styles.hero}>
            <ThemedText style={styles.eyebrow}>COUNTY OVERVIEW</ThemedText>
            <ThemedText style={styles.title}>
              {county?.name ?? 'County'}
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Browse every tracked meeting in this county, then filter by branch
              or body.
            </ThemedText>
          </View>

          <View style={styles.searchWrap}>
            <View style={styles.searchCard}>
              <View style={styles.searchRow}>
                <Search size={18} color="#6b7280" />
                <TextInput
                  value={searchText}
                  onChangeText={(text) => {
                    setSearchText(text);
                    setShowSuggestions(true);
                    setShowAdvancedFilter(false);
                  }}
                  onFocus={() => {
                    setShowSuggestions(true);
                    setShowAdvancedFilter(false);
                  }}
                  placeholder="Search branch or body..."
                  placeholderTextColor="#98a2b3"
                  style={styles.searchInput}
                />
              </View>

              {searchText ? (
                <Pressable
                  onPress={() => {
                    setSearchText('');
                    setShowSuggestions(false);
                  }}
                >
                  <ThemedText style={styles.clearText}>Clear</ThemedText>
                </Pressable>
              ) : null}
            </View>

            {showSuggestions && suggestions.length > 0 ? (
              <View style={styles.suggestionsCard}>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                >
                  {suggestions.map((item, index) => (
                    <Pressable
                      key={`${item.type}-${item.value}-${index}`}
                      style={[
                        styles.suggestionRow,
                        index !== suggestions.length - 1 &&
                          styles.suggestionRowBorder,
                      ]}
                      onPress={() => {
                        setSearchText(item.value);
                        setShowSuggestions(false);
                      }}
                    >
                      <View style={styles.suggestionLeft}>
                        <Search size={14} color="#7c8798" />
                        <View>
                          <ThemedText style={styles.suggestionLabel}>
                            {item.label}
                          </ThemedText>
                          <ThemedText style={styles.suggestionType}>
                            {item.type === 'branch' ? 'Branch' : 'Body'}
                          </ThemedText>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.advancedFilterWrap}>
              <Pressable
                onPress={() => {
                  setShowAdvancedFilter((prev) => !prev);
                  setShowSuggestions(false);
                }}
              >
                <ThemedText style={styles.advancedFilterText}>
                  Advanced Filter
                </ThemedText>
              </Pressable>

              {selectedBodies.length > 0 ? (
                <Pressable onPress={() => setSelectedBodies([])}>
                  <ThemedText style={styles.clearAdvancedText}>
                    Clear
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>

            {showAdvancedFilter ? (
              <View style={styles.advancedCard}>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.advancedVerticalContent}
                >
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.advancedColumns}
                  >
                    {Object.entries(groupedBodies).map(
                      ([branch, branchBodies]) => (
                        <View key={branch} style={styles.advancedColumn}>
                          <Pressable
                            style={styles.branchRow}
                            onPress={() => toggleBranch(branch)}
                          >
                            <Checkbox checked={isBranchSelected(branch)} />
                            <ThemedText style={styles.branchTitle}>
                              {branch.toUpperCase()}
                            </ThemedText>
                          </Pressable>

                          <View style={styles.branchBodiesList}>
                            {branchBodies.map((body) => (
                              <Pressable
                                key={body.id}
                                style={styles.bodyRow}
                                onPress={() => toggleBody(body.id)}
                              >
                                <Checkbox
                                  checked={selectedBodies.includes(body.id)}
                                />
                                <ThemedText style={styles.bodyRowText}>
                                  {body.name}
                                </ThemedText>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )
                    )}
                  </ScrollView>
                </ScrollView>
              </View>
            ) : null}
          </View>

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
              <ThemedText style={styles.feedTitle}>
                Chronicle of Events
              </ThemedText>
              <ThemedText style={styles.feedSubtitle}>
                {selectedDate
                  ? `Filtered by ${selectedDate}`
                  : 'All tracked meetings for this county.'}
              </ThemedText>
            </View>

            {selectedDate ? (
              <Pressable onPress={() => setSelectedDate(null)}>
                <ThemedText style={styles.clearFilter}>Clear Date</ThemedText>
              </Pressable>
            ) : null}
          </View>

          <MeetingSection
            title="Upcoming"
            meetings={visibleUpcomingMeetings}
            onPress={goToMeeting}
            hasMore={hasMoreUpcoming}
            onLoadMore={() => setUpcomingPage((p) => p + 1)}
          />

          <MeetingSection
            title="Past"
            meetings={visiblePastMeetings}
            onPress={goToMeeting}
            hasMore={hasMorePast}
            onLoadMore={() => setPastPage((p) => p + 1)}
          />

          {filteredMeetings.length === 0 ? (
            <ThemedText style={styles.emptyText}>
              No meetings match this filter.
            </ThemedText>
          ) : null}

          <Footer />
        </ScrollView>
      )}

      <BottomNav activeTab="Calendar" onChangeTab={setActiveTab as any} />
    </ThemedView>
  );
}

function MeetingSection({
  title,
  meetings,
  onPress,
  hasMore = false,
  onLoadMore,
}: {
  title: string;
  meetings: MeetingWithBody[];
  onPress: (meeting: MeetingWithBody) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
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
            onPress={() => onPress(meeting)}
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
                  {(meeting.body?.category ?? 'public meeting').toUpperCase()}
                </ThemedText>
              </View>

              <ThemedText style={styles.eventTitle}>
                {meeting.title ?? meeting.body?.name ?? 'Untitled Meeting'}
              </ThemedText>

              {meeting.body?.name ? (
                <ThemedText style={styles.bodyName}>
                  {meeting.body.name}
                </ThemedText>
              ) : null}

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
                  onPress={() => onPress(meeting)}
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

        {hasMore && onLoadMore ? (
          <Pressable style={styles.loadMoreButton} onPress={onLoadMore}>
            <ThemedText style={styles.loadMoreText}>Load More</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked ? <View style={styles.checkboxInner} /> : null}
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

  searchWrap: {
    marginBottom: 18,
  },

  searchCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 2,
  },

  clearText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0b2a6f',
    textTransform: 'uppercase',
  },

  suggestionsCard: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
    overflow: 'hidden',
    maxHeight: 224,
  },

  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },

  suggestionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(120,130,150,0.10)',
  },

  suggestionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  suggestionLabel: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },

  suggestionType: {
    fontSize: 12,
    color: '#7c8798',
    marginTop: 2,
  },

  advancedFilterWrap: {
    marginTop: 10,
    marginBottom: 12,
    paddingHorizontal: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  advancedFilterText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0b2a6f',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  clearAdvancedText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#7c8798',
    textTransform: 'uppercase',
  },

  advancedVerticalContent: {
    paddingVertical: 12,
  },

  advancedCard: {
    marginBottom: 18,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
    maxHeight: 280,
    overflow: 'hidden',
  },

  advancedColumns: {
    padding: 12,
    gap: 12,
  },

  advancedColumn: {
    width: 220,
    backgroundColor: '#fbfcfe',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.08)',
  },

  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(120,130,150,0.08)',
  },

  branchTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0b2a6f',
    letterSpacing: 1,
  },

  branchBodiesList: {
    gap: 10,
  },

  bodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  bodyRowText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#374151',
    fontWeight: '600',
  },

  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    backgroundColor: '#ffffff',
  },

  checkboxChecked: {
    borderColor: '#0b2a6f',
    backgroundColor: '#e8eef9',
  },

  checkboxInner: {
    width: 9,
    height: 9,
    borderRadius: 2,
    backgroundColor: '#0b2a6f',
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
    marginBottom: 4,
  },

  bodyName: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 10,
    fontWeight: '600',
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

  loadMoreButton: {
    marginTop: 4,
    alignSelf: 'center',
    backgroundColor: '#e9edf3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },

  loadMoreText: {
    color: '#0b2a6f',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});