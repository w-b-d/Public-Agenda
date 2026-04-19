-- Manual meeting data for bodies whose publishing platforms we don't yet
-- have automated adapters for (CivicClerk, BoardDocs, Granicus IQM2, custom HTML).
--
-- Idempotent: re-runnable. Conflicts on (body_id, source, external_id) update
-- the row in place rather than inserting a duplicate.
--
-- PREREQUISITE: run `python -m scraper.run` FIRST so the body rows exist.
-- This script only adds meetings; it looks bodies up by jurisdiction name + body slug.
-- If a body isn't found, the corresponding insert is silently a no-op.
--
-- All times are CA local (Pacific). Postgres stores them in UTC via timestamptz.

-- ---------------------------------------------------------------------------
-- Santa Clara County - Board of Supervisors (Granicus IQM2)
-- ---------------------------------------------------------------------------
with body as (
  select b.id from bodies b
  join jurisdictions j on b.jurisdiction_id = j.id
  where j.name = 'Santa Clara County' and b.slug = 'board-of-supervisors'
)
insert into meetings (body_id, title, start_time, location, agenda_url, source, external_id)
select (select id from body), m.title, m.start_time, m.location, m.agenda_url, 'manual', m.external_id
from (values
  ('Board of Supervisors Regular Meeting', '2026-01-13T09:30:00-08:00'::timestamptz,
   'Board of Supervisors Chambers, 70 West Hedding Street, San Jose, CA 95110',
   'https://sccgov.iqm2.com/Citizens/Detail_Meeting.aspx?ID=17577', 'iqm2-17577'),
  ('Board of Supervisors Regular Meeting', '2026-01-27T09:30:00-08:00'::timestamptz,
   'Board of Supervisors Chambers, 70 West Hedding Street, San Jose, CA 95110',
   'https://sccgov.iqm2.com/Citizens/Detail_Meeting.aspx?ID=17578', 'iqm2-17578'),
  ('Board of Supervisors Regular Meeting', '2026-02-10T09:30:00-08:00'::timestamptz,
   'Board of Supervisors Chambers, 70 West Hedding Street, San Jose, CA 95110',
   'https://sccgov.iqm2.com/Citizens/Detail_Meeting.aspx?ID=17580', 'iqm2-17580')
) as m(title, start_time, location, agenda_url, external_id)
where exists (select 1 from body)
on conflict (body_id, source, external_id) do update
set title = excluded.title,
    start_time = excluded.start_time,
    location = excluded.location,
    agenda_url = excluded.agenda_url;

-- ---------------------------------------------------------------------------
-- Carmel-by-the-Sea - City Council (CivicClerk)
-- ---------------------------------------------------------------------------
with body as (
  select b.id from bodies b
  join jurisdictions j on b.jurisdiction_id = j.id
  where j.name = 'Monterey County' and b.slug = 'carmel-city-council'
)
insert into meetings (body_id, title, start_time, location, agenda_url, source, external_id)
select (select id from body), m.title, m.start_time, m.location, m.agenda_url, 'manual', m.external_id
from (values
  ('City Council Special Meeting', '2026-04-06T15:00:00-07:00'::timestamptz,
   'Council Chambers, East side of Monte Verde Street between Ocean and 7th Avenues, Carmel-by-the-Sea, CA 93921',
   'https://carmelbytheseaca.portal.civicclerk.com/event/786', 'civicclerk-786'),
  ('City Council Regular Meeting', '2026-04-07T16:30:00-07:00'::timestamptz,
   'Council Chambers, East side of Monte Verde Street between Ocean and 7th Avenues, Carmel-by-the-Sea, CA 93921',
   'https://carmelbytheseaca.portal.civicclerk.com/event/770', 'civicclerk-770')
) as m(title, start_time, location, agenda_url, external_id)
where exists (select 1 from body)
on conflict (body_id, source, external_id) do update
set title = excluded.title,
    start_time = excluded.start_time,
    location = excluded.location,
    agenda_url = excluded.agenda_url;

-- ---------------------------------------------------------------------------
-- Seaside - City Council (CivicClerk)
-- ---------------------------------------------------------------------------
with body as (
  select b.id from bodies b
  join jurisdictions j on b.jurisdiction_id = j.id
  where j.name = 'Monterey County' and b.slug = 'seaside-city-council'
)
insert into meetings (body_id, title, start_time, location, agenda_url, source, external_id)
select (select id from body), m.title, m.start_time, m.location, m.agenda_url, 'manual', m.external_id
from (values
  ('City Council / Successor Agency - 1st Thursday', '2026-04-02T17:00:00-07:00'::timestamptz,
   '440 Harcourt Avenue, Seaside, CA 93955',
   'https://seasideca.portal.civicclerk.com/event/5901', 'civicclerk-5901')
) as m(title, start_time, location, agenda_url, external_id)
where exists (select 1 from body)
on conflict (body_id, source, external_id) do update
set title = excluded.title,
    start_time = excluded.start_time,
    location = excluded.location,
    agenda_url = excluded.agenda_url;

-- ---------------------------------------------------------------------------
-- Marina - City Council (CivicPlus AgendaCenter)
-- ---------------------------------------------------------------------------
with body as (
  select b.id from bodies b
  join jurisdictions j on b.jurisdiction_id = j.id
  where j.name = 'Monterey County' and b.slug = 'marina-city-council'
)
insert into meetings (body_id, title, start_time, location, agenda_url, source, external_id)
select (select id from body), m.title, m.start_time, m.location, m.agenda_url, 'manual', m.external_id
from (values
  ('Regular City Council Meeting', '2026-03-17T18:30:00-07:00'::timestamptz,
   'City Hall, 211 Hillcrest Avenue, Marina, CA 93933',
   'https://www.cityofmarina.org/AgendaCenter/ViewFile/Agenda/_03172026-710', 'civicplus-710'),
  ('Regular City Council Meeting', '2026-04-07T18:30:00-07:00'::timestamptz,
   'City Hall, 211 Hillcrest Avenue, Marina, CA 93933',
   'https://www.cityofmarina.org/AgendaCenter/ViewFile/Agenda/_04072026-716', 'civicplus-716'),
  ('Regular City Council Meeting', '2026-04-21T18:30:00-07:00'::timestamptz,
   'City Hall, 211 Hillcrest Avenue, Marina, CA 93933',
   'https://www.cityofmarina.org/AgendaCenter/ViewFile/Agenda/_04212026-720', 'civicplus-720')
) as m(title, start_time, location, agenda_url, external_id)
where exists (select 1 from body)
on conflict (body_id, source, external_id) do update
set title = excluded.title,
    start_time = excluded.start_time,
    location = excluded.location,
    agenda_url = excluded.agenda_url;

-- ---------------------------------------------------------------------------
-- Monterey Peninsula Water Management District (PDFs on WordPress)
-- ---------------------------------------------------------------------------
with body as (
  select b.id from bodies b
  join jurisdictions j on b.jurisdiction_id = j.id
  where j.name = 'Monterey County' and b.slug = 'mpwmd-board'
)
insert into meetings (body_id, title, start_time, location, agenda_url, video_url, source, external_id)
select (select id from body), m.title, m.start_time, m.location, m.agenda_url, m.video_url, 'manual', m.external_id
from (values
  ('Regular Board Meeting', '2026-02-23T18:00:00-08:00'::timestamptz,
   '5 Harris Court, Building G, Monterey, CA 93940 (also Zoom)',
   'https://www.mpwmd.net/wp-content/uploads/Feb-23-2026-Reg-BoD-Mtg.pdf',
   'https://youtu.be/gSGVK5Xhh3E', 'mpwmd-2026-02-23'),
  ('Regular Board Meeting', '2026-03-16T18:00:00-07:00'::timestamptz,
   '5 Harris Court, Building G, Monterey, CA 93940 (also Zoom)',
   'https://www.mpwmd.net/wp-content/uploads/Mar-16-2026-Reg-BoD-Mtg.pdf',
   null, 'mpwmd-2026-03-16'),
  ('Regular Board Meeting', '2026-04-20T18:00:00-07:00'::timestamptz,
   '5 Harris Court, Building G, Monterey, CA 93940 (also Zoom)',
   'https://www.mpwmd.net/wp-content/uploads/Apr-20-2026-Reg-BoD-Mtg.pdf',
   null, 'mpwmd-2026-04-20')
) as m(title, start_time, location, agenda_url, video_url, external_id)
where exists (select 1 from body)
on conflict (body_id, source, external_id) do update
set title = excluded.title,
    start_time = excluded.start_time,
    location = excluded.location,
    agenda_url = excluded.agenda_url,
    video_url = excluded.video_url;

-- ---------------------------------------------------------------------------
-- Monterey Bay Air Resources District (PDFs on website)
-- ---------------------------------------------------------------------------
with body as (
  select b.id from bodies b
  join jurisdictions j on b.jurisdiction_id = j.id
  where j.name = 'Monterey County' and b.slug = 'mbard-board'
)
insert into meetings (body_id, title, start_time, location, agenda_url, source, external_id)
select (select id from body), m.title, m.start_time, m.location, m.agenda_url, 'manual', m.external_id
from (values
  ('Board of Directors Meeting', '2026-02-18T09:00:00-08:00'::timestamptz,
   '24580 Silver Cloud Court, Monterey, CA 93940',
   'https://www.mbard.org/files/101836d68/BODagenda20260218_LINKS.pdf', 'mbard-2026-02-18'),
  ('Board of Directors Meeting', '2026-04-15T09:00:00-07:00'::timestamptz,
   '24580 Silver Cloud Court, Monterey, CA 93940',
   'https://www.mbard.org/files/15b1efbf8/BODagenda20260415_LINKS.pdf', 'mbard-2026-04-15')
) as m(title, start_time, location, agenda_url, external_id)
where exists (select 1 from body)
on conflict (body_id, source, external_id) do update
set title = excluded.title,
    start_time = excluded.start_time,
    location = excluded.location,
    agenda_url = excluded.agenda_url;
