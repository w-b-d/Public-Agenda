"""Config-driven scraper.

Loads jurisdiction YAML files, dispatches each body / source to its
configured adapter, and upserts the resulting meeting rows into Supabase.

Each YAML supports two sibling keys:
- `bodies`: explicit per-body entries (used for manual entries or single-body
  scrapes). Looked up / created in `bodies` table by (jurisdiction_id, name).
- `sources`: tenant-wide enumeration. The named adapter's `list_all()`
  yields every body on the tenant; each becomes a row in `bodies`. An
  optional `name_prefix` is prepended to each enumerated body's name to
  disambiguate (e.g. "City of Salinas - " before "City Council").

Usage (from services/scraper/):
    python -m scraper.run                                  # all jurisdictions
    python -m scraper.run --jurisdiction monterey_county   # one
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml
from dotenv import load_dotenv
from supabase import Client, create_client

from scraper.adapters import ADAPTERS

WINDOW_DAYS = 90
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
    supabase: Client = create_client(supabase_url, supabase_key)

    if args.jurisdiction:
        files = [JURISDICTIONS_DIR / f"{args.jurisdiction}.yaml"]
    else:
        files = sorted(JURISDICTIONS_DIR.glob("*.yaml"))

    if not files:
        print(f"No jurisdiction YAMLs found in {JURISDICTIONS_DIR}.", file=sys.stderr)
        return 1

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=WINDOW_DAYS)
    end = now + timedelta(days=WINDOW_DAYS)

    for path in files:
        if not path.exists():
            print(f"WARN: {path} does not exist, skipping.", file=sys.stderr)
            continue
        with open(path) as f:
            config = yaml.safe_load(f)
        process_jurisdiction(supabase, config, start, end)

    return 0


# ---------------------------------------------------------------------------
# Jurisdiction processing
# ---------------------------------------------------------------------------
def process_jurisdiction(
    supabase: Client,
    config: dict,
    start: datetime,
    end: datetime,
) -> None:
    juris_yaml = config["jurisdiction"]
    bodies_yaml = config.get("bodies", []) or []
    sources_yaml = config.get("sources", []) or []

    jurisdiction_id = upsert_jurisdiction(supabase, juris_yaml)
    print(f"\n== {juris_yaml['name']} ==")

    for body_yaml in bodies_yaml:
        process_body(supabase, jurisdiction_id, body_yaml, start, end)

    for source_yaml in sources_yaml:
        process_source(supabase, jurisdiction_id, source_yaml, start, end)


def normalize_name(name: str) -> str:
    """Strip + collapse whitespace so platform-yielded names match consistently."""
    return re.sub(r"\s+", " ", name).strip()


def process_body(
    supabase: Client,
    jurisdiction_id: str,
    body_yaml: dict,
    start: datetime,
    end: datetime,
) -> None:
    """Handle a single explicit body entry."""
    name = normalize_name(body_yaml["name"])
    try:
        body_id = upsert_body(
            supabase,
            jurisdiction_id,
            name=name,
            slug=body_yaml.get("slug") or slugify(name),
            category=body_yaml["category"],
        )
    except Exception as e:
        print(f"  [error] {name}: {type(e).__name__}: {e}")
        return

    adapter_name = body_yaml.get("adapter", "manual")
    if adapter_name == "manual":
        print(f"  {name}: manual (meetings via seed SQL or none yet)")
        return
    adapter_class = ADAPTERS.get(adapter_name)
    if not adapter_class:
        print(f"  [skip] {name}: unknown adapter '{adapter_name}'")
        return

    adapter = adapter_class(body_yaml.get("config", {}))
    try:
        events = list(adapter.list_events(start, end))
    except Exception as e:
        print(f"  [error] {name}: {type(e).__name__}: {e}")
        return

    upsert_meetings(supabase, body_id, adapter.source, events, label=name)


def process_source(
    supabase: Client,
    jurisdiction_id: str,
    source_yaml: dict,
    start: datetime,
    end: datetime,
) -> None:
    """Handle a tenant-wide source: enumerate every body, upsert each."""
    adapter_name = source_yaml["adapter"]
    category = source_yaml["category"]
    name_prefix = source_yaml.get("name_prefix", "")
    label = f"{adapter_name}:{source_yaml.get('config', {}).get('tenant', '?')}"

    adapter_class = ADAPTERS.get(adapter_name)
    if not adapter_class:
        print(f"  [skip source] {label}: unknown adapter '{adapter_name}'")
        return

    adapter = adapter_class(source_yaml.get("config", {}))
    try:
        body_event_pairs = list(adapter.list_all(start, end))
    except NotImplementedError:
        print(f"  [skip source] {label}: adapter doesn't support tenant-wide enumeration")
        return
    except Exception as e:
        print(f"  [error source] {label}: {type(e).__name__}: {e}")
        return

    print(f"  source {label}: {len(body_event_pairs)} bodies")
    for body_name, events in body_event_pairs:
        full_name = normalize_name(f"{name_prefix}{body_name}")
        try:
            body_id = upsert_body(
                supabase,
                jurisdiction_id,
                name=full_name,
                slug=slugify(full_name),
                category=category,
            )
            upsert_meetings(
                supabase, body_id, adapter.source, events, label=f"    {full_name}"
            )
        except Exception as e:
            print(f"    [error] {full_name}: {type(e).__name__}: {e}")
            continue


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------
def upsert_jurisdiction(supabase: Client, yaml_dict: dict) -> str:
    parent_id = None
    if yaml_dict.get("parent_state"):
        parent_id = ensure_state(
            supabase, yaml_dict["parent_state"], yaml_dict["state"]
        )

    # Include parent_id in the lookup — otherwise two jurisdictions with
    # the same (type, name) but different parents (e.g. "Orange County"
    # in CA vs TX) would collide.
    query = (
        supabase.table("jurisdictions")
        .select("id")
        .eq("type", yaml_dict["type"])
        .eq("name", yaml_dict["name"])
    )
    if parent_id is None:
        query = query.is_("parent_id", "null")
    else:
        query = query.eq("parent_id", parent_id)
    existing = query.limit(1).execute()
    if existing.data:
        return existing.data[0]["id"]

    row = {
        "name": yaml_dict["name"],
        "state": yaml_dict["state"],
        "type": yaml_dict["type"],
        "parent_id": parent_id,
    }
    result = supabase.table("jurisdictions").insert(row).execute()
    return result.data[0]["id"]


def ensure_state(supabase: Client, state_name: str, state_code: str) -> str:
    existing = (
        supabase.table("jurisdictions")
        .select("id")
        .eq("type", "state")
        .eq("name", state_name)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]
    result = (
        supabase.table("jurisdictions")
        .insert(
            {
                "name": state_name,
                "state": state_code,
                "type": "state",
                "parent_id": None,
            }
        )
        .execute()
    )
    return result.data[0]["id"]


def upsert_body(
    supabase: Client,
    jurisdiction_id: str,
    name: str,
    slug: str,
    category: str,
) -> str:
    """Find or create a body by (jurisdiction_id, name). Returns id."""
    existing = (
        supabase.table("bodies")
        .select("id")
        .eq("jurisdiction_id", jurisdiction_id)
        .eq("name", name)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]
    row = {
        "jurisdiction_id": jurisdiction_id,
        "name": name,
        "slug": slug,
        "category": category,
    }
    result = supabase.table("bodies").insert(row).execute()
    return result.data[0]["id"]


def upsert_meetings(
    supabase: Client,
    body_id: str,
    source: str,
    events: list[dict],
    label: str,
) -> None:
    if not events:
        print(f"{label}: 0 events in window")
        return
    rows = [{**ev, "body_id": body_id, "source": source} for ev in events]
    result = (
        supabase.table("meetings")
        .upsert(rows, on_conflict="body_id,source,external_id")
        .execute()
    )
    nowiso = datetime.now(timezone.utc).isoformat()
    upcoming = sum(1 for r in rows if r["start_time"] >= nowiso)
    past = len(rows) - upcoming
    print(
        f"{label}: upserted {len(result.data)} ({upcoming} upcoming, {past} past)"
    )


# ---------------------------------------------------------------------------
# Slugify
# ---------------------------------------------------------------------------
_slug_strip = re.compile(r"[^\w\s-]")
_slug_collapse = re.compile(r"[-\s]+")


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = _slug_strip.sub("", text).strip().lower()
    text = _slug_collapse.sub("-", text)
    return text or "body"


if __name__ == "__main__":
    sys.exit(main())
