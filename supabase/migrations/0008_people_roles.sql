-- People serving on bodies, and the roles that link them.
--
-- Scope for this migration: structure only. We derive a person's primary
-- title from their highest-ranked current role at query time rather than
-- storing it on people, so there's no people.title column here.
--
-- external_ids is keyed by "{source}:{tenant}" so the same person can be
-- identified across multiple platforms within a jurisdiction as coverage
-- grows (e.g. {"legistar:monterey": "42", "civicclerk:salinas": "99"}).

create table people (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    normalized_name text not null,
    photo_url text,
    bio text,
    email text,
    phone text,
    official_url text,
    jurisdiction_id uuid references jurisdictions(id) not null,
    external_ids jsonb not null default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (jurisdiction_id, normalized_name)
);

create index idx_people_jurisdiction on people(jurisdiction_id);
create index idx_people_external_ids on people using gin (external_ids);

create table roles (
    id uuid primary key default gen_random_uuid(),
    person_id uuid references people(id) on delete cascade not null,
    body_id uuid references bodies(id) on delete cascade not null,
    title text,
    district text,
    start_date date,
    end_date date,
    source text not null,
    external_id text,
    unique (person_id, body_id, start_date)
);

create index idx_roles_body_active on roles(body_id) where end_date is null;
create index idx_roles_person on roles(person_id);

alter table people enable row level security;
alter table roles enable row level security;

create policy "Public read access" on people for select using (true);
create policy "Public read access" on roles for select using (true);
