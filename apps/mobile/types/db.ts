export type JurisdictionType = 'state' | 'county' | 'city' | 'district';

export interface Jurisdiction {
  id: string;
  name: string;
  state: string;
  type: JurisdictionType;
  parent_id: string | null;
  created_at: string;
}

export type BodyCategory =
  | 'county_government'
  | 'municipal_government'
  | 'special_district'
  | 'office';

export interface Body {
  id: string;
  jurisdiction_id: string;
  name: string;
  slug: string;
  category: BodyCategory;
  created_at: string;
}

export interface Meeting {
  id: string;
  body_id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  agenda_url: string | null;
  video_url: string | null;
  video_file_url: string | null;
  join_url: string | null;
  ai_summary: string | null;
  transcript: string | null;
  source: string;
  external_id: string;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  name: string;
  normalized_name: string;
  photo_url: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  official_url: string | null;
  jurisdiction_id: string;
  external_ids: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  person_id: string;
  body_id: string;
  title: string | null;
  district: string | null;
  start_date: string | null;
  end_date: string | null;
  source: string;
  external_id: string | null;
}

/** Lightweight body shape returned by joined person/meeting queries. */
export interface BodyRef {
  id: string;
  name: string;
  category: BodyCategory;
}

/** A body member: their role row plus the person row. */
export interface PersonWithRole {
  person: Person;
  role: Role;
}

/** A person's role with its body denormalized for display. */
export interface RoleWithBody extends Role {
  body: BodyRef;
}

/** Full person detail page payload. */
export interface PersonDetail {
  person: Person;
  current_roles: RoleWithBody[];
  past_roles: RoleWithBody[];
}

/** Meeting with its body denormalized for display. */
export interface MeetingWithBody extends Meeting {
  body: BodyRef;
}
