-- 0005: Normalize existing body names + deduplicate whitespace variants.
--
-- Context: earlier scraper runs inserted body rows with raw Legistar names
-- that sometimes had leading/trailing/internal whitespace inconsistencies.
-- The scraper now normalizes names on upsert, but existing rows need a
-- one-time cleanup so future runs don't create duplicate rows.
--
-- Safe to run even if there are no duplicates — both steps are idempotent.

-- Step 1: remove duplicates where two rows have names that normalize to
-- the same value. Keeps the earliest-created row (its meetings survive
-- via the cascade? no — meetings cascade-delete with bodies, so this WILL
-- drop meetings attached to duplicate body rows. That's usually fine since
-- a subsequent `python -m scraper.run` will re-upsert them onto the kept row).
delete from bodies b1
using bodies b2
where b1.jurisdiction_id = b2.jurisdiction_id
  and b1.id != b2.id
  and trim(regexp_replace(b1.name, '\s+', ' ', 'g')) = trim(regexp_replace(b2.name, '\s+', ' ', 'g'))
  and b1.created_at > b2.created_at;

-- Step 2: normalize names in remaining rows.
update bodies
set name = trim(regexp_replace(name, '\s+', ' ', 'g'))
where name != trim(regexp_replace(name, '\s+', ' ', 'g'));
