-- 0004: Drop (jurisdiction_id, slug) uniqueness.
--
-- With tenant-wide adapter enumeration, multiple bodies with slightly
-- different names can legitimately share a slug (e.g. "Planning Commission"
-- and "Planning Commission " yield the same slug "planning-commission").
-- Body identity is now enforced via (jurisdiction_id, name) (added in 0003);
-- slug is just a URL-friendly helper and doesn't need to be unique.

alter table bodies drop constraint bodies_jurisdiction_id_slug_key;
