import { supabase } from '../supabase';
import type { MeetingWithBody } from '@/types/db';

export interface Subscription {
  id: string;
  user_id: string;
  meeting_id: string;
  display_name: string | null;
  created_at: string;
}

export interface MeetingSubscriber {
  user_id: string;
  display_name: string | null;
}

/**
 * A meeting the user starred, with the full subscriber list attached so
 * the dashboard can show "who else subscribed" without a second round
 * trip. `subscribers` includes the viewing user; callers filter them out
 * when rendering "others."
 */
export interface SubscribedMeetingWithPeers extends MeetingWithBody {
  subscribers: MeetingSubscriber[];
}

/**
 * IDs of meetings this user has starred. Cheap query used on mount to
 * hydrate the Chronicle star state.
 */
export async function listSubscribedMeetingIds(
  userId: string,
): Promise<Set<string>> {
  if (!userId) return new Set();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('meeting_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map((r: any) => r.meeting_id));
}

/**
 * Star or un-star a meeting. Idempotent — no-ops if already in the
 * requested state (the unique constraint prevents dupes on insert;
 * delete is always safe). On subscribe we denormalize the user's
 * display name onto the row for the "who else subscribed" UI.
 */
export async function toggleSubscription(
  userId: string,
  meetingId: string,
  subscribe: boolean,
  displayName?: string | null,
): Promise<void> {
  if (!userId || !meetingId) return;
  if (subscribe) {
    const { error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        meeting_id: meetingId,
        display_name: displayName ?? null,
      });
    // Swallow unique-violation — user clicked twice or we're racing.
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('meeting_id', meetingId);
    if (error) throw error;
  }
}

/**
 * Upcoming meetings this user is subscribed to, joined with body info
 * AND the full subscriber list for each meeting. Past meetings are
 * excluded because the dashboard is about "what's coming up for me."
 *
 * Two-step fetch: first find the user's upcoming subscribed meeting
 * IDs, then grab every subscription row on those meetings. The second
 * query is bounded by the first result and stays cheap.
 */
export async function listUpcomingSubscribedMeetings(
  userId: string,
): Promise<SubscribedMeetingWithPeers[]> {
  if (!userId) return [];
  const nowIso = new Date().toISOString();

  // 1. The user's own subscriptions, joined with meeting + body.
  const { data: mine, error: mineErr } = await supabase
    .from('subscriptions')
    .select('meeting:meetings(*, body:bodies(id, name, category))')
    .eq('user_id', userId);
  if (mineErr) throw mineErr;

  const upcoming = (mine ?? [])
    .map((r: any) => r.meeting as MeetingWithBody)
    .filter((m): m is MeetingWithBody => !!m && m.start_time >= nowIso)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (upcoming.length === 0) return [];

  // 2. Every subscriber for those meetings (including the viewer — we
  // leave self in so the caller can show total count honestly; filter
  // at render time for "N others" strings).
  const meetingIds = upcoming.map((m) => m.id);
  const { data: peers, error: peersErr } = await supabase
    .from('subscriptions')
    .select('meeting_id, user_id, display_name')
    .in('meeting_id', meetingIds);
  if (peersErr) throw peersErr;

  const byMeeting = new Map<string, MeetingSubscriber[]>();
  for (const p of (peers ?? []) as any[]) {
    const existing = byMeeting.get(p.meeting_id) ?? [];
    existing.push({ user_id: p.user_id, display_name: p.display_name });
    byMeeting.set(p.meeting_id, existing);
  }

  return upcoming.map((m) => ({
    ...m,
    subscribers: byMeeting.get(m.id) ?? [],
  }));
}
