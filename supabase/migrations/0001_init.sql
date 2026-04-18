-- Initial schema for community-app
-- jurisdictions -> bodies -> meetings

create extension if not exists "pgcrypto";

-- Jurisdictions: a state, county, city, or special district.
create table jurisdictions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text not null,
  type text not null check (type in ('state', 'county', 'city', 'district')),
  parent_id uuid references jurisdictions(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Bodies: a governing entity within a jurisdiction.
-- Category groups bodies into the three top-level branches shown in the UI.
create table bodies (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid not null references jurisdictions(id) on delete cascade,
  name text not null,
  slug text not null,
  category text not null check (category in (
    'county_government',
    'municipal_government',
    'special_district',
    'office'
  )),
  legistar_client text,
  legistar_body_id integer,
  created_at timestamptz not null default now(),
  unique (jurisdiction_id, slug)
);

-- Meetings: a single scheduled or past meeting of a body.
create table meetings (
  id uuid primary key default gen_random_uuid(),
  body_id uuid not null references bodies(id) on delete cascade,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz,
  location text,
  agenda_url text,
  video_url text,
  join_url text,
  ai_summary text,
  legistar_event_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (body_id, legistar_event_id)
);

create index meetings_body_id_start_time_idx on meetings (body_id, start_time desc);
create index meetings_start_time_idx on meetings (start_time desc);

-- Row-level security: the mobile app reads via the publishable key and
-- should only be able to SELECT. The scraper uses the secret key, which
-- bypasses RLS, so writes are unaffected.
alter table jurisdictions enable row level security;
alter table bodies enable row level security;
alter table meetings enable row level security;

create policy "Public read access" on jurisdictions for select using (true);
create policy "Public read access" on bodies for select using (true);
create policy "Public read access" on meetings for select using (true);

-- Seed: California, Monterey County, Board of Supervisors.
insert into jurisdictions (id, name, state, type, parent_id) values
  ('00000000-0000-0000-0000-000000000001', 'California', 'CA', 'state', null),
  ('00000000-0000-0000-0000-000000000002', 'Monterey County', 'CA', 'county', '00000000-0000-0000-0000-000000000001');

insert into bodies (jurisdiction_id, name, slug, category, legistar_client) values
  ('00000000-0000-0000-0000-000000000002', 'Board of Supervisors', 'board-of-supervisors', 'county_government', 'monterey');
