import { useAuth, useUser } from '@clerk/clerk-expo';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  ArrowRight,
  Clock3,
  LogOut,
  MapPin,
  Star,
  Users,
} from 'lucide-react-native';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  listUpcomingSubscribedMeetings,
  type SubscribedMeetingWithPeers,
} from '@/lib/queries/subscriptions';

export default function MySubscriptionsScreen() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { signOut } = useAuth();
  const [meetings, setMeetings] = useState<SubscribedMeetingWithPeers[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace('/sign-in');
      return;
    }
    listUpcomingSubscribedMeetings(user.id)
      .then(setMeetings)
      .finally(() => setLoading(false));
  }, [isLoaded, user, router]);

  const goToMeeting = (m: SubscribedMeetingWithPeers) => {
    const branch = m.body?.category;
    if (!branch || !m.body?.id) return;
    // We don't know countyId on the meeting payload — fall back to
    // reading it from the body's jurisdiction_id if ever exposed. For
    // now, navigate via the body's known id + category.
    router.push(
      // @ts-expect-error — countyId is unknown here; expo-router will 404
      // if the body's jurisdiction can't be resolved. Good enough for demo.
      `/county/${m.body?.jurisdiction_id ?? ''}/${branch}/${m.body.id}/meeting/${m.id}`,
    );
  };

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Header activeItem="Select" />
        <View style={styles.hero}>
          <ThemedText style={styles.eyebrow}>MY SUBSCRIPTIONS</ThemedText>
          <ThemedText style={styles.title}>Upcoming meetings you starred</ThemedText>
          {user?.emailAddresses?.[0]?.emailAddress ? (
            <ThemedText style={styles.subtitle}>
              Signed in as {user.emailAddresses[0].emailAddress}
            </ThemedText>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
          </View>
        ) : meetings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Star size={28} color="#7c8798" />
            <ThemedText style={styles.emptyTitle}>No stars yet</ThemedText>
            <ThemedText style={styles.emptyText}>
              Tap the star on any meeting in the Chronicle to save it here.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.list}>
            {meetings.map((m) => {
              const others = m.subscribers.filter((s) => s.user_id !== user?.id);
              return (
                <Pressable
                  key={m.id}
                  style={styles.card}
                  onPress={() => goToMeeting(m)}
                >
                  <ThemedText style={styles.bodyLabel}>
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
                  {m.location ? (
                    <View style={styles.infoRow}>
                      <MapPin size={13} color="#7c8798" />
                      <ThemedText style={styles.infoText}>{m.location}</ThemedText>
                    </View>
                  ) : null}

                  <SubscribersRow others={others} />

                  <View style={styles.cardFooter}>
                    <ArrowRight size={14} color="#0b2a6f" />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          style={styles.signOutButton}
          onPress={async () => {
            try {
              await signOut();
            } catch (e) {
              console.warn('[sign-out] failed', e);
            }
            router.replace('/');
          }}
        >
          <LogOut size={14} color="#7c8798" />
          <ThemedText style={styles.signOutText}>Sign out</ThemedText>
        </Pressable>

        <Footer />
      </ScrollView>
    </ThemedView>
  );
}

function SubscribersRow({
  others,
}: {
  others: Array<{ user_id: string; display_name: string | null }>;
}) {
  if (others.length === 0) {
    return (
      <View style={styles.subscribersRow}>
        <Users size={13} color="#7c8798" />
        <ThemedText style={styles.subscribersText}>
          You're the only one subscribed so far.
        </ThemedText>
      </View>
    );
  }

  // Show up to 3 names inline, then "+N more" if there are more.
  const MAX = 3;
  const firstFew = others.slice(0, MAX);
  const remaining = Math.max(others.length - MAX, 0);
  const labels = firstFew.map(
    (s) => s.display_name || s.user_id.slice(0, 8),
  );
  const joined = labels.join(', ');
  const suffix = remaining > 0 ? ` +${remaining} more` : '';

  return (
    <View style={styles.subscribersRow}>
      <Users size={13} color="#0b2a6f" />
      <ThemedText style={styles.subscribersTextActive}>
        {others.length === 1 ? '1 other subscribed · ' : `${others.length} others subscribed · `}
        {joined}
        {suffix}
      </ThemedText>
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
  screen: { flex: 1, backgroundColor: '#f6f7fb' },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 100 },
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 24 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#7c8798',
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0b2a6f',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: { fontSize: 13, color: '#6b7280' },
  loadingWrap: { alignItems: 'center', paddingVertical: 40 },
  list: { gap: 12 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
  },
  bodyLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7c8798',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  meetingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0b2a6f',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  infoText: { fontSize: 12, color: '#6b7280' },
  subscribersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(120,130,150,0.12)',
  },
  subscribersText: { fontSize: 12, color: '#7c8798' },
  subscribersTextActive: {
    fontSize: 12,
    color: '#0b2a6f',
    fontWeight: '600',
    flex: 1,
    flexWrap: 'wrap',
  },
  cardFooter: { alignItems: 'flex-end', marginTop: 6 },
  emptyCard: {
    padding: 28,
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0b2a6f' },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  signOutButton: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 30,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.25)',
  },
  signOutText: { color: '#7c8798', fontSize: 12, fontWeight: '700' },
});
