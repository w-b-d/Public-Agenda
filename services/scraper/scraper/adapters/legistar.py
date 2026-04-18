"""Legistar Web API adapter.

API docs: https://webapi.legistar.com/Help

Config:
    tenant   -- Legistar subdomain (e.g. 'monterey' for monterey.legistar.com)
    body_name -- name of the body in Legistar (looked up to get BodyId)
    body_id  -- optional cached integer; skips the body_name lookup
"""
from __future__ import annotations

from datetime import datetime
from typing import Iterable, Optional

import requests

from scraper.adapters.base import MeetingAdapter
from scraper.normalize import extract_join_url, parse_event_datetime

BASE_URL = "https://webapi.legistar.com/v1"


class LegistarAdapter(MeetingAdapter):
    source = "legistar"

    def __init__(self, config: dict):
        super().__init__(config)
        self.tenant: str = config["tenant"]
        self.body_name: Optional[str] = config.get("body_name")
        self.body_id: Optional[int] = config.get("body_id")
        self.session = requests.Session()

    def _get(self, path: str, params: Optional[dict] = None) -> list:
        resp = self.session.get(
            f"{BASE_URL}/{self.tenant}{path}", params=params, timeout=30
        )
        resp.raise_for_status()
        return resp.json()

    def _resolve_body_id(self) -> int:
        if self.body_id:
            return self.body_id
        if not self.body_name:
            raise ValueError(
                "legistar config requires either body_id or body_name"
            )
        bodies = self._get("/Bodies")
        for b in bodies:
            if b.get("BodyName") == self.body_name:
                self.body_id = b["BodyId"]
                return self.body_id
        raise ValueError(
            f"Legistar body '{self.body_name}' not found in tenant '{self.tenant}'"
        )

    def list_events(self, start: datetime, end: datetime) -> Iterable[dict]:
        body_id = self._resolve_body_id()
        filter_parts = [
            f"EventDate gt datetime'{start.strftime('%Y-%m-%dT%H:%M:%S')}'",
            f"EventDate lt datetime'{end.strftime('%Y-%m-%dT%H:%M:%S')}'",
            f"EventBodyId eq {body_id}",
        ]
        events = self._get(
            "/Events",
            params={
                "$filter": " and ".join(filter_parts),
                "$orderby": "EventDate",
            },
        )
        for e in events:
            yield {
                "external_id": str(e["EventId"]),
                "title": e.get("EventBodyName") or "Meeting",
                "start_time": parse_event_datetime(
                    e["EventDate"], e.get("EventTime")
                ).isoformat(),
                "location": e.get("EventLocation"),
                "agenda_url": e.get("EventInSiteURL"),
                "video_url": e.get("EventVideoPath"),
                "join_url": extract_join_url(e.get("EventComment")),
            }
