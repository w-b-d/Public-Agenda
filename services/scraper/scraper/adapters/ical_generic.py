"""Generic iCal feed adapter.

Works with any platform that exposes a public .ics URL:
Granicus IQM2 (Export to iCal), CivicPlus AgendaCenter, BoardDocs,
CivicClerk, plain Google/Apple calendars, etc.

Config:
    url       -- the .ics feed URL
    timezone  -- (optional) IANA zone name, used for naive DTSTART values.
                 Per RFC 5545, iCal datetimes without a timezone are
                 "floating" (interpreted in the viewer's local time), NOT
                 UTC. Defaults to America/Los_Angeles since our initial
                 coverage is California.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable
from zoneinfo import ZoneInfo

import requests
from icalendar import Calendar

from scraper.adapters.base import MeetingAdapter
from scraper.normalize import extract_join_url

_DEFAULT_TZ = "America/Los_Angeles"


class ICalAdapter(MeetingAdapter):
    source = "ical"

    def __init__(self, config: dict):
        super().__init__(config)
        self.url: str = config["url"]
        self.local_tz = ZoneInfo(config.get("timezone", _DEFAULT_TZ))

    def list_events(self, start: datetime, end: datetime) -> Iterable[dict]:
        resp = requests.get(self.url, timeout=30)
        resp.raise_for_status()
        cal = Calendar.from_ical(resp.content)

        for component in cal.walk("VEVENT"):
            dtstart_field = component.get("DTSTART")
            if dtstart_field is None:
                continue
            dtstart = dtstart_field.dt
            # iCal DTSTART can be date-only (all-day events). Skip those.
            if not isinstance(dtstart, datetime):
                continue
            if dtstart.tzinfo is None:
                # RFC 5545 floating datetimes: interpret as local time of
                # the publisher (NOT UTC).
                dtstart = dtstart.replace(tzinfo=self.local_tz)
            if not (start <= dtstart <= end):
                continue

            uid = str(component.get("UID") or "")
            if not uid:
                continue

            summary = str(component.get("SUMMARY") or "Meeting")
            location_field = component.get("LOCATION")
            location = str(location_field) if location_field else None
            description = str(component.get("DESCRIPTION") or "")
            url_field = component.get("URL")
            url = str(url_field) if url_field else None

            yield {
                "external_id": uid,
                "title": summary,
                "start_time": dtstart.astimezone(timezone.utc).isoformat(),
                "location": location,
                "agenda_url": url,
                "video_url": None,
                "video_file_url": None,
                "join_url": extract_join_url(description),
            }
