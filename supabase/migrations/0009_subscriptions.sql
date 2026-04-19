-- Meeting subscriptions ("stars" in the UI). Identity comes from Clerk —
-- we don't run Clerk JWTs through Supabase RLS for this pass, so the table
-- is open-read / open-write and the client filters by user_id. Fine for a
-- hackathon demo; to harden, swap RLS to check `auth.jwt() ->> 'sub'`
-- against user_id once Clerk-Supabase JWT integration is set up.

create table subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,              -- Clerk user id (e.g. user_2abc...)
    meeting_id uuid references meetings(id) on delete cascade not null,
    created_at timestamptz default now(),
    unique (user_id, meeting_id)
);

create index idx_subscriptions_user on subscriptions(user_id);
create index idx_subscriptions_meeting on subscriptions(meeting_id);

alter table subscriptions enable row level security;

create policy "Public read access" on subscriptions for select using (true);
create policy "Public insert" on subscriptions for insert with check (true);
create policy "Public delete" on subscriptions for delete using (true);
