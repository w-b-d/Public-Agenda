"""Map Legistar event dicts into rows that match the `meetings` schema."""
from __future__ import annotations

import re
from datetime import datetime, time
from typing import Optional
from zoneinfo import ZoneInfo

# Best-effort detection of a videoconference link inside EventComment.
JOIN_URL_RE = re.compile(
    r"https?://\S*(?:zoom\.us|teams\.microsoft\.com|meet\.google\.com|webex\.com)\S*"
)


def parse_event_datetime(
    event_date_str: str,
    event_time_str: Optional[str],
    tz: str = "America/Los_Angeles",
) -> datetime:
    date_only = datetime.fromisoformat(event_date_str).date()
    if event_time_str:
        t = datetime.strptime(event_time_str.strip(), "%I:%M %p").time()
    else:
        t = time(0, 0)
    return datetime.combine(date_only, t).replace(tzinfo=ZoneInfo(tz))


def extract_join_url(event: dict) -> Optional[str]:
    comment = event.get("EventComment") or ""
    match = JOIN_URL_RE.search(comment)
    return match.group(0) if match else None


def normalize_event(event: dict, body_id: str) -> dict:
    start = parse_event_datetime(event["EventDate"], event.get("EventTime"))
    return {
        "body_id": body_id,
        "title": event.get("EventBodyName") or "Meeting",
        "start_time": start.isoformat(),
        "location": event.get("EventLocation"),
        "agenda_url": event.get("EventInSiteURL"),
        "video_url": event.get("EventVideoPath"),
        "join_url": extract_join_url(event),
        "legistar_event_id": event["EventId"],
    }
