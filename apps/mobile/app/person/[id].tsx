import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  Globe,
  Mail,
  MapPin,
  Phone,
  User as UserIcon,
} from 'lucide-react-native';

import BottomNav from '@/components/BottomNav';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getPerson, listPersonMeetings } from '@/lib/queries/people';
import type { MeetingWithBody, PersonDetail, RoleWithBody } from '@/types/db';

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [upcoming, setUpcoming] = useState<MeetingWithBody[]>([]);
  const [past, setPast] = useState<MeetingWithBody[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('person');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getPerson(id),
      listPersonMeetings(id, 'upcoming', 10),
      listPersonMeetings(id, 'past', 10),
    ])
      .then(([d, up, pa]) => {
        setDetail(d);
        setUpcoming(up ?? []);
        setPast(pa ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" />
        </View>
        <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
      </ThemedView>
    );
  }

  if (!detail) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header activeItem="Select" />
        <View style={styles.loadingWrap}>
          <ThemedText style={styles.emptyText}>Person not found.</ThemedText>
        </View>
        <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
      </ThemedView>
    );
  }

  const { person, current_roles, past_roles } = detail;
  const primaryTitle = current_roles[0]?.title ?? null;
  const primaryBody = current_roles[0]?.body?.name ?? null;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Header activeItem="Select" />

        <View style={styles.hero}>
          <View style={styles.avatarLarge}>
            <UserIcon size={42} color="#0b2a6f" />
          </View>
          <ThemedText style={styles.eyebrow}>PUBLIC OFFICIAL</ThemedText>
          <ThemedText style={styles.title}>{person.name}</ThemedText>
          {primaryTitle || primaryBody ? (
            <ThemedText style={styles.subtitle}>
              {[primaryTitle, primaryBody].filter(Boolean).join(' · ')}
            </ThemedText>
          ) : null}
        </View>

        <ContactCard
          email={person.email}
          phone={person.phone}
          url={person.official_url}
        />

        <RolesSection
          title="Current Roles"
          roles={current_roles}
          emptyText="No active roles on record."
          onPressBody={(bodyId, category) => goToBody(router, bodyId, category)}
        />

        <RolesSection
          title="Past Roles"
          roles={past_roles}
          emptyText={null}
          showDates
          onPressBody={(bodyId, category) => goToBody(router, bodyId, category)}
        />

        <MeetingsSection
          title={`Scheduled meetings of ${person.name}'s bodies`}
          meetings={upcoming}
          onPress={(m) =>
            goToMeeting(router, m)
          }
        />

        <MeetingsSection
          title={`Recent meetings of bodies ${person.name} serves on`}
          meetings={past}
          onPress={(m) =>
            goToMeeting(router, m)
          }
        />

        <Footer />
      </ScrollView>

      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
    </ThemedView>
  );
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------
/**
 * The body screen lives at /county/[countyId]/[branch]/[bodyId]. We don't
 * have the countyId on the person-detail payload, so we fall back to the
 * catch-all index screen for now. Future: add a `/body/[id]` redirect that
 * looks up jurisdiction + category and forwards.
 *
 * Until then, body taps silently no-op to avoid sending people into a
 * broken URL path.
 */
function goToBody(_router: any, _bodyId: string, _category: string) {
  // TODO: wire up once /body/[id] redirect exists.
}

function goToMeeting(router: any, m: MeetingWithBody) {
  // Same limitation — we'd need to know countyId + branch. For now this
  // is a no-op; meeting rows are informational here.
  void router;
  void m;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function ContactCard({
  email,
  phone,
  url,
}: {
  email: string | null;
  phone: string | null;
  url: string | null;
}) {
  const hasAny = !!(email || phone || url);
  return (
    <View style={styles.contactCard}>
      <ThemedText style={styles.sectionTitle}>Contact</ThemedText>
      {!hasAny ? (
        <ThemedText style={styles.mutedText}>
          No public contact info available.
        </ThemedText>
      ) : (
        <View style={{ gap: 10 }}>
          {email ? (
            <ContactRow
              icon={<Mail size={16} color="#0b2a6f" />}
              label={email}
              onPress={() => Linking.openURL(`mailto:${email}`)}
            />
          ) : null}
          {phone ? (
            <ContactRow
              icon={<Phone size={16} color="#0b2a6f" />}
              label={phone}
              onPress={() => Linking.openURL(`tel:${phone}`)}
            />
          ) : null}
          {url ? (
            <ContactRow
              icon={<Globe size={16} color="#0b2a6f" />}
              label={url}
              onPress={() => Linking.openURL(url)}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

function ContactRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.contactRow} onPress={onPress}>
      {icon}
      <ThemedText style={styles.contactLabel} numberOfLines={1}>
        {label}
      </ThemedText>
      <ArrowRight size={14} color="#7c8798" />
    </Pressable>
  );
}

function RolesSection({
  title,
  roles,
  emptyText,
  showDates,
  onPressBody,
}: {
  title: string;
  roles: RoleWithBody[];
  emptyText: string | null;
  showDates?: boolean;
  onPressBody: (bodyId: string, category: string) => void;
}) {
  if (roles.length === 0 && emptyText === null) return null;

  return (
    <View style={styles.sectionBlock}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {roles.length === 0 ? (
        <View style={styles.emptyCard}>
          <ThemedText style={styles.mutedText}>{emptyText}</ThemedText>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {roles.map((role) => (
            <Pressable
              key={role.id}
              style={styles.roleCard}
              onPress={() => onPressBody(role.body.id, role.body.category)}
            >
              <View style={styles.memberAvatar}>
                <MapPin size={16} color="#0b2a6f" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.roleBody}>
                  {role.body?.name ?? 'Unknown body'}
                </ThemedText>
                <ThemedText style={styles.roleMeta}>
                  {role.title ?? 'Member'}
                  {showDates ? ` · ${formatDateRange(role.start_date, role.end_date)}` : ''}
                </ThemedText>
              </View>
              <ChevronRight size={18} color="#7c8798" />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function MeetingsSection({
  title,
  meetings,
  onPress,
}: {
  title: string;
  meetings: MeetingWithBody[];
  onPress: (m: MeetingWithBody) => void;
}) {
  if (meetings.length === 0) return null;
  return (
    <View style={styles.sectionBlock}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      <View style={{ gap: 8 }}>
        {meetings.map((m) => (
          <Pressable
            key={m.id}
            style={styles.meetingCard}
            onPress={() => onPress(m)}
          >
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.meetingBody}>
                {m.body?.name ?? 'Meeting'}
              </ThemedText>
              <ThemedText style={styles.meetingTitle}>
                {m.title ?? 'Untitled Meeting'}
              </ThemedText>
              <View style={styles.infoRow}>
                <Clock3 size={13} color="#7c8798" />
                <ThemedText style={styles.infoText}>
                  {formatDateTime(m.start_time)}
                </ThemedText>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateRange(start: string | null, end: string | null): string {
  const s = start ? new Date(start).getFullYear() : '?';
  const e = end ? new Date(end).getFullYear() : 'present';
  return `${s} → ${e}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7fb' },

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

  avatarLarge: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(11,42,111,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#7c8798',
    marginBottom: 8,
  },

  title: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    color: '#0b2a6f',
    textAlign: 'center',
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  sectionBlock: {
    marginBottom: 26,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0b2a6f',
    marginBottom: 12,
  },

  contactCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
  },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  contactLabel: {
    flex: 1,
    fontSize: 14,
    color: '#0b2a6f',
    fontWeight: '600',
  },

  emptyCard: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
  },

  mutedText: {
    fontSize: 13,
    color: '#7c8798',
  },

  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },

  roleCard: {
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(11,42,111,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  roleBody: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0b2a6f',
  },

  roleMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#7c8798',
    fontWeight: '600',
  },

  meetingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
  },

  meetingBody: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#7c8798',
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  meetingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0b2a6f',
    marginBottom: 6,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },

  infoText: {
    fontSize: 12,
    color: '#6b7280',
  },
});
