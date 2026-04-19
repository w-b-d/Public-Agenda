import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Calendar as RNCalendar } from 'react-native-calendars';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  MapPin,
  Search,
  Star,
  User as UserIcon,
  Video,
  X,
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
import {
  listMembersForBodies,
  listRolesForPeople,
  type PersonRoleSpan,
} from '@/lib/queries/people';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import type { Body, Jurisdiction, Meeting, PersonWithRole } from '@/types/db';

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

// Above this width we render Public Officials + Chronicle of Events as
// two columns. Below we stack them — phone widths (≤430) are always below.
const TWO_COLUMN_BREAKPOINT = 900;

function getMeetingBodyId(meeting: MeetingWithBody) {
  return meeting.body?.id ?? meeting.body_id ?? '';
}

/**
 * True if the meeting passes the selected-people filter: for EACH
 * selected person, there must exist a role on the meeting's body that
 * qualifies. Qualification is asymmetric by meeting time:
 *
 *   - PAST meeting: just having a role on this body is enough. Legistar's
 *     OfficeRecordEndDate is often a bureaucratic term-end, not a signal
 *     that the person stopped participating, so we don't over-filter past
 *     appearances (e.g. Glenn Church speaking at a Measure AA meeting
 *     after his formal role ended).
 *
 *   - FUTURE meeting: the role must still be active — start_date (if
 *     known) on or before the meeting, end_date (if set) on or after.
 *     This prevents a former supervisor from surfacing meetings that
 *     haven't happened yet.
 *
 * Intersect semantics across selected people: matches the body-checkbox
 * filter's composition.
 */
function meetingPassesPersonFilter(
  meeting: MeetingWithBody,
  selectedPeople: string[],
  rolesByPerson: Map<string, Map<string, PersonRoleSpan[]>>,
  todayISO: string,
): boolean {
  if (selectedPeople.length === 0) return true;
  const bodyId = getMeetingBodyId(meeting);
  if (!bodyId) return false;
  const meetingDay = meeting.start_time?.slice(0, 10) ?? '';
  const isFuture = meetingDay >= todayISO;

  for (const personId of selectedPeople) {
    const byBody = rolesByPerson.get(personId);
    if (!byBody) return false;
    const spans = byBody.get(bodyId) ?? [];
    if (spans.length === 0) return false;
    if (isFuture) {
      const anyActive = spans.some(
        (s) =>
          (!s.start_date || s.start_date <= meetingDay) &&
          (!s.end_date || s.end_date >= meetingDay),
      );
      if (!anyActive) return false;
    }
    // Past: role existence on this body is sufficient.
  }
  return true;
}

export default function CountyDashboard() {
  const { countyId } = useLocalSearchParams<{ countyId: string }>();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= TWO_COLUMN_BREAKPOINT;

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

  const [members, setMembers] = useState<PersonWithRole[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersVisible, setMembersVisible] = useState(20);

  const subs = useSubscriptions();

  const handleToggleStar = async (meetingId: string) => {
    if (!subs.isSignedIn) {
      router.push('/sign-in');
      return;
    }
    await subs.toggle(meetingId);
  };

  // Person-level filter: when non-empty, the Chronicle further narrows to
  // meetings of bodies these people have or had a role on AND whose
  // date falls inside the person's role span on that body. Stored as raw
  // (person, body, start, end) tuples for meeting-by-meeting filtering.
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [peopleRoles, setPeopleRoles] = useState<PersonRoleSpan[]>([]);

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
        // Checkbox semantics: default is everything selected. Unchecking
        // removes items from view; fully empty selection hides everything.
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

  const advancedFilterCounts = useMemo(() => {
    const branchCounts = new Map<string, number>();
    const bodyCounts = new Map<string, number>();

    for (const meeting of meetings) {
      const bodyId = getMeetingBodyId(meeting);
      const branch = meeting.body?.category?.trim();

      if (bodyId) {
        bodyCounts.set(bodyId, (bodyCounts.get(bodyId) ?? 0) + 1);
      }

      if (branch) {
        branchCounts.set(branch, (branchCounts.get(branch) ?? 0) + 1);
      }
    }

    return { branchCounts, bodyCounts };
  }, [meetings]);

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

  /**
   * Body IDs that match the current filter (search text + explicit selection).
   * Checkbox semantics: selection is ALWAYS applied. By default every body
   * is selected, so the unfiltered view still shows everything; unchecking
   * bodies removes them from every downstream list (calendar, members,
   * events).
   */
  const filteredBodyIds = useMemo(() => {
    let result = bodies.filter((body) => selectedBodies.includes(body.id));

    if (normalizedSearch) {
      result = result.filter((body) => {
        const name = body.name?.toLowerCase() ?? '';
        const category =
          typeof body.category === 'string' ? body.category.toLowerCase() : '';
        return (
          name.includes(normalizedSearch) ||
          category.includes(normalizedSearch)
        );
      });
    }

    return result.map((b) => b.id);
  }, [bodies, normalizedSearch, selectedBodies]);

  // Reset paginated reveal whenever the filter changes.
  useEffect(() => {
    setMembersVisible(20);
  }, [filteredBodyIds]);

  // Load members for the filtered body set. Cheap enough to refetch on
  // change (Supabase returns a few hundred rows even for county-wide);
  // we can add a cache if it becomes a problem.
  useEffect(() => {
    if (filteredBodyIds.length === 0) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    listMembersForBodies(filteredBodyIds)
      .then((m) => setMembers(m))
      .finally(() => setMembersLoading(false));
  }, [filteredBodyIds]);

  // When the selected-people set changes, fetch every role span (body +
  // date range) those people have or had. Used for meeting-by-meeting
  // time-aware filtering so a former supervisor no longer surfaces
  // *upcoming* meetings of a body they've left.
  useEffect(() => {
    if (selectedPeople.length === 0) {
      setPeopleRoles([]);
      return;
    }
    listRolesForPeople(selectedPeople).then(setPeopleRoles);
  }, [selectedPeople]);

  // Index role spans by person for per-meeting checking. Each person gets
  // a Map<body_id, RoleSpan[]> so `meetingPassesPersonFilter` doesn't need
  // to scan the whole array per call.
  const rolesByPerson = useMemo(() => {
    const byPerson = new Map<string, Map<string, PersonRoleSpan[]>>();
    for (const r of peopleRoles) {
      let byBody = byPerson.get(r.person_id);
      if (!byBody) {
        byBody = new Map();
        byPerson.set(r.person_id, byBody);
      }
      const existing = byBody.get(r.body_id) ?? [];
      existing.push(r);
      byBody.set(r.body_id, existing);
    }
    return byPerson;
  }, [peopleRoles]);

  const togglePerson = (personId: string) => {
    setSelectedPeople((prev) =>
      prev.includes(personId)
        ? prev.filter((id) => id !== personId)
        : [...prev, personId],
    );
  };

  const clearSelectedPeople = () => setSelectedPeople([]);

  const filteredMeetings = useMemo(() => {
    const allowedBodies = new Set(filteredBodyIds);
    const today = new Date().toISOString().slice(0, 10);
    let result = meetings.filter((meeting) => {
      const meetingBodyId = getMeetingBodyId(meeting);
      if (!meetingBodyId || !allowedBodies.has(meetingBodyId)) return false;
      return meetingPassesPersonFilter(
        meeting,
        selectedPeople,
        rolesByPerson,
        today,
      );
    });

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

    if (selectedDate) {
      result = result.filter(
        (meeting) => meeting.start_time.slice(0, 10) === selectedDate
      );
    }

    return result;
  }, [
    meetings,
    normalizedSearch,
    filteredBodyIds,
    selectedPeople,
    rolesByPerson,
    selectedDate,
  ]);

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

    const allowedBodies = new Set(filteredBodyIds);
    const today = new Date().toISOString().slice(0, 10);
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

      const meetingBodyId = getMeetingBodyId(meeting);
      const matchesBodies = !!meetingBodyId && allowedBodies.has(meetingBodyId);
      if (!matchesSearch || !matchesBodies) return false;

      return meetingPassesPersonFilter(
        meeting,
        selectedPeople,
        rolesByPerson,
        today,
      );
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
  }, [
    meetings,
    normalizedSearch,
    filteredBodyIds,
    selectedPeople,
    rolesByPerson,
    selectedDate,
  ]);

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
                              {branch.toUpperCase()} ({advancedFilterCounts.branchCounts.get(branch) ?? 0})
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
                                  {body.name} ({advancedFilterCounts.bodyCounts.get(body.id) ?? 0})
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

          <View style={isWide ? styles.twoColumnRow : undefined}>
            <View style={isWide ? styles.columnNarrow : undefined}>
              <MembersBlock
                members={members}
                visible={membersVisible}
                loading={membersLoading}
                filterActive={
                  filteredBodyIds.length < bodies.length ||
                  normalizedSearch.length > 0
                }
                totalBodies={filteredBodyIds.length}
                selectedPeople={selectedPeople}
                onToggleSelect={togglePerson}
                onClearSelected={clearSelectedPeople}
                onOpen={goToPerson}
                onShowMore={() => setMembersVisible((n) => n + 20)}
              />
            </View>

            <View style={isWide ? styles.columnWide : undefined}>
              <View style={styles.feedHeader}>
                <View>
                  <ThemedText style={styles.feedTitle}>
                    Chronicle of Events
                  </ThemedText>
                  <ThemedText style={styles.feedSubtitle}>
                    {selectedDate
                      ? `Filtered by ${selectedDate}`
                      : selectedPeople.length > 0
                        ? `Meetings of ${selectedPeople.length} selected official${selectedPeople.length === 1 ? '' : 's'} — bodies they've served on`
                        : 'All tracked meetings for this county.'}
                  </ThemedText>
                </View>

                {selectedDate ? (
                  <Pressable onPress={() => setSelectedDate(null)}>
                    <ThemedText style={styles.clearFilter}>
                      Clear Date
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>

              <MeetingSection
                title="Upcoming"
                meetings={visibleUpcomingMeetings}
                onPress={goToMeeting}
                hasMore={hasMoreUpcoming}
                onLoadMore={() => setUpcomingPage((p) => p + 1)}
                subscribedIds={subs.meetingIds}
                onToggleStar={handleToggleStar}
              />

              <MeetingSection
                title="Past"
                meetings={visiblePastMeetings}
                onPress={goToMeeting}
                hasMore={hasMorePast}
                onLoadMore={() => setPastPage((p) => p + 1)}
                subscribedIds={subs.meetingIds}
                onToggleStar={handleToggleStar}
              />

              {filteredMeetings.length === 0 ? (
                <ThemedText style={styles.emptyText}>
                  No meetings match this filter.
                </ThemedText>
              ) : null}
            </View>
          </View>

          <Footer />
        </ScrollView>
      )}

      <BottomNav activeTab="Calendar" onChangeTab={setActiveTab as any} />
    </ThemedView>
  );
}

function MembersBlock({
  members,
  visible,
  loading,
  filterActive,
  totalBodies,
  selectedPeople,
  onToggleSelect,
  onClearSelected,
  onOpen,
  onShowMore,
}: {
  members: PersonWithRole[];
  visible: number;
  loading: boolean;
  filterActive: boolean;
  totalBodies: number;
  selectedPeople: string[];
  onToggleSelect: (id: string) => void;
  onClearSelected: () => void;
  onOpen: (id: string) => void;
  onShowMore: () => void;
}) {
  const shown = members.slice(0, visible);
  const remaining = Math.max(members.length - visible, 0);

  const currentCount = members.filter((m) => m.isCurrent).length;
  const pastCount = members.length - currentCount;

  const subtitle = filterActive
    ? `${currentCount} current${pastCount > 0 ? ` + ${pastCount} former` : ''} across ${totalBodies} ${totalBodies === 1 ? 'body' : 'bodies'
    }`
    : `${currentCount} current${pastCount > 0 ? ` + ${pastCount} former` : ''} officials tracked`;

  // Build a map for quick lookup when rendering pills at top.
  const selectedMembers = members.filter((m) => selectedPeople.includes(m.person.id));

  return (
    <View style={styles.membersBlock}>
      <View style={styles.membersHeader}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.feedTitle}>Public Officials</ThemedText>
          <ThemedText style={styles.feedSubtitle}>{subtitle}</ThemedText>
          {selectedPeople.length > 0 ? (
            <ThemedText style={[styles.feedSubtitle, { marginTop: 4 }]}>
              Filtering events by {selectedPeople.length} selected.{' '}
              <ThemedText
                style={styles.clearFilter}
                onPress={onClearSelected}
              >
                Clear
              </ThemedText>
            </ThemedText>
          ) : null}
        </View>
      </View>

      {selectedMembers.length > 0 ? (
        <View style={styles.pillsRow}>
          {selectedMembers.map(({ person }) => (
            <Pressable
              key={person.id}
              style={styles.pill}
              onPress={() => onToggleSelect(person.id)}
            >
              <ThemedText style={styles.pillText} numberOfLines={1}>
                {person.name}
              </ThemedText>
              <X size={12} color="#ffffff" />
            </Pressable>
          ))}
        </View>
      ) : null}

      {loading && members.length === 0 ? (
        <View style={styles.membersLoadingCard}>
          <ActivityIndicator />
        </View>
      ) : members.length === 0 ? (
        <View style={styles.membersEmptyCard}>
          <ThemedText style={styles.mutedText}>
            No member data yet for the selected bodies.
          </ThemedText>
        </View>
      ) : (
        <>
          <View style={styles.membersList}>
            {shown.map(({ person, role, isCurrent }) => {
              const selected = selectedPeople.includes(person.id);
              return (
                <Pressable
                  key={person.id}
                  style={[
                    styles.memberCard,
                    selected && styles.memberCardSelected,
                  ]}
                  onPress={() => onToggleSelect(person.id)}
                  onLongPress={() => onOpen(person.id)}
                  delayLongPress={350}
                >
                  <View style={styles.memberAvatar}>
                    {selected ? (
                      <Check size={18} color="#ffffff" />
                    ) : (
                      <UserIcon size={18} color="#0b2a6f" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.memberNameRow}>
                      <ThemedText
                        style={styles.memberName}
                        numberOfLines={1}
                      >
                        {person.name}
                      </ThemedText>
                      {!isCurrent ? (
                        <View style={styles.formerChip}>
                          <ThemedText style={styles.formerChipText}>
                            FORMER
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <ThemedText style={styles.memberMeta} numberOfLines={1}>
                      {role.title ?? 'Member'}
                      {role.district ? ` · ${role.district}` : ''}
                    </ThemedText>
                  </View>
                  <ChevronRight size={18} color="#7c8798" />
                </Pressable>
              );
            })}
          </View>

          {remaining > 0 ? (
            <Pressable style={styles.showMoreButton} onPress={onShowMore}>
              <ThemedText style={styles.showMoreText}>
                Show {Math.min(20, remaining)} more ({remaining} remaining)
              </ThemedText>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

function MeetingSection({
  title,
  meetings,
  onPress,
  hasMore = false,
  onLoadMore,
  subscribedIds,
  onToggleStar,
}: {
  title: string;
  meetings: MeetingWithBody[];
  onPress: (meeting: MeetingWithBody) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  subscribedIds?: Set<string>;
  onToggleStar?: (meetingId: string) => void;
}) {
  if (meetings.length === 0) return null;

  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>

      <View style={styles.sectionList}>
        {meetings.map((meeting) => {
          const starred = subscribedIds?.has(meeting.id) ?? false;
          return (
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
              <View style={styles.eventTopRow}>
                <View style={styles.eventMetaRow}>
                  <View style={styles.dot} />
                  <ThemedText style={styles.eventCategory}>
                    {(meeting.body?.category ?? 'public meeting').toUpperCase()}
                  </ThemedText>
                </View>
                {onToggleStar ? (
                  <Pressable
                    hitSlop={10}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      onToggleStar(meeting.id);
                    }}
                    style={styles.starButton}
                  >
                    <Star
                      size={20}
                      color={starred ? '#f59e0b' : '#9ca3af'}
                      fill={starred ? '#f59e0b' : 'transparent'}
                    />
                  </Pressable>
                ) : null}
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
          );
        })}

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
    flex: 1,
  },

  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  starButton: {
    padding: 4,
    marginTop: -2,
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

  twoColumnRow: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'flex-start',
  },

  columnNarrow: {
    flex: 1,
    minWidth: 0,
  },

  columnWide: {
    flex: 3,
    minWidth: 0,
  },

  membersBlock: {
    marginBottom: 28,
  },

  membersHeader: {
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
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

  memberCardSelected: {
    backgroundColor: 'rgba(11,42,111,0.06)',
    borderColor: '#0b2a6f',
  },

  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(11,42,111,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },

  memberName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0b2a6f',
    flexShrink: 1,
  },

  formerChip: {
    backgroundColor: 'rgba(124,135,152,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  formerChipText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#7c8798',
    letterSpacing: 0.8,
  },

  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0b2a6f',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 6,
    maxWidth: '100%',
  },

  pillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },

  memberMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#7c8798',
    fontWeight: '600',
  },

  showMoreButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(11,42,111,0.25)',
    backgroundColor: '#ffffff',
  },

  showMoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0b2a6f',
    letterSpacing: 0.6,
  },

  membersLoadingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
    alignItems: 'center',
  },

  membersEmptyCard: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
  },

  mutedText: {
    fontSize: 13,
    color: '#7c8798',
    textAlign: 'center',
  },
});