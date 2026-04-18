"""Base class for meeting-source adapters."""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Iterable


class MeetingAdapter(ABC):
    """Each adapter talks to one publishing platform (Legistar, iCal, etc.)
    and yields events in our `meetings` table row shape.

    Subclasses must set `source` to a short identifier (e.g. 'legistar',
    'ical') that gets stored on each meeting row.
    """

    source: str = ""

    def __init__(self, config: dict):
        self.config = config

    @abstractmethod
    def list_events(self, start: datetime, end: datetime) -> Iterable[dict]:
        """Yield meeting rows for this body within [start, end].

        Each yielded dict must include:
            external_id (str)  -- stable per platform
            title (str)
            start_time (str)   -- ISO8601 with TZ
        and may include:
            end_time, location, agenda_url, video_url, join_url
        The dispatcher fills body_id and source.
        """
        raise NotImplementedError
