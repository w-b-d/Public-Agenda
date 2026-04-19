import { supabase } from './supabase';
import type { Body, BodyCategory, Jurisdiction, Meeting } from '@/types/db';

export async function listStates(): Promise<Jurisdiction[]> {
  const { data, error } = await supabase
    .from('jurisdictions')
    .select('*')
    .eq('type', 'state')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function listCounties(stateId: string): Promise<Jurisdiction[]> {
  const { data, error } = await supabase
    .from('jurisdictions')
    .select('*')
    .eq('type', 'county')
    .eq('parent_id', stateId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getJurisdiction(id: string): Promise<Jurisdiction | null> {
  const { data, error } = await supabase
    .from('jurisdictions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listBodies(
  jurisdictionId: string,
  category: BodyCategory | string,
): Promise<Body[]> {
  const { data, error } = await supabase
    .from('bodies')
    .select('*')
    .eq('jurisdiction_id', jurisdictionId)
    .eq('category', category)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getBody(id: string): Promise<Body | null> {
  const { data, error } = await supabase
    .from('bodies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMeetingsForBody(bodyId: string): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('body_id', bodyId)
    .order('start_time', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listBranchesForCounty(countyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('bodies')
    .select('category')
    .eq('jurisdiction_id', countyId)
    .order('category');

  if (error) throw error;

  const unique = Array.from(
    new Set(
      (data ?? [])
        .map((row: any) => row?.category)
        .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
    )
  );

  return unique;
}

/**
 * All bodies in a county, regardless of branch/category.
 */
export async function listBodiesForCounty(countyId: string): Promise<Body[]> {
  const { data, error } = await supabase
    .from('bodies')
    .select('*')
    .eq('jurisdiction_id', countyId)
    .order('name');

  if (error) throw error;
  return data ?? [];
}

/**
 * All meetings for a county by joining meetings -> bodies.
 * Requires meetings.body_id and bodies.id/jurisdiction_id.
 */
export async function listMeetingsForCounty(countyId: string): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select(`
      *,
      body:bodies!inner(
        id,
        name,
        category,
        jurisdiction_id
      )
    `)
    .eq('body.jurisdiction_id', countyId)
    .order('start_time', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((item: any) => ({
    ...item,
    body: item.body,
  }));
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
