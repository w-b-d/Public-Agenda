"""Legistar Web API adapter.

API docs: https://webapi.legistar.com/Help

Body-scoped config:
    tenant   -- Legistar subdomain (e.g. 'monterey' for monterey.legistar.com)
    body_name -- name of the body in Legistar (looked up to get BodyId)
    body_id  -- optional cached integer; skips the body_name lookup

Tenant-scoped config (for tenant-wide enumeration via list_all):
    tenant   -- Legistar subdomain only
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Iterable, Iterator, Optional

import requests

from scraper.adapters.base import MeetingAdapter
from scraper.normalize import extract_join_url, parse_event_datetime

BASE_URL = "https://webapi.legistar.com/v1"


def _parse_legistar_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).date()
    except ValueError:
        return None


# Granicus/Legistar seed every tenant's /Persons table with internal service
# accounts. They have no real-world identity and should never appear in the
# app. Filter by name prefix AND email domain so we catch both.
_SYSTEM_NAME_PREFIXES = (
    "daystar",
    "view only",
    "legistar system",
    "granicus",
)


def _is_system_person(name: str, email: Optional[str]) -> bool:
    low = (name or "").strip().lower()
    if any(low.startswith(p) for p in _SYSTEM_NAME_PREFIXES):
        return True
    if email and email.lower().endswith("@granicus.com"):
        return True
    return False


class LegistarAdapter(MeetingAdapter):
    source = "legistar"

    def __init__(self, config: dict):
        super().__init__(config)
        self.tenant: str = config["tenant"]
        self.body_name: Optional[str] = config.get("body_name")
        self.body_id: Optional[int] = config.get("body_id")
        self.session = requests.Session()

    # ------------------------------------------------------------------
    # HTTP helpers
    # ------------------------------------------------------------------
    def _get(self, path: str, params: Optional[dict] = None) -> list:
        resp = self.session.get(
            f"{BASE_URL}/{self.tenant}{path}", params=params, timeout=30
        )
        resp.raise_for_status()
        return resp.json()

    def _paginate(
        self,
        path: str,
        odata_filter: Optional[str] = None,
        page_size: int = 1000,
    ) -> Iterator[dict]:
        """Walk a Legistar endpoint with $top/$skip until it's exhausted.

        Legistar caps JSON responses at 1000 rows; endpoints like /Persons
        and /OfficeRecords routinely exceed that on mid-sized tenants.
        """
        skip = 0
        while True:
            params: dict = {"$top": page_size, "$skip": skip}
            if odata_filter:
                params["$filter"] = odata_filter
            batch = self._get(path, params=params)
            if not batch:
                return
            yield from batch
            if len(batch) < page_size:
                return
            skip += page_size

    def _resolve_body_id(self) -> int:
        if self.body_id:
            return self.body_id
        if not self.body_name:
            raise ValueError(
                "legistar config requires either body_id or body_name "
                "(or use tenant-wide enumeration via list_all)"
            )
        bodies = self._get("/Bodies")
        for b in bodies:
            if b.get("BodyName") == self.body_name:
                self.body_id = b["BodyId"]
                return self.body_id
        raise ValueError(
            f"Legistar body '{self.body_name}' not found in tenant '{self.tenant}'"
        )

    def _fetch_events_for_body(
        self,
        legistar_body_id: int,
        start: datetime,
        end: datetime,
    ) -> Iterator[dict]:
        filter_parts = [
            f"EventDate gt datetime'{start.strftime('%Y-%m-%dT%H:%M:%S')}'",
            f"EventDate lt datetime'{end.strftime('%Y-%m-%dT%H:%M:%S')}'",
            f"EventBodyId eq {legistar_body_id}",
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

    # ------------------------------------------------------------------
    # Adapter interface
    # ------------------------------------------------------------------
    def list_events(self, start: datetime, end: datetime) -> Iterable[dict]:
        body_id = self._resolve_body_id()
        yield from self._fetch_events_for_body(body_id, start, end)

    def list_all(
        self,
        start: datetime,
        end: datetime,
    ) -> Iterable[tuple[str, list[dict]]]:
        bodies = self._get(
            "/Bodies", params={"$filter": "BodyActiveFlag eq 1"}
        )
        for b in bodies:
            name = b.get("BodyName")
            body_id = b.get("BodyId")
            if not name or body_id is None:
                continue
            events = list(self._fetch_events_for_body(body_id, start, end))
            yield name, events

    # ------------------------------------------------------------------
    # People / roles
    # ------------------------------------------------------------------
    def list_persons(self, include_inactive: bool = False) -> Iterable[dict]:
        odata_filter = None if include_inactive else "PersonActiveFlag eq 1"
        for p in self._paginate("/Persons", odata_filter=odata_filter):
            pid = p.get("PersonId")
            name = (p.get("PersonFullName") or "").strip()
            if pid is None or not name:
                continue
            email = (p.get("PersonEmail") or "").strip() or None
            if _is_system_person(name, email):
                continue
            phone = (p.get("PersonPhone") or "").strip() or None
            yield {
                "external_id": str(pid),
                "name": name,
                "first_name": (p.get("PersonFirstName") or "").strip() or None,
                "last_name": (p.get("PersonLastName") or "").strip() or None,
                "email": email,
                "phone": phone,
                "photo_url": None,
                "active": p.get("PersonActiveFlag") == 1,
            }

    def list_roles(
        self, body_ext_id: Optional[str] = None
    ) -> Iterable[dict]:
        # OfficeRecords OData filter support is inconsistent across tenants,
        # so we fetch the full list and filter client-side.
        wanted_body_id: Optional[int] = None
        if body_ext_id is not None:
            try:
                wanted_body_id = int(body_ext_id)
            except ValueError:
                return
        for r in self._paginate("/OfficeRecords"):
            rec_id = r.get("OfficeRecordId")
            person_id = r.get("OfficeRecordPersonId")
            rec_body_id = r.get("OfficeRecordBodyId")
            if rec_id is None or person_id is None or rec_body_id is None:
                continue
            if wanted_body_id is not None and rec_body_id != wanted_body_id:
                continue
            yield {
                "external_id": str(rec_id),
                "person_ext_id": str(person_id),
                "body_ext_id": str(rec_body_id),
                "title": (r.get("OfficeRecordTitle") or "").strip() or None,
                "district": None,
                "start_date": _parse_legistar_date(r.get("OfficeRecordStartDate")),
                "end_date": _parse_legistar_date(r.get("OfficeRecordEndDate")),
            }
