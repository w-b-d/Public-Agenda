"""PrimeGov / Granicus OneMeeting adapter.

Uses the Public Portal v2 API, which returns richer data than the older
`/api/meeting/list` endpoint — specifically, archived meetings come back
with `videoUrl` and `swagitId` populated, so we can resolve Swagit video
URLs without a second scraping pass.

Endpoints used:
  GET /api/v2/PublicPortal/ListUpcomingMeetings
  GET /api/v2/PublicPortal/GetArchivedMeetingYears       → [2026, 2025, ...]
  GET /api/v2/PublicPortal/ListArchivedMeetings?year=N

Each meeting JSON carries: id, meetingTypeId, committeeId, dateTime,
title, videoUrl, swagitId, isShowVideoIcon, zoomMeetingLink, etc.

Body-scoped config:
    tenant     -- PrimeGov subdomain (e.g. 'santacruzcountyca')
    body_name  -- normalized body name (must match `_body_name_from_title()`)
    timezone   -- (optional) IANA zone; default 'America/Los_Angeles'.

Tenant-scoped config (for list_all):
    tenant     -- subdomain only; bodies derived from title prefixes.

The v2 endpoints require XHR-like headers (Accept + X-Requested-With +
Referer) — without them the server returns the HTML SPA shell.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

import requests

from scraper.adapters.base import MeetingAdapter

_DEFAULT_TZ = "America/Los_Angeles"

# Swagit video URL pattern. Only construct the /download URL when the
# videoUrl field matches this — prevents generating garbage URLs if a
# PrimeGov tenant ever starts pointing videoUrl at a non-Swagit hoster.
_SWAGIT_URL_RE = re.compile(
    r"^https?://[^/]+\.swagit\.com/videos/\d+/?", re.IGNORECASE
)

_TITLE_SUFFIXES = (
    " - Regular Meeting",
    " - Special Meeting",
    " - Budget Meeting",
    " - Organizational Meeting",
    " - Continued Budget Meeting",
    " - Last Day Budget Meeting",
    " - Special",
    " - Regular",
    " Regular Meeting",
    " Special Meeting",
    " Organizational Meeting",
)

# Test meetings are inserted by PrimeGov itself and pollute several tenants.
_TEST_MARKERS = (
    "video test",
    "testing primegov",
    "test city selection",
    "test board of supervisors",
    "test for bos",
    "test meeting",
)


def _body_name_from_title(title: str) -> str:
    t = (title or "").strip()
    if not t:
        return "Meeting"
    for suf in _TITLE_SUFFIXES:
        if t.endswith(suf):
            return t[: -len(suf)].strip()
    if " - " in t:
        return t.split(" - ", 1)[0].strip()
    return t


def _is_test_meeting(title: str) -> bool:
    low = (title or "").lower()
    return any(m in low for m in _TEST_MARKERS)


class PrimeGovAdapter(MeetingAdapter):
    source = "primegov"

    def __init__(self, config: dict):
        super().__init__(config)
        self.tenant: str = config["tenant"]
        self.body_name: Optional[str] = config.get("body_name")
        # Default to PT (our initial coverage is California); override via
        # `timezone: "..."` in the YAML for non-CA tenants.
        self.local_tz = ZoneInfo(config.get("timezone", _DEFAULT_TZ))
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "Mozilla/5.0 community-app scraper",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": f"https://{self.tenant}.primegov.com/public/portal",
            }
        )

    def _api_base(self) -> str:
        return f"https://{self.tenant}.primegov.com/api/v2/PublicPortal"

    def _get_json(self, path: str, params: Optional[dict] = None):
        resp = self.session.get(f"{self._api_base()}{path}", params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _fetch_all(self) -> list[dict]:
        """Upcoming meetings + every archived year, merged into one flat list."""
        out: list[dict] = []
        try:
            out.extend(self._get_json("/ListUpcomingMeetings") or [])
        except Exception as e:
            print(f"    [warn] primegov {self.tenant} upcoming: {type(e).__name__}: {e}")
        try:
            years = self._get_json("/GetArchivedMeetingYears") or []
        except Exception as e:
            print(f"    [warn] primegov {self.tenant} years: {type(e).__name__}: {e}")
            years = []
        for y in years:
            try:
                out.extend(
                    self._get_json("/ListArchivedMeetings", params={"year": y}) or []
                )
            except Exception as e:
                print(f"    [warn] primegov {self.tenant} year={y}: {type(e).__name__}: {e}")
        return out

    def _to_meeting_row(self, event: dict) -> Optional[dict]:
        mid = event.get("id")
        title = (event.get("title") or "").strip()
        dt_str = event.get("dateTime")
        if mid is None or not title or not dt_str:
            return None
        if _is_test_meeting(title):
            return None
        try:
            dt = datetime.fromisoformat(dt_str).replace(tzinfo=self.local_tz)
        except ValueError:
            return None

        raw_video = (event.get("videoUrl") or "").strip() or None
        video_file_url: Optional[str] = None
        if raw_video:
            if _SWAGIT_URL_RE.match(raw_video):
                # Swagit's `/videos/{id}/download` redirects to a signed S3 MP4.
                video_file_url = raw_video.rstrip("/") + "/download"
            else:
                # Unfamiliar hoster — log so we can notice + handle new vendors.
                print(
                    f"    [info] primegov {self.tenant}: non-Swagit videoUrl "
                    f"(leaving video_file_url null): {raw_video}"
                )

        join_url = None
        if event.get("isZoomMeeting"):
            join_url = event.get("zoomMeetingLink")

        return {
            "external_id": str(mid),
            "title": title,
            "start_time": dt.isoformat(),
            "location": None,
            "agenda_url": f"https://{self.tenant}.primegov.com/public/portal",
            "video_url": raw_video,
            "video_file_url": video_file_url,
            "join_url": join_url,
        }

    def _in_window(
        self, row: dict, start: datetime, end: datetime
    ) -> bool:
        """Compare row start_time against the window as datetimes, not strings.

        Lexicographic comparison across mixed timezone offsets gives wrong
        answers at the boundary (e.g. '2026-01-18T14:00:00-07:00' is
        lexicographically less than '2026-01-18T21:00:00+00:00' even though
        they're the same UTC instant).
        """
        try:
            row_dt = datetime.fromisoformat(row["start_time"])
        except ValueError:
            return False
        return start <= row_dt <= end

    def list_events(self, start: datetime, end: datetime) -> Iterable[dict]:
        if not self.body_name:
            raise ValueError(
                "primegov body-scoped config requires body_name "
                "(or use tenant-wide list_all)"
            )
        kept = 0
        dropped = 0
        for m in self._fetch_all():
            if _body_name_from_title(m.get("title") or "") != self.body_name:
                continue
            row = self._to_meeting_row(m)
            if not row:
                continue
            if self._in_window(row, start, end):
                kept += 1
                yield row
            else:
                dropped += 1
        if dropped:
            print(
                f"    [debug] primegov {self.tenant}/{self.body_name}: "
                f"kept {kept}, dropped {dropped} out-of-window"
            )

    def list_all(
        self, start: datetime, end: datetime
    ) -> Iterable[tuple[str, list[dict]]]:
        grouped: dict[str, list[dict]] = defaultdict(list)
        dropped = 0
        for m in self._fetch_all():
            row = self._to_meeting_row(m)
            if not row:
                continue
            if not self._in_window(row, start, end):
                dropped += 1
                continue
            body_name = _body_name_from_title(m.get("title") or "")
            grouped[body_name].append(row)
        if dropped:
            print(
                f"    [debug] primegov {self.tenant}: "
                f"dropped {dropped} out-of-window"
            )
        for name, rows in grouped.items():
            yield name, rows
