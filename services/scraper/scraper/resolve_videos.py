"""Resolve real video URLs for Legistar meetings by scraping twice:

  1. Fetch the Legistar MeetingDetail page (agenda_url) and extract the
     per-meeting clip_id from `Video.aspx?Mode=Granicus&ID1={N}&Mode2=Video`.
  2. Fetch `https://{tenant}.legistar.com/Video.aspx?Mode=Granicus&ID1={N}&Mode2=Video`.
     Legistar server-side-redirects through to the Granicus player page at
     `https://{tenant}.granicus.com/player/clip/{N}?view_id=...`.
  3. On the Granicus player page, extract
     `https://archive-video.granicus.com/{tenant}/{tenant}_{uuid}.mp4` — the
     direct MP4 download URL.

We then write both URLs back:
  video_url       = the Granicus player page URL (for in-app WebView embed)
  video_file_url  = the direct MP4 URL (for downstream transcription tools)

Also clears out the single bogus placeholder URL that the previous version
of this script mistakenly pasted onto 150+ rows — the Legistar page source
contains a sample `sanfrancisco.granicus.com/.../event_id=0d47d9ee-...`
reference which the old regex matched instead of the real per-meeting URL.

Usage (from services/scraper/):
    python -m scraper.resolve_videos                  # process all Legistar
    python -m scraper.resolve_videos --limit 20       # sample run
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import time
from typing import Optional
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from supabase import create_client

# Meeting-specific video link: `Video.aspx?Mode=Granicus&ID1={N}&G={GUID}&Mode2=Video`.
# REQUIRE the `G=` (body GUID) parameter — without it the URL is a template/
# sample link baked into every Legistar page (same clip_id across all pages
# of the same tenant), not a per-meeting URL.
CLIP_ID_RE = re.compile(
    r"Video\.aspx\?Mode=Granicus&(?:amp;)?ID1=(\d+)&(?:amp;)?G=[A-F0-9-]+&(?:amp;)?Mode2=Video",
    re.IGNORECASE,
)
# Direct MP4 download (e.g. Monterey). Preferred — simpler for naive downloaders.
MP4_RE = re.compile(
    r"https?://archive-video\.granicus\.com/[a-z0-9-]+/[a-z0-9_-]+\.mp4",
    re.IGNORECASE,
)
# HLS playlist fallback (e.g. Santa Barbara). Some tenants only serve this;
# yt-dlp / ffmpeg / Whisper all handle HLS natively.
HLS_RE = re.compile(
    r"https?://archive-stream\.granicus\.com/OnDemand/[^\"'<> ]+\.mp4/playlist\.m3u8",
    re.IGNORECASE,
)
# Legacy placeholder from the very first buggy run (a sample SF event_id baked
# into the Legistar source). Cleared on startup.
BOGUS_URL_MARKER = "0d47d9ee-f180-42a0-ab2e-eb4b5df4f39c"

SLEEP_BETWEEN_FETCHES = 0.2


def tenant_from_url(url: str) -> Optional[str]:
    """Extract the Legistar tenant slug from an agenda_url."""
    try:
        host = urlparse(url).hostname or ""
        if host.endswith(".legistar.com"):
            return host[: -len(".legistar.com")]
    except Exception:
        pass
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=5000)
    args = parser.parse_args()

    load_dotenv()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in services/scraper/.env",
            file=sys.stderr,
        )
        return 1
    sb = create_client(url, key)

    # -- 1. Clear bogus rows from earlier buggy extractor runs ----------------
    # 1a. The very first buggy run inserted the SF placeholder everywhere.
    bogus_rows = (
        sb.table("meetings")
        .select("id")
        .like("video_url", f"%{BOGUS_URL_MARKER}%")
        .execute()
        .data
        or []
    )
    if bogus_rows:
        sb.table("meetings").update({"video_url": None}).like(
            "video_url", f"%{BOGUS_URL_MARKER}%"
        ).execute()
        print(f"Cleared {len(bogus_rows)} SF-placeholder video_urls from first buggy run.")

    # 1b. The second buggy run (prior version of THIS script) matched the
    # Legistar-wide template clip_id for every meeting — all 156 video_file_urls
    # ended up identical. Any row with video_file_url set was written by this
    # script and needs to be re-resolved with the correct regex.
    bad_rows = (
        sb.table("meetings")
        .select("id")
        .not_.is_("video_file_url", "null")
        .execute()
        .data
        or []
    )
    if bad_rows:
        sb.table("meetings").update(
            {"video_url": None, "video_file_url": None}
        ).not_.is_("video_file_url", "null").execute()
        print(
            f"Cleared {len(bad_rows)} rows with template-matched video URLs "
            f"from the second buggy run."
        )

    # -- 2. Find Legistar meetings still needing resolution -------------------
    rows = (
        sb.table("meetings")
        .select("id, agenda_url")
        .eq("source", "legistar")
        .is_("video_url", "null")
        .not_.is_("agenda_url", "null")
        .limit(args.limit)
        .execute()
        .data
        or []
    )
    print(f"Scanning {len(rows)} Legistar meetings without video_url.")

    session = requests.Session()
    session.headers["User-Agent"] = "Mozilla/5.0 community-app scraper"

    updated = 0
    no_clip = 0
    errors = 0
    for i, m in enumerate(rows, start=1):
        agenda_url = m["agenda_url"]
        tenant = tenant_from_url(agenda_url)
        if not tenant:
            continue

        # Step 1: fetch MeetingDetail page, find clip_id
        try:
            r1 = session.get(agenda_url, timeout=20)
            if r1.status_code == 410 or r1.status_code == 404:
                errors += 1
                continue
            r1.raise_for_status()
        except Exception as e:
            errors += 1
            print(f"  [{i}/{len(rows)}] [err] fetch agenda: {type(e).__name__}: {e}")
            continue

        clip_match = CLIP_ID_RE.search(r1.text)
        if not clip_match:
            no_clip += 1
            continue
        clip_id = clip_match.group(1)

        # Step 2: follow Video.aspx redirect chain to the Granicus player page
        video_aspx = (
            f"https://{tenant}.legistar.com/Video.aspx"
            f"?Mode=Granicus&ID1={clip_id}&Mode2=Video"
        )
        try:
            r2 = session.get(video_aspx, timeout=30)
            r2.raise_for_status()
        except Exception as e:
            errors += 1
            print(f"  [{i}/{len(rows)}] [err] follow Video.aspx: {type(e).__name__}: {e}")
            continue

        player_url = r2.url  # final URL after redirects (Granicus player page)
        # Prefer direct MP4, fall back to HLS playlist.
        mp4_match = MP4_RE.search(r2.text)
        if mp4_match:
            mp4_url = mp4_match.group(0)
        else:
            hls_match = HLS_RE.search(r2.text)
            mp4_url = hls_match.group(0) if hls_match else None

        # Step 3: write back
        updates: dict = {"video_url": player_url}
        if mp4_url:
            updates["video_file_url"] = mp4_url
        try:
            sb.table("meetings").update(updates).eq("id", m["id"]).execute()
            updated += 1
            if updated % 25 == 0 or i == len(rows):
                print(f"  [{i}/{len(rows)}] updated {updated} so far")
        except Exception as e:
            errors += 1
            print(f"  [{i}/{len(rows)}] [db err] {e}")

        time.sleep(SLEEP_BETWEEN_FETCHES)

    print(
        f"\nDone. scanned {len(rows)}, updated {updated}, "
        f"no clip_id found {no_clip}, errors {errors}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
