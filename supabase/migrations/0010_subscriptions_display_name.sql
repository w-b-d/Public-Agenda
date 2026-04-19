-- Denormalize a display name onto each subscription row so the "Who else
-- subscribed?" UI can render without a separate users table or a Clerk
-- server call. We set it at star time from the Clerk session (first name,
-- otherwise email local-part). Stale if the user updates their profile
-- later, but acceptable for hackathon demos.

alter table subscriptions add column display_name text;
