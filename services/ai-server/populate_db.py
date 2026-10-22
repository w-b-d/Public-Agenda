"""Batch: transcribe meeting videos and write results back to Supabase.

Pipeline per meeting:
  1. Download MP4 -> extract MP3 (scripts.download_audio)
  2. POST MP3 to Colab /transcribe -> job_id
  3. Poll Colab /result/{job_id} until done
  4. Update meetings row with transcript, ai_summary (jsonb), attendees (jsonb)

Env (services/ai-server/.env, see .env.example):
  SUPABASE_URL=...
  SUPABASE_SECRET_KEY=...
  COLAB_URL=https://<your-ngrok-subdomain>.ngrok-free.dev

Usage:
  python populate_db.py --limit 1
  python populate_db.py --limit 2 --jurisdiction-id 00000000-0000-0000-0000-000000000002
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

from scripts import download_audio

MONTEREY_JURISDICTION_ID = "00000000-0000-0000-0000-000000000002"
POLL_INTERVAL_SEC = 10
POLL_TIMEOUT_SEC = 60 * 60  # 1 hour — long meetings take a while
OUTPUT_DIR = Path(__file__).resolve().parent / "output"


def fetch_pending_meetings(
    supabase: Client, jurisdiction_id: str, limit: int, body_id: str | None = None
) -> list[dict]:
    """Meetings with a video_file_url and no transcript yet."""
    if body_id:
        body_ids = [body_id]
    else:
        body_rows = (
            supabase.table("bodies")
            .select("id")
            .eq("jurisdiction_id", jurisdiction_id)
            .execute()
        )
        body_ids = [b["id"] for b in body_rows.data]
        if not body_ids:
            return []

    result = (
        supabase.table("meetings")
        .select("id, title, video_file_url, transcript")
        .in_("body_id", body_ids)
        .not_.is_("video_file_url", "null")
        .is_("transcript", "null")
        .order("start_time", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


def transcribe_via_colab(colab_url: str, mp3_path: Path) -> dict:
    """Upload MP3, poll until done, return {transcript, summary, attendees}."""
    with open(mp3_path, "rb") as f:
        resp = requests.post(f"{colab_url}/transcribe", files={"file": f})
    resp.raise_for_status()
    job_id = resp.json()["job_id"]
    print(f"  job_id={job_id}, polling...", flush=True)

    deadline = time.time() + POLL_TIMEOUT_SEC
    while time.time() < deadline:
        r = requests.get(f"{colab_url}/result/{job_id}")
        r.raise_for_status()
        data = r.json()
        status = data.get("status")
        if status == "done":
            return data
        if status == "error":
            raise RuntimeError(f"Colab job failed: {data.get('message')}")
        time.sleep(POLL_INTERVAL_SEC)

    raise TimeoutError(f"Job {job_id} did not finish within {POLL_TIMEOUT_SEC}s")


def process_meeting(
    supabase: Client, colab_url: str, meeting: dict
) -> None:
    meeting_id = meeting["id"]
    title = meeting["title"]
    video_url = meeting["video_file_url"]
    print(f"\n[{meeting_id}] {title}")
    print(f"  downloading {video_url}")

    OUTPUT_DIR.mkdir(exist_ok=True)
    audio_stem = OUTPUT_DIR / meeting_id
    download_audio(url=video_url, output_path=str(audio_stem))
    mp3_path = audio_stem.with_suffix(".mp3")

    try:
        print(f"  sending to colab: {colab_url}")
        result = transcribe_via_colab(colab_url, mp3_path)

        update = {
            "transcript": result.get("transcript", ""),
            "ai_summary": result.get("executive_summary", ""),
            "attendees": result.get("attendees", []),
        }
        supabase.table("meetings").update(update).eq("id", meeting_id).execute()
        print(f"  updated meeting row ({len(update['transcript'])} transcript chars, "
              f"{len(update['ai_summary'])} summary chars, {len(update['attendees'])} attendees)")
    finally:
        if mp3_path.exists():
            mp3_path.unlink()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--jurisdiction-id", default=MONTEREY_JURISDICTION_ID)
    parser.add_argument("--body-id", default=None)
    args = parser.parse_args()

    load_dotenv()
    supabase_url = os.environ.get("SUPABASE_URL", "<SUPABASE_URL>")
    supabase_key = os.environ.get("SUPABASE_SECRET_KEY", "<SUPABASE_SECRET_KEY>")
    colab_url = os.environ.get("COLAB_URL", "<COLAB_URL>").rstrip("/")

    for label, val in [("SUPABASE_URL", supabase_url), ("SUPABASE_SECRET_KEY", supabase_key), ("COLAB_URL", colab_url)]:
        if val.startswith("<") and val.endswith(">"):
            print(f"ERROR: {label} not set in .env", file=sys.stderr)
            return 1

    supabase = create_client(supabase_url, supabase_key)
    meetings = fetch_pending_meetings(supabase, args.jurisdiction_id, args.limit, args.body_id)
    if not meetings:
        print("No pending meetings.")
        return 0

    print(f"Processing {len(meetings)} meeting(s)...")
    for m in meetings:
        try:
            process_meeting(supabase, colab_url, m)
        except Exception as e:
            import traceback
            print(f"  [error] {type(e).__name__}: {e}", file=sys.stderr)
            traceback.print_exc()
    return 0


if __name__ == "__main__":
    sys.exit(main())
