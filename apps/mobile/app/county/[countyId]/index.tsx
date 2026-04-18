import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

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

  useEffect(() => {
    if (!countyId) return;
    getJurisdiction(countyId)
      .then(setCounty)
      .finally(() => setLoading(false));
  }, [countyId]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: county?.name ?? 'County' }} />
      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          <ThemedText type="title" style={styles.title}>
            {county?.name}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Pick a branch of government to explore.
          </ThemedText>
          <View style={styles.cards}>
            {BRANCHES.map((b) => (
              <Pressable
                key={b.slug}
                style={styles.card}
                onPress={() => router.push(`/county/${countyId}/${b.slug}`)}
              >
                <ThemedText type="subtitle">{b.label}</ThemedText>
                <ThemedText style={styles.blurb}>{b.blurb}</ThemedText>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { marginTop: 12 },
  subtitle: { opacity: 0.7, marginTop: 4, marginBottom: 20 },
  cards: { gap: 12 },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 12,
  },
  blurb: { opacity: 0.8, marginTop: 6 },
});
