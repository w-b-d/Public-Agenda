import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

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

  const branchInfo = BRANCHES.find((b) => b.slug === branch);

  useEffect(() => {
    if (!countyId || !branch) return;
    listBodies(countyId, branch)
      .then(setBodies)
      .finally(() => setLoading(false));
  }, [countyId, branch]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: branchInfo?.label ?? 'Branch' }} />
      <ThemedText type="title" style={styles.title}>
        {branchInfo?.label ?? branch}
      </ThemedText>
      {branchInfo?.blurb ? (
        <ThemedText style={styles.subtitle}>{branchInfo.blurb}</ThemedText>
      ) : null}

      {loading ? (
        <ActivityIndicator />
      ) : bodies.length === 0 ? (
        <ThemedText style={styles.empty}>
          No bodies tracked here yet. More coming soon.
        </ThemedText>
      ) : (
        <View style={styles.cards}>
          {bodies.map((b) => (
            <Pressable
              key={b.id}
              style={styles.card}
              onPress={() => router.push(`/county/${countyId}/${branch}/${b.id}`)}
            >
              <ThemedText type="subtitle">{b.name}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { marginTop: 12 },
  subtitle: { opacity: 0.7, marginTop: 4, marginBottom: 20 },
  empty: { marginTop: 20, opacity: 0.6 },
  cards: { gap: 12 },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 12,
  },
});
