"""Scrape Monterey County Board of Supervisors meetings from Legistar
into our Supabase `meetings` table.

Usage (from services/scraper/):
    python -m scraper.run
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from supabase import create_client

from scraper.legistar import LegistarClient
from scraper.normalize import normalize_event

LEGISTAR_CLIENT = "monterey"
BODY_NAME_IN_LEGISTAR = "Board of Supervisors"
BODY_SLUG_IN_DB = "board-of-supervisors"
WINDOW_DAYS = 90


def main() -> int:
    load_dotenv()

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SECRET_KEY")
    if not supabase_url or not supabase_key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in services/scraper/.env",
            file=sys.stderr,
        )
        return 1

    supabase = create_client(supabase_url, supabase_key)

    body_resp = (
        supabase.table("bodies")
        .select("id,legistar_body_id")
        .eq("slug", BODY_SLUG_IN_DB)
        .limit(1)
        .execute()
    )
    if not body_resp.data:
        print(
            f"ERROR: no body with slug '{BODY_SLUG_IN_DB}' found. Did the migration run?",
            file=sys.stderr,
        )
        return 1
    body_id = body_resp.data[0]["id"]
    legistar_body_id = body_resp.data[0].get("legistar_body_id")

    legistar = LegistarClient(LEGISTAR_CLIENT)

    if not legistar_body_id:
        print(f"Looking up Legistar BodyId for '{BODY_NAME_IN_LEGISTAR}'...")
        bodies = legistar.list_bodies()
        match = next(
            (b for b in bodies if b.get("BodyName") == BODY_NAME_IN_LEGISTAR),
            None,
        )
        if not match:
            print(
                f"ERROR: '{BODY_NAME_IN_LEGISTAR}' not found in Legistar /Bodies.",
                file=sys.stderr,
            )
            return 1
        legistar_body_id = match["BodyId"]
        supabase.table("bodies").update(
            {"legistar_body_id": legistar_body_id}
        ).eq("id", body_id).execute()
        print(f"  -> BodyId={legistar_body_id} (cached in Supabase)")

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=WINDOW_DAYS)
    end = now + timedelta(days=WINDOW_DAYS)
    events = legistar.list_events(start=start, end=end, body_id=legistar_body_id)
    print(f"Fetched {len(events)} events from Legistar.")

    rows = [normalize_event(e, body_id=body_id) for e in events]
    if rows:
        result = (
            supabase.table("meetings")
            .upsert(rows, on_conflict="body_id,legistar_event_id")
            .execute()
        )
        upcoming = sum(1 for r in rows if r["start_time"] >= now.isoformat())
        past = len(rows) - upcoming
        print(
            f"Upserted {len(result.data)} meetings "
            f"({upcoming} upcoming, {past} past)."
        )
    else:
        print("No events in window; nothing to upsert.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
