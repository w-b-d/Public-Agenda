"""Base class for meeting-source adapters."""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Iterable


class MeetingAdapter(ABC):
    """Each adapter talks to one publishing platform (Legistar, iCal, etc.).

    Two modes:
    - **Body-scoped**: config names a specific body; `list_events` yields
      meetings for just that body. Used when YAML lists bodies explicitly.
    - **Tenant-scoped**: config names a tenant only; `list_all` enumerates
      every body on that tenant and yields (body_name, [meetings]) pairs.
      Used by YAML `sources` blocks for auto-enumeration.

    Subclasses must set `source` to a short identifier (e.g. 'legistar',
    'ical') that's stored on each meeting row.
    """

    source: str = ""

    def __init__(self, config: dict):
        self.config = config

    @abstractmethod
    def list_events(self, start: datetime, end: datetime) -> Iterable[dict]:
        """Yield meeting rows for ONE body within [start, end].

        Each yielded dict must include:
            external_id (str)  -- stable per platform
            title (str)
            start_time (str)   -- ISO8601 with TZ
        and may include:
            end_time, location, agenda_url, video_url, join_url
        The dispatcher fills body_id and source.
        """
        raise NotImplementedError

    def list_all(
        self,
        start: datetime,
        end: datetime,
    ) -> Iterable[tuple[str, list[dict]]]:
        """Yield (body_name, [meeting rows]) for every body on the tenant.

        Default raises — subclasses override to support tenant-wide
        enumeration. Adapters that talk to single-body sources (a generic
        iCal feed, etc.) leave this unimplemented.
        """
        raise NotImplementedError(
            f"{type(self).__name__} does not support tenant-wide enumeration"
        )
