"""Re-run the executive summary step for meetings whose ai_summary failed.

Pulls rows from Supabase that have a transcript but a bad/empty ai_summary,
sends just the transcript to Colab's /resummarize endpoint, and writes the
new executive summary back. Does not re-transcribe.

Env (services/ai-server/.env, see .env.example):
  SUPABASE_URL=...
  SUPABASE_SECRET_KEY=...
  COLAB_URL=https://<your-ngrok-subdomain>.ngrok-free.dev

Usage:
  python resummarize.py
  python resummarize.py --jurisdiction-id 00000000-0000-0000-0000-000000000002
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

MONTEREY_JURISDICTION_ID = "00000000-0000-0000-0000-000000000002"
REQUEST_TIMEOUT_SEC = 60 * 60  # 1 hour
POLL_INTERVAL_SEC = 10
POLL_TIMEOUT_SEC = 60 * 60


def fetch_bad_summary_meetings(supabase: Client, jurisdiction_id: str) -> list[dict]:
    body_rows = (
        supabase.table("bodies")
        .select("id")
        .eq("jurisdiction_id", jurisdiction_id)
        .execute()
    )
    body_ids = [b["id"] for b in body_rows.data]
    if not body_ids:
        return []

    rows = (
        supabase.table("meetings")
        .select("id, title, transcript, ai_summary")
        .in_("body_id", body_ids)
        .not_.is_("transcript", "null")
        .execute()
        .data
    )

    bad = []
    for r in rows:
        s = (r.get("ai_summary") or "").strip()
        if not s or s.startswith("Error") or "error" in s.lower()[:50]:
            bad.append(r)
    return bad


def resummarize_one(colab_url: str, transcript: str) -> str:
    resp = requests.post(
        f"{colab_url}/resummarize",
        json={"transcript": transcript},
        timeout=60,
    )
    resp.raise_for_status()
    job_id = resp.json()["job_id"]
    print(f"  job_id={job_id}, polling...", flush=True)

    deadline = time.time() + POLL_TIMEOUT_SEC
    while time.time() < deadline:
        r = requests.get(f"{colab_url}/result/{job_id}", timeout=60)
        r.raise_for_status()
        data = r.json()
        status = data.get("status")
        if status == "done":
            return data.get("executive_summary", "")
        if status == "error":
            raise RuntimeError(f"Colab resummarize failed: {data.get('message')}")
        time.sleep(POLL_INTERVAL_SEC)

    raise TimeoutError(f"Resummarize job {job_id} did not finish within {POLL_TIMEOUT_SEC}s")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jurisdiction-id", default=MONTEREY_JURISDICTION_ID)
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
    meetings = fetch_bad_summary_meetings(supabase, args.jurisdiction_id)
    if not meetings:
        print("No meetings need resummarization.")
        return 0

    print(f"Resummarizing {len(meetings)} meeting(s)...")
    for m in meetings:
        meeting_id = m["id"]
        title = m.get("title", "")
        print(f"\n[{meeting_id}] {title}")
        try:
            exec_sum = resummarize_one(colab_url, m["transcript"])
            supabase.table("meetings").update({"ai_summary": exec_sum}).eq("id", meeting_id).execute()
            print(f"  ✓ {len(exec_sum)} chars written")
        except Exception as e:
            import traceback
            print(f"  [error] {type(e).__name__}: {e}", file=sys.stderr)
            traceback.print_exc()
    return 0


if __name__ == "__main__":
    sys.exit(main())
