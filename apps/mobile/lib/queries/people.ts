import { supabase } from '../supabase';
import type {
  MeetingWithBody,
  PersonDetail,
  PersonWithRole,
  Role,
  RoleWithBody,
} from '@/types/db';

/**
 * Role rank for sorting — Chair first, Vice Chair, President, then members.
 * Lower number = higher rank.
 */
function roleRank(title: string | null | undefined): number {
  if (!title) return 100;
  const t = title.toLowerCase();
  if (t.includes('vice chair') || t.includes('vice-chair')) return 20;
  if (t.includes('chair')) return 10;
  if (t.includes('president')) return 15;
  return 50;
}

function todayDateISO(): string {
  // YYYY-MM-DD — matches Postgres `date` comparisons.
  return new Date().toISOString().slice(0, 10);
}

/**
 * Current members of a body: roles whose end_date is null or today-or-later.
 * Sorted by role rank (Chair → Vice Chair → members alphabetically).
 */
export async function listBodyMembers(bodyId: string): Promise<PersonWithRole[]> {
  const today = todayDateISO();
  const { data, error } = await supabase
    .from('roles')
    .select('*, person:people(*)')
    .eq('body_id', bodyId)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (error) throw error;

  const rows: PersonWithRole[] = (data ?? [])
    .filter((row: any) => row.person) // drop orphans (shouldn't happen but defensive)
    .map((row: any) => {
      const { person, ...roleFields } = row;
      return { person, role: roleFields as Role };
    });

  rows.sort((a, b) => {
    const ra = roleRank(a.role.title);
    const rb = roleRank(b.role.title);
    if (ra !== rb) return ra - rb;
    return (a.person?.name ?? '').localeCompare(b.person?.name ?? '');
  });
  return rows;
}

/**
 * Current members across multiple bodies. Used by the county dashboard so
 * the Members list responds to the same body-filter as the calendar.
 *
 * Returns deduplicated (person, role) pairs — if a person serves on several
 * bodies in the filter, we keep only their highest-ranked role so each
 * person appears once. The role's `body_id` still identifies which body we
 * kept, so the caller can show "serves on N bodies" if it wants.
 */
export async function listMembersForBodies(
  bodyIds: string[],
): Promise<PersonWithRole[]> {
  if (bodyIds.length === 0) return [];

  const today = todayDateISO();
  const { data, error } = await supabase
    .from('roles')
    .select('*, person:people(*)')
    .in('body_id', bodyIds)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (error) throw error;

  // Dedupe by person_id, keeping highest-ranked role.
  const best = new Map<string, PersonWithRole>();
  for (const raw of (data ?? []) as any[]) {
    if (!raw.person) continue;
    const { person, ...roleFields } = raw;
    const role = roleFields as Role;
    const existing = best.get(person.id);
    if (!existing || roleRank(role.title) < roleRank(existing.role.title)) {
      best.set(person.id, { person, role });
    }
  }

  const rows = Array.from(best.values());
  rows.sort((a, b) => {
    const ra = roleRank(a.role.title);
    const rb = roleRank(b.role.title);
    if (ra !== rb) return ra - rb;
    return (a.person?.name ?? '').localeCompare(b.person?.name ?? '');
  });
  return rows;
}

/**
 * Person + all their roles (current + past), each joined with body name/category.
 */
export async function getPerson(personId: string): Promise<PersonDetail | null> {
  const { data: person, error: personErr } = await supabase
    .from('people')
    .select('*')
    .eq('id', personId)
    .maybeSingle();
  if (personErr) throw personErr;
  if (!person) return null;

  const { data: roles, error: rolesErr } = await supabase
    .from('roles')
    .select('*, body:bodies(id, name, category)')
    .eq('person_id', personId);
  if (rolesErr) throw rolesErr;

  const today = todayDateISO();
  const current: RoleWithBody[] = [];
  const past: RoleWithBody[] = [];
  for (const r of (roles ?? []) as RoleWithBody[]) {
    const isCurrent = !r.end_date || r.end_date >= today;
    (isCurrent ? current : past).push(r);
  }
  current.sort((a, b) => roleRank(a.title) - roleRank(b.title));
  past.sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''));
  return { person, current_roles: current, past_roles: past };
}

/**
 * Meetings of the bodies this person is/was a member of.
 *
 * NOTE on framing: this returns meetings of bodies the person serves on,
 * NOT meetings they actually attended. Callers should label accordingly.
 */
export async function listPersonMeetings(
  personId: string,
  when: 'upcoming' | 'past',
  limit: number,
): Promise<MeetingWithBody[]> {
  const { data: roleRows, error: roleErr } = await supabase
    .from('roles')
    .select('body_id')
    .eq('person_id', personId);
  if (roleErr) throw roleErr;

  const bodyIds = Array.from(
    new Set((roleRows ?? []).map((r: any) => r.body_id).filter(Boolean)),
  );
  if (bodyIds.length === 0) return [];

  const nowIso = new Date().toISOString();
  let q = supabase
    .from('meetings')
    .select('*, body:bodies(id, name, category)')
    .in('body_id', bodyIds);
  if (when === 'upcoming') {
    q = q.gte('start_time', nowIso).order('start_time', { ascending: true });
  } else {
    q = q.lt('start_time', nowIso).order('start_time', { ascending: false });
  }
  const { data, error } = await q.limit(limit);
  if (error) throw error;
  return (data ?? []) as MeetingWithBody[];
}
