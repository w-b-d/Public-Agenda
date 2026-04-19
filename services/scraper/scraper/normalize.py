"""Shared normalization utilities used by adapters."""
from __future__ import annotations

import re
from datetime import datetime, time
from typing import Optional
from zoneinfo import ZoneInfo

# Best-effort detection of a videoconference link inside arbitrary text.
JOIN_URL_RE = re.compile(
    r"https?://\S*(?:zoom\.us|teams\.microsoft\.com|meet\.google\.com|webex\.com)\S*"
)


def parse_event_datetime(
    event_date_str: str,
    event_time_str: Optional[str],
    tz: str = "America/Los_Angeles",
) -> datetime:
    """Combine a date + optional time string into a TZ-aware datetime.

    Accepts both 12-hour ("3:00 PM") and 24-hour ("15:00") time formats,
    since Legistar tenants aren't consistent about which they return.
    """
    date_only = datetime.fromisoformat(event_date_str).date()
    if event_time_str:
        s = event_time_str.strip()
        for fmt in ("%I:%M %p", "%H:%M", "%H:%M:%S"):
            try:
                t = datetime.strptime(s, fmt).time()
                break
            except ValueError:
                continue
        else:
            t = time(0, 0)
    else:
        t = time(0, 0)
    return datetime.combine(date_only, t).replace(tzinfo=ZoneInfo(tz))


def extract_join_url(text: Optional[str]) -> Optional[str]:
    """Find a videoconference URL anywhere in the given text."""
    if not text:
        return None
    match = JOIN_URL_RE.search(text)
    return match.group(0) if match else None
