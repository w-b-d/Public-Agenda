-- 0007: Add `transcript` to meetings for plain-text meeting transcripts.
--
-- Friend's transcription pipeline (Whisper + AI summary) writes here.
-- Summaries go in the existing `ai_summary` column; transcripts here.
-- Keeping it as a single text blob for now — structured timestamped
-- segments can be added as a separate jsonb column later if the UI
-- needs click-to-seek playback.

alter table meetings add column transcript text;
