import { Pressable, StyleSheet, View } from 'react-native';
import { Bell, Landmark } from 'lucide-react-native';
import { ThemedText } from '@/components/themed-text';

type HeaderProps = {
  activeItem?: 'Archive' | 'Calendar' | 'Search' | 'Registry';
  initials?: string;
};

const NAV_ITEMS: Array<HeaderProps['activeItem']> = [
  'Archive',
  'Calendar',
  'Search',
  'Registry',
];

export default function Header({
  activeItem = 'Calendar',
  initials = 'JD',
}: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.inner}>
        <View style={styles.brandRow}>
          <View style={styles.brandWrap}>
            <Landmark size={22} color="#0b2a6f" />
            <ThemedText style={styles.title}>Public Agenda</ThemedText>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.iconButton}>
              <Bell size={18} color="#6b7280" />
            </Pressable>

            <View style={styles.avatar}>
              <ThemedText style={styles.avatarText}>{initials}</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const isActive = item === activeItem;

            return (
              <Pressable
                key={item}
                style={[styles.navButton, isActive && styles.navButtonActive]}
              >
                <ThemedText
                  style={[styles.navText, isActive && styles.navTextActive]}
                >
                  {item}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(120,130,150,0.12)',
  },

  inner: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 14,
  },

  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },

  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0b2a6f',
    letterSpacing: -0.6,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eef2f7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0b2a6f',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.4,
  },

  nav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  navButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },

  navButtonActive: {
    backgroundColor: '#e8eef9',
  },

  navText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },

  navTextActive: {
    color: '#0b2a6f',
    fontWeight: '800',
  },
});