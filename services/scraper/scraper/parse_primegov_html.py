"""Parse a saved PrimeGov portal HTML page to extract Swagit video URLs and
update the matching meetings in Supabase.

Why this exists:
  PrimeGov's public portal is a CSR page (server sends a SPA shell, JS fills
  in the archived-meetings table via XHR). We haven't found a public API
  endpoint that exposes the archived-meetings-with-video-urls listing, so
  for now we scrape the rendered DOM. The workflow:

    1. Open https://{tenant}.primegov.com/public/portal in your browser.
    2. (Optional) Set Entries dropdown to 15, pick the year tab you want.
    3. DevTools (F12) → Elements tab → right-click on <html> → Copy outerHTML.
    4. Paste into a file, e.g. /tmp/primegov.html.
    5. Run:
         python -m scraper.parse_primegov_html /tmp/primegov.html \\
             --jurisdiction-name "Santa Cruz County" --tenant santacruzcountyca

  Each row matched will get its `video_url` + `video_file_url` set on the
  corresponding meetings row (matched by jurisdiction + body name + date).
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client

# Reuse the canonical title-normalization from the PrimeGov adapter so this
# fallback tool can't drift from the adapter's behavior.
from scraper.adapters.primegov import _body_name_from_title as body_name_from_title


def extract_rows(html: str) -> list[dict]:
    """Yield one dict per <tr role='row'> with a title + date + optional swagit URL."""
    rows_out = []
    # Split into individual row HTML blobs.
    for m in re.finditer(r'<tr role="row"[^>]*>(.*?)</tr>', html, re.DOTALL):
        row = m.group(1)
        title_m = re.search(r'title="([^"]+)"', row)
        date_m = re.search(r'sorting_1">([^<]+)<', row)
        if not title_m or not date_m:
            continue
        video_m = re.search(
            r'href="(https?://[^"]*swagit\.com/videos/\d+)"', row
        )
        rows_out.append(
            {
                "title": title_m.group(1).strip(),
                "date_str": date_m.group(1).strip(),
                "swagit_url": video_m.group(1) if video_m else None,
            }
        )
    return rows_out


def derive_download_url(player_url: str) -> Optional[str]:
    m = re.match(r"(https?://[^/]+/videos/\d+)", player_url)
    return f"{m.group(1)}/download" if m else None


def parse_pg_date(s: str) -> Optional[datetime]:
    """Parse 'Apr 14, 2026 09:00 AM' → datetime."""
    try:
        return datetime.strptime(s, "%b %d, %Y %I:%M %p")
    except ValueError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("html_file", help="Path to a saved PrimeGov portal HTML file")
    parser.add_argument(
        "--jurisdiction-name",
        default="Santa Cruz County",
        help="Jurisdiction name to match against (default: Santa Cruz County)",
    )
    args = parser.parse_args()

    with open(args.html_file, encoding="utf-8") as f:
        html = f.read()

    rows = extract_rows(html)
    with_video = [r for r in rows if r["swagit_url"]]
    print(
        f"Parsed {len(rows)} rows total; {len(with_video)} have a Swagit video URL."
    )
    if not with_video:
        return 0

    load_dotenv()
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SECRET_KEY")
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL + SUPABASE_SECRET_KEY required", file=sys.stderr)
        return 1
    sb = create_client(supabase_url, supabase_key)

    # Resolve jurisdiction
    j = (
        sb.table("jurisdictions")
        .select("id")
        .eq("name", args.jurisdiction_name)
        .limit(1)
        .execute()
    )
    if not j.data:
        print(f"Jurisdiction not found: {args.jurisdiction_name!r}", file=sys.stderr)
        return 1
    jurisdiction_id = j.data[0]["id"]

    updated = 0
    skipped = 0
    for row in with_video:
        dt = parse_pg_date(row["date_str"])
        if not dt:
            skipped += 1
            continue
        body_name = body_name_from_title(row["title"])

        b = (
            sb.table("bodies")
            .select("id")
            .eq("jurisdiction_id", jurisdiction_id)
            .eq("name", body_name)
            .limit(1)
            .execute()
        )
        if not b.data:
            print(f"  [skip] body not found: {body_name!r} (title was {row['title']!r})")
            skipped += 1
            continue
        body_id = b.data[0]["id"]

        day_start = dt.date().isoformat() + "T00:00:00"
        day_end = dt.date().isoformat() + "T23:59:59"
        m_resp = (
            sb.table("meetings")
            .select("id, title, video_url")
            .eq("body_id", body_id)
            .gte("start_time", day_start)
            .lte("start_time", day_end)
            .limit(1)
            .execute()
        )
        if not m_resp.data:
            print(f"  [skip] no meeting on {dt.date()} for body {body_name!r}")
            skipped += 1
            continue

        meeting = m_resp.data[0]
        updates = {
            "video_url": row["swagit_url"],
            "video_file_url": derive_download_url(row["swagit_url"]),
        }
        sb.table("meetings").update(updates).eq("id", meeting["id"]).execute()
        updated += 1
        print(f"  [✓] {body_name} {dt.date()} → {row['swagit_url']}")

    print(f"\nDone. updated {updated}, skipped {skipped}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
