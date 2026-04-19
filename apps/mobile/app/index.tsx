import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  ChevronDown,
  History,
  CalendarDays,
  Search,
  X,
} from 'lucide-react-native';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { listCounties, listStates } from '@/lib/queries';
import type { Jurisdiction } from '@/types/db';

export default function HomeScreen() {
  const router = useRouter();

  const [states, setStates] = useState<Jurisdiction[]>([]);
  const [counties, setCounties] = useState<Jurisdiction[]>([]);
  const [selectedState, setSelectedState] = useState<Jurisdiction | null>(null);
  const [selectedCounty, setSelectedCounty] = useState<Jurisdiction | null>(null);

  const [loading, setLoading] = useState(true);
  const [countyLoading, setCountyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<'state' | null>(null);
  const [activeTab, setActiveTab] = useState('Archive');

  const [countyQuery, setCountyQuery] = useState('');
  const [showCountySuggestions, setShowCountySuggestions] = useState(false);
  const [showFullCountyList, setShowFullCountyList] = useState(false);

  useEffect(() => {
    listStates()
      .then((data) => {
        const safeStates = (data ?? []).filter(
          (item): item is Jurisdiction =>
            item != null &&
            typeof item.id === 'string' &&
            typeof item.name === 'string'
        );

        setStates(safeStates);

        if (safeStates.length === 1) {
          setSelectedState(safeStates[0]);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedState) {
      setCounties([]);
      setSelectedCounty(null);
      setCountyQuery('');
      setShowCountySuggestions(false);
      setShowFullCountyList(false);
      return;
    }

    setCountyLoading(true);

    listCounties(selectedState.id)
      .then((data) => {
        const safeCounties = (data ?? []).filter(
          (item): item is Jurisdiction =>
            item != null &&
            typeof item.id === 'string' &&
            typeof item.name === 'string'
        );

        setCounties(safeCounties);

        if (safeCounties.length === 1) {
          setSelectedCounty(safeCounties[0]);
          setCountyQuery(safeCounties[0].name);
        } else {
          setSelectedCounty(null);
          setCountyQuery('');
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCountyLoading(false));
  }, [selectedState]);

  const normalizedCountyQuery = countyQuery.trim().toLowerCase();

  const filteredCounties = useMemo(() => {
    if (!normalizedCountyQuery) return counties;
    return counties.filter((county) =>
      county.name.toLowerCase().includes(normalizedCountyQuery)
    );
  }, [counties, normalizedCountyQuery]);

  const countySuggestions = useMemo(() => {
    if (!normalizedCountyQuery) return [];
    return filteredCounties.slice(0, 6);
  }, [filteredCounties, normalizedCountyQuery]);

  const canGo = !!selectedState && !!selectedCounty;

  const handleSelectCounty = (county: Jurisdiction) => {
    setSelectedCounty(county);
    setCountyQuery(county.name);
    setShowCountySuggestions(false);
    setShowFullCountyList(false);
  };

  const handleCountyInputChange = (text: string) => {
    setCountyQuery(text);
    setShowCountySuggestions(true);
    setShowFullCountyList(false);

    if (!text.trim()) {
      setSelectedCounty(null);
      return;
    }

    const exactMatch = counties.find(
      (county) => county.name.toLowerCase() === text.trim().toLowerCase()
    );

    setSelectedCounty(exactMatch ?? null);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Header activeItem="Archive" />

        <View style={styles.hero}>
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>
              CIVIC TRANSPARENCY ENGINE
            </ThemedText>
          </View>

          <ThemedText style={styles.title}>
            The{'\n'}Sovereign{'\n'}Archive
          </ThemedText>

          <ThemedText style={styles.subtitle}>
            Access immutable public records and legislative agendas with prestige
            clarity.
          </ThemedText>
        </View>

        <ThemedView style={styles.card}>
          <View style={styles.cardWatermark}>
            <CourthouseMark />
          </View>

          <ThemedText style={styles.cardLabel}>NAVIGATION SELECTION</ThemedText>

          {loading ? (
            <ActivityIndicator style={styles.loader} />
          ) : (
            <View style={styles.selectGroup}>
              <SelectRow
                label="Select State"
                value={selectedState?.name}
                placeholder="Choose jurisdiction..."
                onPress={() => setPicker('state')}
              />

              <View style={styles.selectBlock}>
                <ThemedText style={styles.selectLabel}>Select County</ThemedText>

                <View
                  style={[
                    styles.searchSelectBox,
                    (!selectedState || countyLoading) && styles.selectRowDisabled,
                  ]}
                >
                  <Search size={16} color="#7b8794" />

                  <TextInput
                    value={countyQuery}
                    onChangeText={handleCountyInputChange}
                    onFocus={() => {
                      if (!selectedState || countyLoading) return;
                      setShowCountySuggestions(true);
                    }}
                    placeholder={
                      !selectedState
                        ? 'Choose state first...'
                        : countyLoading
                        ? 'Loading...'
                        : 'Search counties...'
                    }
                    placeholderTextColor="#798291"
                    editable={!!selectedState && !countyLoading}
                    style={styles.searchSelectInput}
                  />

                  {countyQuery ? (
                    <Pressable
                      onPress={() => {
                        setCountyQuery('');
                        setSelectedCounty(null);
                        setShowCountySuggestions(false);
                        setShowFullCountyList(false);
                      }}
                    >
                      <X size={16} color="#7b8794" />
                    </Pressable>
                  ) : null}
                </View>

                {showCountySuggestions &&
                countySuggestions.length > 0 &&
                selectedState &&
                !countyLoading ? (
                  <View style={styles.inlineSuggestionsCard}>
                    {countySuggestions.map((county, index) => (
                      <Pressable
                        key={county.id}
                        style={[
                          styles.inlineSuggestionRow,
                          index !== countySuggestions.length - 1 &&
                            styles.inlineSuggestionRowBorder,
                        ]}
                        onPress={() => handleSelectCounty(county)}
                      >
                        <View style={styles.inlineSuggestionLeft}>
                          <Search size={14} color="#7c8798" />
                          <ThemedText style={styles.inlineSuggestionLabel}>
                            {county.name}
                          </ThemedText>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {selectedState && !countyLoading ? (
                  <Pressable
                    onPress={() => {
                      setShowFullCountyList((prev) => !prev);
                      setShowCountySuggestions(false);
                    }}
                    style={styles.fullListToggle}
                  >
                    <ThemedText style={styles.fullListToggleText}>
                      {showFullCountyList
                        ? 'Hide full county list'
                        : 'Show full county list'}
                    </ThemedText>
                    <ChevronDown
                      size={16}
                      color="#0b2a6f"
                      style={showFullCountyList ? styles.chevronUp : undefined}
                    />
                  </Pressable>
                ) : null}

                {showFullCountyList && selectedState && !countyLoading ? (
                  <View style={styles.fullListCard}>
                    <ScrollView
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator
                    >
                      {filteredCounties.length > 0 ? (
                        filteredCounties.map((county, index) => (
                          <Pressable
                            key={county.id}
                            style={[
                              styles.fullListRow,
                              index !== filteredCounties.length - 1 &&
                                styles.fullListRowBorder,
                            ]}
                            onPress={() => handleSelectCounty(county)}
                          >
                            <ThemedText style={styles.fullListRowText}>
                              {county.name}
                            </ThemedText>
                          </Pressable>
                        ))
                      ) : (
                        <ThemedText style={styles.emptyText}>
                          No matching counties.
                        </ThemedText>
                      )}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

          <Pressable
            style={[styles.button, !canGo && styles.buttonDisabled]}
            disabled={!canGo}
            onPress={() => {
              if (!selectedCounty) return;
              router.push(`/county/${selectedCounty.id}`);
            }}
          >
            <ThemedText style={styles.buttonText}>Enter Archive</ThemedText>
          </Pressable>
        </ThemedView>

        <View style={styles.quickLinks}>
          <View style={styles.quickCard}>
            <History size={22} color="#1f3a5f" />
            <ThemedText style={styles.quickTitle}>Recent Updates</ThemedText>
            <ThemedText style={styles.quickText}>
              Last accessed documents from your region.
            </ThemedText>
          </View>

          <View style={styles.quickCard}>
            <CalendarDays size={22} color="#1f3a5f" />
            <ThemedText style={styles.quickTitle}>Upcoming</ThemedText>
            <ThemedText style={styles.quickText}>
              Next scheduled committee hearings.
            </ThemedText>
          </View>
        </View>

        <Footer />
      </ScrollView>

      <BottomNav activeTab="Archive" onChangeTab={setActiveTab as any} />

      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <View style={styles.sheet}>
            <ThemedText style={styles.sheetTitle}>Select State</ThemedText>

            <FlatList
              data={states.filter(
                (item): item is Jurisdiction =>
                  item != null &&
                  typeof item.id === 'string' &&
                  typeof item.name === 'string'
              )}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    setSelectedState(item);
                    setSelectedCounty(null);
                    setCountyQuery('');
                    setShowCountySuggestions(false);
                    setShowFullCountyList(false);
                    setPicker(null);
                  }}
                >
                  <ThemedText style={styles.sheetRowText}>{item.name}</ThemedText>
                </Pressable>
              )}
              ListEmptyComponent={
                <ThemedText style={styles.emptyText}>
                  No options available.
                </ThemedText>
              }
            />
          </View>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

function SelectRow({
  label,
  value,
  placeholder,
  onPress,
  disabled = false,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.selectBlock}>
      <ThemedText style={styles.selectLabel}>{label}</ThemedText>

      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.selectRow, disabled && styles.selectRowDisabled]}
      >
        <ThemedText
          style={[styles.selectValue, !value && styles.selectPlaceholder]}
          numberOfLines={1}
        >
          {value ?? placeholder}
        </ThemedText>
        <ChevronDown size={18} color="#7b8794" />
      </Pressable>
    </View>
  );
}

function CourthouseMark() {
  const stroke = '#d9dce3';

  return (
    <Svg width={72} height={58} viewBox="0 0 136 110" fill="none">
      <Path
        d="M20 34L68 8L116 34"
        stroke={stroke}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="68" cy="22" r="8" stroke={stroke} strokeWidth={5} />
      <Rect x="20" y="34" width="96" height="8" stroke={stroke} strokeWidth={5} />
      <Rect x="28" y="44" width="80" height="8" stroke={stroke} strokeWidth={5} />
      <Rect x="32" y="56" width="12" height="28" stroke={stroke} strokeWidth={5} />
      <Rect x="54" y="56" width="12" height="28" stroke={stroke} strokeWidth={5} />
      <Rect x="76" y="56" width="12" height="28" stroke={stroke} strokeWidth={5} />
      <Rect x="98" y="56" width="12" height="28" stroke={stroke} strokeWidth={5} />
      <Rect x="58" y="70" width="20" height="14" stroke={stroke} strokeWidth={5} />
      <Line x1="22" y1="90" x2="114" y2="90" stroke={stroke} strokeWidth={6} />
      <Line x1="16" y1="100" x2="120" y2="100" stroke={stroke} strokeWidth={6} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },

  content: {
    paddingBottom: 120,
  },

  hero: {
    alignItems: 'center',
    marginBottom: 18,
    paddingHorizontal: 20,
    marginTop: 8,
  },

  badge: {
    backgroundColor: '#dceaf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 2,
    marginBottom: 16,
  },

  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6b8aa3',
    letterSpacing: 1,
  },

  title: {
    fontSize: 40,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 40,
    color: '#062b6f',
    letterSpacing: -1,
  },

  subtitle: {
    textAlign: 'center',
    marginTop: 14,
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: 10,
    color: '#6f7685',
    fontWeight: '600',
  },

  card: {
    backgroundColor: '#fbfbfc',
    padding: 20,
    borderRadius: 12,
    marginTop: 18,
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },

  cardWatermark: {
    position: 'absolute',
    top: 18,
    right: 16,
    opacity: 0.85,
  },

  cardLabel: {
    fontSize: 10,
    marginBottom: 18,
    color: '#7d8b9d',
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  loader: {
    marginVertical: 20,
  },

  selectGroup: {
    gap: 16,
  },

  selectBlock: {
    gap: 8,
  },

  selectLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5d6f88',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  selectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 14,
    backgroundColor: '#f1f2f5',
  },

  selectRowDisabled: {
    opacity: 0.45,
  },

  selectValue: {
    fontSize: 16,
    color: '#4a5565',
    flex: 1,
    marginRight: 12,
    fontWeight: '600',
  },

  selectPlaceholder: {
    color: '#798291',
  },

  searchSelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#f1f2f5',
  },

  searchSelectInput: {
    flex: 1,
    fontSize: 16,
    color: '#4a5565',
    fontWeight: '600',
    paddingVertical: 0,
  },

  inlineSuggestionsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
    overflow: 'hidden',
    maxHeight: 240,
  },

  inlineSuggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 52,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },

  inlineSuggestionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(120,130,150,0.10)',
  },

  inlineSuggestionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  inlineSuggestionLabel: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },

  fullListToggle: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },

  fullListToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0b2a6f',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  chevronUp: {
    transform: [{ rotate: '180deg' }],
  },

  fullListCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,130,150,0.10)',
    maxHeight: 260,
    overflow: 'hidden',
  },

  fullListRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
  },

  fullListRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(120,130,150,0.10)',
  },

  fullListRowText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },

  button: {
    marginTop: 24,
    paddingVertical: 15,
    backgroundColor: '#062b6f',
    alignItems: 'center',
  },

  buttonDisabled: {
    opacity: 0.4,
  },

  buttonText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
  },

  error: {
    color: 'red',
    marginTop: 10,
  },

  quickLinks: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    marginHorizontal: 20,
  },

  quickCard: {
    flex: 1,
    backgroundColor: '#eef2f7',
    padding: 16,
    borderRadius: 10,
    gap: 6,
  },

  quickTitle: {
    fontWeight: '700',
    color: '#1f3a5f',
  },

  quickText: {
    fontSize: 12,
    opacity: 0.6,
    lineHeight: 18,
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },

  sheet: {
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
  },

  sheetTitle: {
    fontSize: 18,
    marginBottom: 10,
    fontWeight: '700',
    color: '#1f3a5f',
  },

  sheetRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },

  sheetRowText: {
    fontSize: 16,
    color: '#111827',
  },

  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    paddingVertical: 20,
  },
});