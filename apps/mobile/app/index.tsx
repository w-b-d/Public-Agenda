import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  User,
  ChevronDown,
  History,
  CalendarDays,
  Home,
  Calendar,
  Search,
} from 'lucide-react-native';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';

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
  const [picker, setPicker] = useState<'state' | 'county' | null>(null);
  const [activeTab, setActiveTab] = useState('home');

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
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCountyLoading(false));
  }, [selectedState]);

  const canGo = !!selectedState && !!selectedCounty;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Public Agenda</ThemedText>
        <Pressable style={styles.headerIconButton}>
          <User size={22} color="#6b7280" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
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

              <SelectRow
                label="Select County"
                value={selectedCounty?.name}
                placeholder={
                  !selectedState
                    ? 'Choose state first...'
                    : countyLoading
                    ? 'Loading...'
                    : 'Choose locality...'
                }
                onPress={() =>
                  selectedState && !countyLoading && setPicker('county')
                }
                disabled={!selectedState || countyLoading}
              />
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
      </ScrollView>

      <View style={styles.nav}>
        <NavButton
          icon={<Home size={20} color={activeTab === 'home' ? '#1f3a5f' : '#6b7280'} />}
          label="Home"
          active={activeTab === 'home'}
          onPress={() => setActiveTab('home')}
        />
        <NavButton
          icon={
            <Calendar
              size={20}
              color={activeTab === 'calendar' ? '#1f3a5f' : '#6b7280'}
            />
          }
          label="Calendar"
          active={activeTab === 'calendar'}
          onPress={() => setActiveTab('calendar')}
        />
        <NavButton
          icon={<Search size={20} color={activeTab === 'search' ? '#1f3a5f' : '#6b7280'} />}
          label="Search"
          active={activeTab === 'search'}
          onPress={() => setActiveTab('search')}
        />
        <NavButton
          icon={<User size={20} color={activeTab === 'profile' ? '#1f3a5f' : '#6b7280'} />}
          label="Profile"
          active={activeTab === 'profile'}
          onPress={() => setActiveTab('profile')}
        />
      </View>

      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <View style={styles.sheet}>
            <ThemedText style={styles.sheetTitle}>
              Select {picker === 'state' ? 'State' : 'County'}
            </ThemedText>

            <FlatList
              data={(picker === 'state' ? states : counties).filter(
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
                    if (picker === 'state') {
                      setSelectedState(item);
                      setSelectedCounty(null);
                    } else {
                      setSelectedCounty(item);
                    }
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

function NavButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.navButton}>
      {icon}
      <ThemedText style={[styles.navLabel, active && styles.navLabelActive]}>
        {label}
      </ThemedText>
      {active ? <View style={styles.navDot} /> : null}
    </Pressable>
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

  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#132f66',
  },

  headerIconButton: {
    padding: 4,
  },

  content: {
    padding: 20,
    paddingBottom: 120,
  },

  hero: {
    alignItems: 'center',
    marginBottom: 18,
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
    borderRadius: 0,
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

  button: {
    marginTop: 24,
    paddingVertical: 15,
    backgroundColor: '#062b6f',
    borderRadius: 0,
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

  nav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 78,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },

  navButton: {
    alignItems: 'center',
    gap: 4,
    minWidth: 64,
  },

  navLabel: {
    fontSize: 10,
    opacity: 0.5,
    fontWeight: '700',
    color: '#6b7280',
  },

  navLabelActive: {
    opacity: 1,
    color: '#1f3a5f',
  },

  navDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#1f3a5f',
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