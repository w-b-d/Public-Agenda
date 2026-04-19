-- 0002: Generalize meetings for multiple meeting-source platforms.
-- Replaces legistar-specific columns with a (source, external_id) pair so
-- the scraper can ingest events from Legistar, iCal, etc. uniformly.

-- 1. Add the new columns (nullable for the backfill step).
alter table meetings
  add column source text,
  add column external_id text;

-- 2. Backfill from existing legistar data.
--    Assumes every existing row has legistar_event_id (true under the
--    pre-refactor scraper). If any row has NULL legistar_event_id, the
--    NOT NULL constraint below will fail — investigate and clean up first.
update meetings
set external_id = legistar_event_id::text,
    source = 'legistar';

-- 3. Lock in non-null on the new columns.
alter table meetings alter column source set not null;
alter table meetings alter column external_id set not null;

-- 4. Swap the unique constraint over to the new shape.
alter table meetings drop constraint meetings_body_id_legistar_event_id_key;
alter table meetings drop column legistar_event_id;
alter table meetings add constraint meetings_body_id_source_external_id_key
  unique (body_id, source, external_id);

-- 5. Bodies are now configured per-jurisdiction in YAML, not in the DB.
alter table bodies drop column legistar_client;
alter table bodies drop column legistar_body_id;
