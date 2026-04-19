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

export async function getMeeting(id: string): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
