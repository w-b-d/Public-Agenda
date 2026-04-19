import { Pressable, StyleSheet, View } from 'react-native';
import {
  Archive,
  Calendar as CalendarIcon,
  Search,
  UserCheck,
} from 'lucide-react-native';
import { ThemedText } from '@/components/themed-text';

type BottomNavTab = 'Archive' | 'Calendar' | 'Search' | 'Registry';

type BottomNavProps = {
  activeTab?: BottomNavTab;
  onChangeTab?: (tab: BottomNavTab) => void;
};

const navItems: Array<{
  label: BottomNavTab;
  icon: typeof Archive;
}> = [
  { icon: Archive, label: 'Archive' },
  { icon: CalendarIcon, label: 'Calendar' },
  { icon: Search, label: 'Search' },
  { icon: UserCheck, label: 'Registry' },
];

export default function BottomNav({
  activeTab = 'Calendar',
  onChangeTab,
}: BottomNavProps) {
  return (
    <View style={styles.nav}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.label === activeTab;

        return (
          <Pressable
            key={item.label}
            onPress={() => onChangeTab?.(item.label)}
            style={[styles.navButton, active && styles.navButtonActive]}
          >
            <Icon
              size={20}
              color={active ? '#0b2a6f' : '#6b7280'}
              strokeWidth={2.2}
            />
            <ThemedText
              style={[styles.navLabel, active && styles.navLabelActive]}
            >
              {item.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: '#f6f7fb',
    borderTopWidth: 1,
    borderTopColor: 'rgba(120,130,150,0.12)',
    zIndex: 50,
  },

  navButton: {
    minWidth: 74,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  navButtonActive: {
    backgroundColor: '#e9edf3',
  },

  navLabel: {
    marginTop: 4,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '900',
    color: '#6b7280',
  },

  navLabelActive: {
    color: '#0b2a6f',
  },
});