-- 0003: Add uniqueness on (jurisdiction_id, name) for bodies.
-- Tenant-wide adapter enumeration uses the platform's body name as the
-- canonical identifier; this constraint enables name-based upsert without
-- collisions and lets the scraper safely run multiple times.
--
-- Existing rows already have unique names within jurisdiction, so this should
-- succeed cleanly. If it fails, run:
--   select jurisdiction_id, name, count(*)
--   from bodies group by 1, 2 having count(*) > 1;
-- ...to find duplicates first.

alter table bodies
  add constraint bodies_jurisdiction_id_name_key unique (jurisdiction_id, name);
