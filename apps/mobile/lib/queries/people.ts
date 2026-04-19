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

function isRoleCurrent(role: { end_date: string | null }, today: string): boolean {
  return !role.end_date || role.end_date >= today;
}

/**
 * Members of a body — both current AND past. Each row carries `isCurrent`
 * so the UI can badge former members. Sort prioritizes current members,
 * then role rank, then alphabetical name.
 */
export async function listBodyMembers(bodyId: string): Promise<PersonWithRole[]> {
  const today = todayDateISO();
  const { data, error } = await supabase
    .from('roles')
    .select('*, person:people(*)')
    .eq('body_id', bodyId);
  if (error) throw error;

  const rows: PersonWithRole[] = (data ?? [])
    .filter((row: any) => row.person)
    .map((row: any) => {
      const { person, ...roleFields } = row;
      const role = roleFields as Role;
      return { person, role, isCurrent: isRoleCurrent(role, today) };
    });

  rows.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    const ra = roleRank(a.role.title);
    const rb = roleRank(b.role.title);
    if (ra !== rb) return ra - rb;
    return (a.person?.name ?? '').localeCompare(b.person?.name ?? '');
  });
  return rows;
}

/**
 * Members across multiple bodies — both current AND past. Used by the county
 * dashboard so the Officials block reflects everyone relevant to the selected
 * bodies' archive, not just people serving today.
 *
 * Deduped to one row per person. When a person has multiple roles within the
 * filter, we prefer their current role (if any), then highest-ranked title.
 */
export async function listMembersForBodies(
  bodyIds: string[],
): Promise<PersonWithRole[]> {
  if (bodyIds.length === 0) return [];

  const today = todayDateISO();
  const { data, error } = await supabase
    .from('roles')
    .select('*, person:people(*)')
    .in('body_id', bodyIds);
  if (error) throw error;

  // Dedupe by person_id. Preference: current role over past, then by rank.
  const best = new Map<string, PersonWithRole>();
  for (const raw of (data ?? []) as any[]) {
    if (!raw.person) continue;
    const { person, ...roleFields } = raw;
    const role = roleFields as Role;
    const candidate: PersonWithRole = {
      person,
      role,
      isCurrent: isRoleCurrent(role, today),
    };
    const existing = best.get(person.id);
    if (!existing) {
      best.set(person.id, candidate);
      continue;
    }
    // Prefer current over past.
    if (candidate.isCurrent && !existing.isCurrent) {
      best.set(person.id, candidate);
      continue;
    }
    if (!candidate.isCurrent && existing.isCurrent) continue;
    // Same currency status — break tie by role rank.
    if (roleRank(candidate.role.title) < roleRank(existing.role.title)) {
      best.set(person.id, candidate);
    }
  }

  const rows = Array.from(best.values());
  rows.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    const ra = roleRank(a.role.title);
    const rb = roleRank(b.role.title);
    if (ra !== rb) return ra - rb;
    return (a.person?.name ?? '').localeCompare(b.person?.name ?? '');
  });
  return rows;
}

/**
 * Role date-spans for the given people. A meeting should only be shown as
 * "this person's" if it falls inside one of their role spans on the same
 * body — otherwise a former supervisor surfaces upcoming meetings of a
 * body they're no longer on.
 *
 * Returns the raw (person_id, body_id, start_date, end_date) tuples for
 * the caller to intersect meeting-by-meeting.
 */
export interface PersonRoleSpan {
  person_id: string;
  body_id: string;
  start_date: string | null;
  end_date: string | null;
}

export async function listRolesForPeople(
  personIds: string[],
): Promise<PersonRoleSpan[]> {
  if (personIds.length === 0) return [];
  const { data, error } = await supabase
    .from('roles')
    .select('person_id, body_id, start_date, end_date')
    .in('person_id', personIds);
  if (error) throw error;
  return (data ?? []) as PersonRoleSpan[];
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
