import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ArrowRight, Building2 } from 'lucide-react-native';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BRANCHES } from '@/constants/branches';
import { listBodies } from '@/lib/queries';
import type { Body } from '@/types/db';

export default function BranchScreen() {
  const { countyId, branch } = useLocalSearchParams<{
    countyId: string;
    branch: string;
  }>();

  const router = useRouter();

  const [bodies, setBodies] = useState<Body[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Archive');

  const branchInfo = BRANCHES.find((b) => b.slug === branch);

  useEffect(() => {
    if (!countyId || !branch) return;

    listBodies(countyId, branch)
      .then((data) => setBodies(data ?? []))
      .finally(() => setLoading(false));
  }, [countyId, branch]);

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
            <ThemedText style={styles.eyebrow}>CIVIC DIRECTORY</ThemedText>
            <ThemedText style={styles.title}>
              {branchInfo?.label ?? branch}
            </ThemedText>

            {branchInfo?.blurb ? (
              <ThemedText style={styles.subtitle}>{branchInfo.blurb}</ThemedText>
            ) : (
              <ThemedText style={styles.subtitle}>
                Browse tracked government bodies within this branch.
              </ThemedText>
            )}
          </View>

          {bodies.length === 0 ? (
            <View style={styles.emptyCard}>
              <ThemedText style={styles.emptyTitle}>
                No bodies tracked yet
              </ThemedText>
              <ThemedText style={styles.emptyText}>
                More records for this branch will appear here as they are added.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>
                Available Bodies
              </ThemedText>

              <View style={styles.cards}>
                {bodies.map((body) => (
                  <Pressable
                    key={body.id}
                    style={styles.card}
                    onPress={() =>
                      router.push(`/county/${countyId}/${branch}/${body.id}`)
                    }
                  >
                    <View style={styles.cardTopRow}>
                      <View style={styles.cardMetaRow}>
                        <Building2 size={18} color="#0b2a6f" />
                        <ThemedText style={styles.cardMeta}>
                          GOVERNING BODY
                        </ThemedText>
                      </View>
                    </View>

                    <ThemedText style={styles.cardTitle}>{body.name}</ThemedText>

                    <View style={styles.cardFooter}>
                      <View style={styles.openButton}>
                        <ThemedText style={styles.openButtonText}>
                          Open Calendar
                        </ThemedText>
                        <ArrowRight size={14} color="#ffffff" />
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <Footer />
        </ScrollView>
      )}

      <BottomNav activeTab="Archive" onChangeTab={setActiveTab as any} />
    </ThemedView>
  );
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
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
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

  section: {
    marginBottom: 20,
  },

  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0b2a6f',
    marginBottom: 14,
  },

  cards: {
    gap: 12,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
  },

  cardTopRow: {
    marginBottom: 8,
  },

  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  cardMeta: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7c8798',
    letterSpacing: 1.2,
  },

  cardTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: '#0b2a6f',
    marginBottom: 14,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },

  openButton: {
    backgroundColor: '#0b2a6f',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  openButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },

  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
  },

  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0b2a6f',
    marginBottom: 8,
    textAlign: 'center',
  },

  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6b7280',
    textAlign: 'center',
  },
});
