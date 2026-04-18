import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { listCounties, listStates } from '@/lib/queries';
import type { Jurisdiction } from '@/types/db';

export default function HomeScreen() {
  const router = useRouter();

  const [states, setStates] = useState<Jurisdiction[]>([]);
  const [counties, setCounties] = useState<Jurisdiction[]>([]);
  const [state, setState] = useState<Jurisdiction | null>(null);
  const [county, setCounty] = useState<Jurisdiction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<'state' | 'county' | null>(null);

  useEffect(() => {
    listStates()
      .then((data) => {
        setStates(data);
        if (data.length === 1) setState(data[0]);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!state) {
      setCounties([]);
      setCounty(null);
      return;
    }
    listCounties(state.id)
      .then((data) => {
        setCounties(data);
        if (data.length === 1) setCounty(data[0]);
      })
      .catch((e) => setError(String(e)));
  }, [state]);

  const canGo = !!state && !!county;
  const goForward = () => {
    if (!county) return;
    router.push(`/county/${county.id}`);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Community App' }} />

      <ThemedText type="title" style={styles.title}>
        Find your local government
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        Pick a state and county to see upcoming meetings, agendas, and summaries.
      </ThemedText>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.pickers}>
          <SelectRow
            label="State"
            value={state?.name}
            onPress={() => setPicker('state')}
          />
          <SelectRow
            label="County"
            value={county?.name}
            onPress={() => state && setPicker('county')}
            disabled={!state}
          />
        </View>
      )}

      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

      <Pressable
        style={[styles.go, !canGo && styles.goDisabled]}
        onPress={goForward}
        disabled={!canGo}
      >
        <ThemedText style={styles.goText}>Go</ThemedText>
      </Pressable>

      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <ThemedView style={styles.sheet}>
            <ThemedText type="subtitle" style={styles.sheetTitle}>
              Select {picker === 'state' ? 'a state' : 'a county'}
            </ThemedText>
            <FlatList
              data={picker === 'state' ? states : counties}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    if (picker === 'state') {
                      setState(item);
                      setCounty(null);
                    } else {
                      setCounty(item);
                    }
                    setPicker(null);
                  }}
                >
                  <ThemedText>{item.name}</ThemedText>
                </Pressable>
              )}
            />
          </ThemedView>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

function SelectRow({
  label,
  value,
  onPress,
  disabled = false,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.selectRow, disabled && { opacity: 0.4 }]}
    >
      <ThemedText style={styles.selectLabel}>{label}</ThemedText>
      <ThemedText style={styles.selectValue}>{value ?? 'Select…'}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 40 },
  title: { marginTop: 20 },
  subtitle: { opacity: 0.7, marginTop: 6, marginBottom: 24 },
  pickers: { gap: 12, marginTop: 12 },
  selectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
  },
  selectLabel: { opacity: 0.7 },
  selectValue: { fontWeight: '600' },
  go: {
    marginTop: 32,
    padding: 16,
    backgroundColor: '#0a7ea4',
    borderRadius: 10,
    alignItems: 'center',
  },
  goDisabled: { opacity: 0.4 },
  goText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: 'tomato', marginTop: 16 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
  },
  sheetTitle: { marginBottom: 12 },
  sheetRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e6e6e6',
  },
});
