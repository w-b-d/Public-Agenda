-- 0006: Add `video_file_url` to meetings for the direct-download MP4 URL.
--
-- Semantics:
--   video_url      - a player page URL (e.g. a Granicus /player/clip/... page)
--                    suitable for embedding in the app via WebView.
--   video_file_url - a direct download URL (e.g. archive-video.granicus.com/.../X.mp4)
--                    suitable for downloading and transcribing.

alter table meetings add column video_file_url text;
