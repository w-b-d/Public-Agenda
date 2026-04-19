"""Base class for meeting-source adapters."""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Iterable, Optional


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

    # ------------------------------------------------------------------
    # People / roles — optional, platform-dependent
    # ------------------------------------------------------------------
    def list_persons(self, include_inactive: bool = False) -> Iterable[dict]:
        """Yield person records for this tenant.

        Default raises — adapters whose platform exposes roster data override.
        Each yielded dict must include:
            external_id (str)  -- stable per platform
            name (str)
        and may include:
            first_name, last_name, email, phone, photo_url, active
        """
        raise NotImplementedError(
            f"{type(self).__name__} does not expose person data"
        )

    def list_roles(self, body_ext_id: Optional[str] = None) -> Iterable[dict]:
        """Yield role records linking persons to bodies on this tenant.

        If body_ext_id is provided, filter to that body's roles only.

        Default raises — adapters whose platform exposes roster data override.
        Each yielded dict must include:
            external_id (str)     -- stable per platform
            person_ext_id (str)   -- platform's person id
            body_ext_id (str)     -- platform's body id
        and may include:
            title (str), district (str), start_date (date), end_date (date)
        """
        raise NotImplementedError(
            f"{type(self).__name__} does not expose role data"
        )
