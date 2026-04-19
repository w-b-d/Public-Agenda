import { StyleSheet, View, Pressable } from 'react-native';
import { Landmark } from 'lucide-react-native';
import { ThemedText } from '@/components/themed-text';

const ARCHIVE_LINKS = [
  'Meeting Minutes',
  'Voting Records',
  'Public Transcripts',
];

const RESOURCE_LINKS = [
  'Legal Notices',
  'City Charters',
  'Open Data Portal',
];

export default function Footer() {
  return (
    <View style={styles.footer}>
      <View style={styles.brandSection}>
        <View style={styles.brandRow}>
          <Landmark size={24} color="#0b2a6f" />
          <ThemedText style={styles.brandText}>Public Agenda</ThemedText>
        </View>

        <ThemedText style={styles.description}>
          The authoritative archive for civic transparency and legislative
          documentation. Ensuring public knowledge remains a public right.
        </ThemedText>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Archives</ThemedText>
        <View style={styles.linkList}>
          {ARCHIVE_LINKS.map((item) => (
            <Pressable key={item} style={styles.linkPressable}>
              <ThemedText style={styles.linkText}>{item}</ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Resources</ThemedText>
        <View style={styles.linkList}>
          {RESOURCE_LINKS.map((item) => (
            <Pressable key={item} style={styles.linkPressable}>
              <ThemedText style={styles.linkText}>{item}</ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Legal</ThemedText>
        <View style={styles.legalBlock}>
          <ThemedText style={styles.legalText}>
            © 2023 Department of Civic Transparency
          </ThemedText>
          <ThemedText style={styles.legalText}>
            Terms of Access • Privacy Standards
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    marginTop: 28,
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 4,
    backgroundColor: '#e9edf3',
    borderRadius: 18,
    gap: 24,
  },

  brandSection: {
    paddingHorizontal: 16,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },

  brandText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0b2a6f',
    letterSpacing: -0.6,
  },

  description: {
    fontSize: 14,
    lineHeight: 22,
    color: '#667085',
  },

  section: {
    paddingHorizontal: 16,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: '#111827',
    marginBottom: 14,
  },

  linkList: {
    gap: 10,
  },

  linkPressable: {
    paddingVertical: 2,
  },

  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#667085',
  },

  legalBlock: {
    gap: 6,
  },

  legalText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#667085',
    lineHeight: 20,
  },
});