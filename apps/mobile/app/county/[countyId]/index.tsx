import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ArrowRight, Landmark } from 'lucide-react-native';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BRANCHES } from '@/constants/branches';
import { getJurisdiction } from '@/lib/queries';
import type { Jurisdiction } from '@/types/db';

export default function CountyDashboard() {
  const { countyId } = useLocalSearchParams<{ countyId: string }>();
  const router = useRouter();

  const [county, setCounty] = useState<Jurisdiction | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Archive');

  useEffect(() => {
    if (!countyId) return;

    getJurisdiction(countyId)
      .then(setCounty)
      .finally(() => setLoading(false));
  }, [countyId]);

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
          <Header activeItem="Archive" />
          <View style={styles.hero}>
            <ThemedText style={styles.eyebrow}>LOCAL GOVERNMENT</ThemedText>
            <ThemedText style={styles.title}>
              {county?.name ?? 'County'}
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Pick a branch of government to explore.
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Government Branches</ThemedText>

            <View style={styles.cards}>
              {BRANCHES.map((branch) => (
                <Pressable
                  key={branch.slug}
                  style={styles.card}
                  onPress={() => router.push(`/county/${countyId}/${branch.slug}`)}
                >
                  <View style={styles.cardMetaRow}>
                    <Landmark size={18} color="#0b2a6f" />
                    <ThemedText style={styles.cardMeta}>BRANCH</ThemedText>
                  </View>

                  <ThemedText style={styles.cardTitle}>{branch.label}</ThemedText>

                  <ThemedText style={styles.cardBlurb}>
                    {branch.blurb}
                  </ThemedText>

                  <View style={styles.cardFooter}>
                    <View style={styles.openButton}>
                      <ThemedText style={styles.openButtonText}>
                        Explore
                      </ThemedText>
                      <ArrowRight size={14} color="#ffffff" />
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

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

  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
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
    marginBottom: 8,
  },

  cardBlurb: {
    fontSize: 14,
    lineHeight: 22,
    color: '#6b7280',
  },

  cardFooter: {
    marginTop: 14,
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
});