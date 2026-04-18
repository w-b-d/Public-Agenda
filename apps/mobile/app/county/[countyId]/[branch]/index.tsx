import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

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
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: branchInfo?.label ?? 'Branch' }} />
      <ScrollView contentContainerStyle={styles.container}>
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
          bodies.map((b) => (
            <Pressable
              key={b.id}
              style={styles.card}
              onPress={() => router.push(`/county/${countyId}/${branch}/${b.id}`)}
            >
              <ThemedText type="subtitle">{b.name}</ThemedText>
            </Pressable>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { marginTop: 12 },
  subtitle: { opacity: 0.7, marginTop: 4, marginBottom: 8 },
  empty: { marginTop: 20, opacity: 0.6 },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 12,
  },
});
