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
  legistar_client: string | null;
  legistar_body_id: number | null;
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
  join_url: string | null;
  ai_summary: string | null;
  legistar_event_id: number | null;
  created_at: string;
  updated_at: string;
}
