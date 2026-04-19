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

Tenant-scoped config (for list_all):
    tenant     -- subdomain only; bodies derived from title prefixes.

The v2 endpoints require XHR-like headers (Accept + X-Requested-With +
Referer) — without them the server returns the HTML SPA shell.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

import requests

from scraper.adapters.base import MeetingAdapter

_LOCAL_TZ = ZoneInfo("America/Los_Angeles")

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
            dt = datetime.fromisoformat(dt_str).replace(tzinfo=_LOCAL_TZ)
        except ValueError:
            return None

        raw_video = (event.get("videoUrl") or "").strip() or None
        video_file_url: Optional[str] = None
        if raw_video:
            # Swagit's `/videos/{id}/download` redirects to a signed S3 MP4.
            video_file_url = raw_video.rstrip("/") + "/download"

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

    def list_events(self, start: datetime, end: datetime) -> Iterable[dict]:
        if not self.body_name:
            raise ValueError(
                "primegov body-scoped config requires body_name "
                "(or use tenant-wide list_all)"
            )
        for m in self._fetch_all():
            if _body_name_from_title(m.get("title") or "") != self.body_name:
                continue
            row = self._to_meeting_row(m)
            if not row:
                continue
            if start.isoformat() <= row["start_time"] <= end.isoformat():
                yield row

    def list_all(
        self, start: datetime, end: datetime
    ) -> Iterable[tuple[str, list[dict]]]:
        grouped: dict[str, list[dict]] = defaultdict(list)
        for m in self._fetch_all():
            row = self._to_meeting_row(m)
            if not row:
                continue
            if not (start.isoformat() <= row["start_time"] <= end.isoformat()):
                continue
            body_name = _body_name_from_title(m.get("title") or "")
            grouped[body_name].append(row)
        for name, rows in grouped.items():
            yield name, rows
