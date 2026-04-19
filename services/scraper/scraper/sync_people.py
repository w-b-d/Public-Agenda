"""Sync people + roles from jurisdiction YAMLs into Supabase.

Mirror of run.py's shape but for people/roles instead of meetings.

For each jurisdiction YAML:
  - `sources` blocks with adapter=legistar -> pull tenant persons + office
    records, upsert people, and map each role to our body by name.
  - `bodies` blocks with a `members:` list get manual roles inserted,
    source='manual'.

Other adapters (civicclerk, primegov, ical_generic) inherit the default
`list_persons` / `list_roles` from MeetingAdapter, which raises
NotImplementedError — we catch and skip them.

Usage (from services/scraper/):
    python -m scraper.sync_people                                  # all jurisdictions
    python -m scraper.sync_people --jurisdiction monterey_county   # one
"""
from __future__ import annotations

import argparse
import functools
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

# Force line-buffered output so progress prints show up in real time when
# piped or running in WSL. Without this, prints buffer until the big
# final flush at exit, which looked like a hang during the first run.
print = functools.partial(print, flush=True)  # noqa: A001

import yaml
from dotenv import load_dotenv
from supabase import Client, create_client

from scraper.adapters import ADAPTERS
from scraper.adapters.legistar import LegistarAdapter

JURISDICTIONS_DIR = Path(__file__).resolve().parent.parent / "jurisdictions"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--jurisdiction",
        help="Stem of one YAML file in jurisdictions/ to run; default is all.",
    )
    args = parser.parse_args()

    load_dotenv()
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SECRET_KEY")
    if not supabase_url or not supabase_key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in services/scraper/.env",
            file=sys.stderr,
        )
        return 1
    sb: Client = create_client(supabase_url, supabase_key)

    if args.jurisdiction:
        files = [JURISDICTIONS_DIR / f"{args.jurisdiction}.yaml"]
    else:
        files = sorted(JURISDICTIONS_DIR.glob("*.yaml"))

    for path in files:
        if not path.exists():
            print(f"WARN: {path} does not exist, skipping.", file=sys.stderr)
            continue
        with open(path) as f:
            config = yaml.safe_load(f)
        process_jurisdiction(sb, config)

    return 0


# ---------------------------------------------------------------------------
# Jurisdiction dispatch
# ---------------------------------------------------------------------------
def process_jurisdiction(sb: Client, config: dict) -> None:
    juris_yaml = config["jurisdiction"]
    name = juris_yaml["name"]
    jurisdiction_id = _find_jurisdiction_id(sb, juris_yaml)
    if not jurisdiction_id:
        print(f"\n== {name} ==  [skip] jurisdiction not in DB yet; run scraper first")
        return

    print(f"\n== {name} ==")

    total_people = 0
    total_roles = 0

    for source_yaml in config.get("sources", []) or []:
        p, r = process_source(sb, jurisdiction_id, source_yaml)
        total_people += p
        total_roles += r

    for body_yaml in config.get("bodies", []) or []:
        members = body_yaml.get("members") or []
        if not members:
            continue
        p, r = process_manual_body(sb, jurisdiction_id, body_yaml, members)
        total_people += p
        total_roles += r

    print(f"  {name}: upserted {total_people} people, {total_roles} roles")


def process_source(
    sb: Client, jurisdiction_id: str, source_yaml: dict
) -> tuple[int, int]:
    """Pull persons + roles from a tenant-wide adapter source, if supported."""
    adapter_name = source_yaml["adapter"]
    config = source_yaml.get("config", {}) or {}
    name_prefix = source_yaml.get("name_prefix", "")
    label = f"{adapter_name}:{config.get('tenant', '?')}"

    adapter_class = ADAPTERS.get(adapter_name)
    if not adapter_class:
        print(f"  [skip source] {label}: unknown adapter '{adapter_name}'")
        return 0, 0
    adapter = adapter_class(config)

    # Smoke-test capability before committing to fetch. Any adapter whose
    # platform doesn't expose person data raises NotImplementedError here.
    try:
        _probe = iter(adapter.list_persons())
    except NotImplementedError:
        return 0, 0

    if isinstance(adapter, LegistarAdapter):
        return _sync_legistar(sb, jurisdiction_id, adapter, name_prefix, label)

    # Future: dispatch to civicclerk, primegov, etc. For now, the adapter
    # interface is defined and implemented only for Legistar.
    print(f"  [skip source] {label}: people sync not implemented for this adapter yet")
    return 0, 0


# ---------------------------------------------------------------------------
# Legistar sync
# ---------------------------------------------------------------------------
def _sync_legistar(
    sb: Client,
    jurisdiction_id: str,
    adapter: LegistarAdapter,
    name_prefix: str,
    label: str,
) -> tuple[int, int]:
    source_key = f"legistar:{adapter.tenant}"

    # Build Legistar body_id -> body_name map so we can resolve roles to our
    # bodies by name. We use the full Bodies list (not just active) because
    # a role's body may have been deactivated but the role is still listed.
    print(f"  source {label}: fetching /Bodies ...")
    try:
        legistar_bodies = adapter._get("/Bodies")
    except Exception as e:
        print(f"  [error source] {label}: bodies fetch: {type(e).__name__}: {e}")
        return 0, 0
    leg_body_name_by_id: dict[str, str] = {
        str(b["BodyId"]): b.get("BodyName") or ""
        for b in legistar_bodies
        if b.get("BodyId") is not None
    }
    print(f"  source {label}: {len(leg_body_name_by_id)} bodies on tenant")

    # Persons: upsert and build ext_id -> uuid mapping.
    print(f"  source {label}: syncing persons ...")
    person_uuid_by_ext: dict[str, str] = {}
    people_upserted = 0
    try:
        for p in adapter.list_persons():
            person_uuid = _upsert_person(sb, jurisdiction_id, p, source_key)
            person_uuid_by_ext[p["external_id"]] = person_uuid
            people_upserted += 1
            if people_upserted % 50 == 0:
                print(f"    ... {people_upserted} persons upserted")
    except Exception as e:
        print(f"  [error source] {label}: list_persons: {type(e).__name__}: {e}")
        return people_upserted, 0
    print(f"  source {label}: done persons — {people_upserted} upserted")

    # Roles: resolve body by name, resolve person by ext_id, upsert.
    # Cache body lookups since the same body can appear across many roles.
    print(f"  source {label}: syncing roles ...")
    body_uuid_by_name: dict[str, Optional[str]] = {}
    roles_upserted = 0
    skipped_no_person = 0
    skipped_no_body = 0
    try:
        for r in adapter.list_roles():
            person_uuid = person_uuid_by_ext.get(r["person_ext_id"])
            if not person_uuid:
                skipped_no_person += 1
                continue
            leg_body_name = leg_body_name_by_id.get(r["body_ext_id"])
            if not leg_body_name:
                skipped_no_body += 1
                continue

            full_name = _normalize_name(f"{name_prefix}{leg_body_name}")
            if full_name not in body_uuid_by_name:
                body_uuid_by_name[full_name] = _find_body_id(
                    sb, jurisdiction_id, full_name
                )
            body_id = body_uuid_by_name[full_name]
            if not body_id:
                skipped_no_body += 1
                continue

            _upsert_role(sb, person_uuid, body_id, r, source="legistar")
            roles_upserted += 1
            if roles_upserted % 100 == 0:
                print(
                    f"    ... {roles_upserted} roles upserted"
                    f" (skipped so far: {skipped_no_person} no-person,"
                    f" {skipped_no_body} no-body)"
                )
    except Exception as e:
        print(f"  [error source] {label}: list_roles: {type(e).__name__}: {e}")
        return people_upserted, roles_upserted

    print(
        f"  source {label}: upserted {people_upserted} people, "
        f"{roles_upserted} roles "
        f"(skipped {skipped_no_person} no-person, {skipped_no_body} no-body)"
    )
    return people_upserted, roles_upserted


# ---------------------------------------------------------------------------
# Manual YAML members
# ---------------------------------------------------------------------------
def process_manual_body(
    sb: Client,
    jurisdiction_id: str,
    body_yaml: dict,
    members: list[dict],
) -> tuple[int, int]:
    body_name = _normalize_name(body_yaml["name"])
    body_id = _find_body_id(sb, jurisdiction_id, body_name)
    if not body_id:
        print(f"  [skip manual] {body_name}: body not in DB yet")
        return 0, 0

    people_upserted = 0
    roles_upserted = 0
    for m in members:
        name = (m.get("name") or "").strip()
        if not name:
            continue
        person_data = {
            "external_id": None,
            "name": name,
            "first_name": None,
            "last_name": None,
            "email": m.get("email"),
            "phone": m.get("phone"),
            "photo_url": m.get("photo_url"),
            "active": True,
        }
        person_uuid = _upsert_person(
            sb, jurisdiction_id, person_data, source_key=None
        )
        people_upserted += 1

        role_data = {
            "external_id": None,
            "person_ext_id": None,
            "body_ext_id": None,
            "title": m.get("title"),
            "district": m.get("district"),
            "start_date": _coerce_date(m.get("start_date")),
            "end_date": _coerce_date(m.get("end_date")),
        }
        _upsert_role(sb, person_uuid, body_id, role_data, source="manual")
        roles_upserted += 1

    print(f"  manual {body_name}: upserted {people_upserted} members")
    return people_upserted, roles_upserted


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------
def _upsert_person(
    sb: Client,
    jurisdiction_id: str,
    p: dict,
    source_key: Optional[str],
) -> str:
    """Upsert by (jurisdiction_id, normalized_name).

    Merge external_ids (never replace). Preserve non-null email/phone/photo/bio
    fields if the incoming value is null — a later source shouldn't blank out
    data an earlier source already supplied.
    """
    name = p["name"]
    normalized = _normalize_person_name(name)
    new_external_ids: dict = {}
    if source_key and p.get("external_id"):
        new_external_ids[source_key] = str(p["external_id"])

    existing = (
        sb.table("people")
        .select("id, name, email, phone, photo_url, bio, external_ids")
        .eq("jurisdiction_id", jurisdiction_id)
        .eq("normalized_name", normalized)
        .limit(1)
        .execute()
        .data
        or []
    )

    if existing:
        row = existing[0]
        merged_ids = {**(row.get("external_ids") or {}), **new_external_ids}
        updates: dict = {
            "external_ids": merged_ids,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if not row.get("email") and p.get("email"):
            updates["email"] = p["email"]
        if not row.get("phone") and p.get("phone"):
            updates["phone"] = p["phone"]
        if not row.get("photo_url") and p.get("photo_url"):
            updates["photo_url"] = p["photo_url"]
        sb.table("people").update(updates).eq("id", row["id"]).execute()
        return row["id"]

    insert_row = {
        "name": name,
        "normalized_name": normalized,
        "email": p.get("email"),
        "phone": p.get("phone"),
        "photo_url": p.get("photo_url"),
        "jurisdiction_id": jurisdiction_id,
        "external_ids": new_external_ids,
    }
    result = sb.table("people").insert(insert_row).execute()
    return result.data[0]["id"]


def _upsert_role(
    sb: Client,
    person_id: str,
    body_id: str,
    r: dict,
    source: str,
) -> None:
    """Upsert by (person_id, body_id, start_date).

    NULL start_date is treated as distinct by Postgres, so we look up
    explicitly with .is_ instead of relying on the unique constraint.
    """
    start = r.get("start_date")
    end = r.get("end_date")
    start_iso = start.isoformat() if isinstance(start, date) else None
    end_iso = end.isoformat() if isinstance(end, date) else None

    lookup = (
        sb.table("roles")
        .select("id")
        .eq("person_id", person_id)
        .eq("body_id", body_id)
    )
    lookup = lookup.eq("start_date", start_iso) if start_iso else lookup.is_("start_date", "null")
    existing = lookup.limit(1).execute().data or []

    row: dict = {
        "person_id": person_id,
        "body_id": body_id,
        "title": r.get("title"),
        "district": r.get("district"),
        "start_date": start_iso,
        "end_date": end_iso,
        "source": source,
        "external_id": r.get("external_id"),
    }
    if existing:
        sb.table("roles").update(row).eq("id", existing[0]["id"]).execute()
    else:
        sb.table("roles").insert(row).execute()


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _find_jurisdiction_id(sb: Client, juris_yaml: dict) -> Optional[str]:
    """Look up jurisdiction by (type, name, parent_state). Does not create."""
    parent_state = juris_yaml.get("parent_state")
    parent_id: Optional[str] = None
    if parent_state:
        r = (
            sb.table("jurisdictions")
            .select("id")
            .eq("type", "state")
            .eq("name", parent_state)
            .limit(1)
            .execute()
        )
        if not r.data:
            return None
        parent_id = r.data[0]["id"]
    q = (
        sb.table("jurisdictions")
        .select("id")
        .eq("type", juris_yaml["type"])
        .eq("name", juris_yaml["name"])
    )
    q = q.eq("parent_id", parent_id) if parent_id else q.is_("parent_id", "null")
    r = q.limit(1).execute()
    return r.data[0]["id"] if r.data else None


def _find_body_id(sb: Client, jurisdiction_id: str, name: str) -> Optional[str]:
    r = (
        sb.table("bodies")
        .select("id")
        .eq("jurisdiction_id", jurisdiction_id)
        .eq("name", name)
        .limit(1)
        .execute()
    )
    return r.data[0]["id"] if r.data else None


def _normalize_name(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _normalize_person_name(s: str) -> str:
    return _normalize_name(s).lower()


def _coerce_date(v) -> Optional[date]:
    """YAML may give us a date already or a string; accept both, reject others."""
    if v is None:
        return None
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v).date()
        except ValueError:
            return None
    return None


if __name__ == "__main__":
    sys.exit(main())
