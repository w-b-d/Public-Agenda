"""Thin client for the Legistar Web API (v1).

Docs: https://webapi.legistar.com/Help
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

import requests

BASE_URL = "https://webapi.legistar.com/v1"


class LegistarClient:
    def __init__(self, client: str):
        self.client = client
        self.session = requests.Session()

    def _get(self, path: str, params: Optional[dict] = None) -> list:
        resp = self.session.get(
            f"{BASE_URL}/{self.client}{path}",
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def list_bodies(self) -> list[dict]:
        return self._get("/Bodies")

    def list_events(
        self,
        start: datetime,
        end: datetime,
        body_id: Optional[int] = None,
    ) -> list[dict]:
        # Legistar uses OData v3 datetime literals.
        filter_parts = [
            f"EventDate gt datetime'{start.strftime('%Y-%m-%dT%H:%M:%S')}'",
            f"EventDate lt datetime'{end.strftime('%Y-%m-%dT%H:%M:%S')}'",
        ]
        if body_id is not None:
            filter_parts.append(f"EventBodyId eq {body_id}")
        return self._get(
            "/Events",
            params={
                "$filter": " and ".join(filter_parts),
                "$orderby": "EventDate",
            },
        )
