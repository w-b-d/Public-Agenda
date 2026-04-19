import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Bell, Landmark, ChevronDown } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { listBranchesForCounty } from '@/lib/queries';
import { BRANCHES } from '@/constants/branches';

type HeaderProps = {
    activeItem?: 'Archive' | 'Calendar' | 'Select' | 'Registry';
    initials?: string;
    countyId?: string;
};

type BranchOption = {
    slug: string;
    label: string;
};

const NAV_ITEMS: Array<HeaderProps['activeItem']> = [
    'Archive',
    'Calendar',
    'Select',
    'Registry',
];

export default function Header({
    activeItem = 'Calendar',
    initials = 'JD',
    countyId,
}: HeaderProps) {
    const router = useRouter();

    const [menuOpen, setMenuOpen] = useState(false);
    const [branchSlugs, setBranchSlugs] = useState<string[]>([]);

    useEffect(() => {
        if (!countyId) {
            setBranchSlugs([]);
            return;
        }

        listBranchesForCounty(countyId)
            .then(setBranchSlugs)
            .catch(() => setBranchSlugs([]));
    }, [countyId]);

    const branchOptions = useMemo<BranchOption[]>(() => {
        return branchSlugs.map((slug) => {
            const match = BRANCHES.find((b) => b.slug === slug);
            return {
                slug,
                label: match?.label ?? slug,
            };
        });
    }, [branchSlugs]);

    return (
        <>
            <View style={styles.header}>
                <View style={styles.inner}>
                    <View style={styles.brandRow}>
                        <Pressable
                            style={styles.brandWrap}
                            onPress={() => router.replace('/')}
                        >
                            <Landmark size={22} color="#0b2a6f" />
                            <ThemedText style={styles.title}>Public Agenda</ThemedText>
                        </Pressable>

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

                            if (item === 'Select') {
                                return (
                                    <Pressable
                                        key={item}
                                        style={[styles.navButton, isActive && styles.navButtonActive]}
                                        onPress={() => setMenuOpen(true)}
                                    >
                                        <View style={styles.selectNavInner}>
                                            <ThemedText
                                                style={[styles.navText, isActive && styles.navTextActive]}
                                            >
                                                Select
                                            </ThemedText>
                                            <ChevronDown
                                                size={14}
                                                color={isActive ? '#0b2a6f' : '#6b7280'}
                                            />
                                        </View>
                                    </Pressable>
                                );
                            }

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

            <Modal
                visible={menuOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuOpen(false)}
            >
                <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
                    <View style={styles.menuCard}>
                        <ThemedText style={styles.menuTitle}>Select Branch</ThemedText>

                        {branchOptions.length === 0 ? (
                            <ThemedText style={styles.menuEmpty}>
                                No branches available.
                            </ThemedText>
                        ) : (
                            branchOptions.map((branch, index) => (
                                <Pressable
                                    key={branch.slug}
                                    style={[
                                        styles.menuRow,
                                        index !== branchOptions.length - 1 && styles.menuRowBorder,
                                    ]}
                                    onPress={() => {
                                        setMenuOpen(false);
                                        if (!countyId) return;
                                        router.push(`/county/${countyId}/${branch.slug}`);
                                    }}
                                >
                                    <ThemedText style={styles.menuRowText}>
                                        {branch.label}
                                    </ThemedText>
                                </Pressable>
                            ))
                        )}
                    </View>
                </Pressable>
            </Modal>
        </>
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

    selectNavInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },

    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.28)',
        justifyContent: 'flex-start',
        paddingTop: 118,
        paddingHorizontal: 20,
    },

    menuCard: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(120,130,150,0.12)',
        overflow: 'hidden',
    },

    menuTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#0b2a6f',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: '#f5f7fb',
    },

    menuEmpty: {
        paddingHorizontal: 16,
        paddingVertical: 16,
        color: '#6b7280',
    },

    menuRow: {
        paddingHorizontal: 16,
        paddingVertical: 14,
    },

    menuRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(120,130,150,0.10)',
    },

    menuRowText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111827',
    },
});