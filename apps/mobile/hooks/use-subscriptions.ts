import { useUser } from '@clerk/clerk-expo';
import { useCallback, useEffect, useState } from 'react';

import {
  listSubscribedMeetingIds,
  toggleSubscription,
} from '@/lib/queries/subscriptions';

/**
 * Derive a short, shareable display name for the "who else subscribed?"
 * UI. Prefers "First L." (with last-name initial), falls back to first
 * name only, then to the email local-part. Always returns a non-empty
 * string when a user object is present.
 */
function deriveDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  emailAddresses?: Array<{ emailAddress?: string | null }>;
} | null | undefined): string | null {
  if (!user) return null;
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first && last) return `${first} ${last[0]}.`;
  if (first) return first;
  const email = user.emailAddresses?.[0]?.emailAddress ?? '';
  const local = email.split('@')[0];
  return local || null;
}

/**
 * Hydrates the set of meeting IDs this user has starred, and exposes a
 * toggle that updates both Supabase and the local set optimistically.
 *
 * When signed out, `userId` is null and the set stays empty; `toggle`
 * returns false so callers can prompt sign-in instead of silently failing.
 */
export function useSubscriptions() {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? null;
  const displayName = deriveDisplayName(user);

  const [meetingIds, setMeetingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setMeetingIds(new Set());
      return;
    }
    let cancelled = false;
    setLoading(true);
    listSubscribedMeetingIds(userId)
      .then((s) => {
        if (!cancelled) setMeetingIds(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = useCallback(
    async (meetingId: string): Promise<boolean> => {
      if (!userId) return false;
      const willSubscribe = !meetingIds.has(meetingId);
      // Optimistic update.
      setMeetingIds((prev) => {
        const next = new Set(prev);
        if (willSubscribe) next.add(meetingId);
        else next.delete(meetingId);
        return next;
      });
      try {
        await toggleSubscription(userId, meetingId, willSubscribe, displayName);
        return true;
      } catch {
        // Revert on failure.
        setMeetingIds((prev) => {
          const next = new Set(prev);
          if (willSubscribe) next.delete(meetingId);
          else next.add(meetingId);
          return next;
        });
        return false;
      }
    },
    [userId, meetingIds, displayName],
  );

  return {
    userId,
    isSignedIn: !!userId,
    isLoaded,
    meetingIds,
    loading,
    toggle,
    isSubscribed: (meetingId: string) => meetingIds.has(meetingId),
  };
}
