"""CivicClerk OData v4 adapter.

API base: https://{tenant}.api.civicclerk.com/v1/Events
Public portal: https://{tenant}.portal.civicclerk.com/event/{id}

Body-scoped config:
    tenant     -- CivicClerk subdomain
    body_name  -- value of `categoryName` on the event

Tenant-scoped config (for list_all):
    tenant     -- subdomain only; bodies are derived from `categoryName`
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Iterable, Optional

import requests

from scraper.adapters.base import MeetingAdapter
from scraper.normalize import extract_join_url


class CivicClerkAdapter(MeetingAdapter):
    source = "civicclerk"

    def __init__(self, config: dict):
        super().__init__(config)
        self.tenant: str = config["tenant"]
        self.body_name: Optional[str] = config.get("body_name")
        self.session = requests.Session()

    def _api_base(self) -> str:
        return f"https://{self.tenant}.api.civicclerk.com/v1"

    def _portal_base(self) -> str:
        return f"https://{self.tenant}.portal.civicclerk.com"

    def _fetch_events(self, start: datetime, end: datetime) -> list[dict]:
        # OData v4 datetime literal: 2024-01-01T00:00:00Z (no `datetime` prefix)
        params = {
            "$filter": (
                f"eventDate ge {start.strftime('%Y-%m-%dT%H:%M:%SZ')} "
                f"and eventDate le {end.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            ),
            "$orderby": "eventDate desc",
            "$top": "500",
        }
        resp = self.session.get(
            f"{self._api_base()}/Events", params=params, timeout=30
        )
        resp.raise_for_status()
        return resp.json().get("value", [])

    def _to_meeting_row(self, event: dict) -> Optional[dict]:
        eid = event.get("id")
        if eid is None:
            return None
        if event.get("eventName") == "Test Event":
            return None
        date_str = event.get("eventDate") or event.get("startDateTime")
        if not date_str:
            return None
        # CivicClerk uses ISO with trailing Z (UTC).
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except ValueError:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

        return {
            "external_id": str(eid),
            "title": event.get("eventName") or event.get("categoryName") or "Meeting",
            "start_time": dt.isoformat(),
            "location": None,  # not exposed by /Events; could fetch /Agendas later
            "agenda_url": f"{self._portal_base()}/event/{eid}",
            "video_url": event.get("mediaSourcePath") or None,
            "join_url": extract_join_url(event.get("eventDescription")),
        }

    def list_events(self, start: datetime, end: datetime) -> Iterable[dict]:
        if not self.body_name:
            raise ValueError(
                "civicclerk body-scoped config requires body_name "
                "(or use tenant-wide list_all)"
            )
        for e in self._fetch_events(start, end):
            if e.get("categoryName") != self.body_name:
                continue
            row = self._to_meeting_row(e)
            if row:
                yield row

    def list_all(self, start: datetime, end: datetime):
        grouped: dict[str, list[dict]] = defaultdict(list)
        for e in self._fetch_events(start, end):
            row = self._to_meeting_row(e)
            if not row:
                continue
            body_name = e.get("categoryName") or "General"
            grouped[body_name].append(row)
        for body_name, rows in grouped.items():
            yield body_name, rows
