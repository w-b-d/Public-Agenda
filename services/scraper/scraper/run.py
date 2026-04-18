"""Config-driven scraper.

Loads jurisdiction YAML files, dispatches each body to its configured
adapter, and upserts the resulting meeting rows into Supabase.

Usage (from services/scraper/):
    python -m scraper.run                                  # all jurisdictions
    python -m scraper.run --jurisdiction monterey_county   # one
"""
from __future__ import annotations

import argparse
import os
import sys
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


def process_jurisdiction(
    supabase: Client,
    config: dict,
    start: datetime,
    end: datetime,
) -> None:
    juris_yaml = config["jurisdiction"]
    bodies_yaml = config.get("bodies", [])

    jurisdiction_id = upsert_jurisdiction(supabase, juris_yaml)
    print(f"\n== {juris_yaml['name']} ==")

    for body_yaml in bodies_yaml:
        body_id = upsert_body(supabase, jurisdiction_id, body_yaml)
        adapter_name = body_yaml.get("adapter", "manual")
        if adapter_name == "manual":
            print(f"  {body_yaml['name']}: manual (meetings via seed SQL or none yet)")
            continue
        adapter_class = ADAPTERS.get(adapter_name)
        if not adapter_class:
            print(f"  [skip] {body_yaml['name']}: unknown adapter '{adapter_name}'")
            continue

        adapter = adapter_class(body_yaml.get("config", {}))
        try:
            events = list(adapter.list_events(start, end))
        except Exception as e:
            print(f"  [error] {body_yaml['name']}: {type(e).__name__}: {e}")
            continue

        rows = [
            {**ev, "body_id": body_id, "source": adapter.source} for ev in events
        ]
        if not rows:
            print(f"  {body_yaml['name']}: 0 events in window")
            continue

        result = (
            supabase.table("meetings")
            .upsert(rows, on_conflict="body_id,source,external_id")
            .execute()
        )
        nowiso = datetime.now(timezone.utc).isoformat()
        upcoming = sum(1 for r in rows if r["start_time"] >= nowiso)
        past = len(rows) - upcoming
        print(
            f"  {body_yaml['name']}: upserted {len(result.data)} "
            f"({upcoming} upcoming, {past} past)"
        )


def upsert_jurisdiction(supabase: Client, yaml_dict: dict) -> str:
    parent_id = None
    if yaml_dict.get("parent_state"):
        parent_id = ensure_state(
            supabase, yaml_dict["parent_state"], yaml_dict["state"]
        )

    existing = (
        supabase.table("jurisdictions")
        .select("id")
        .eq("type", yaml_dict["type"])
        .eq("name", yaml_dict["name"])
        .limit(1)
        .execute()
    )
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


def upsert_body(supabase: Client, jurisdiction_id: str, yaml_dict: dict) -> str:
    existing = (
        supabase.table("bodies")
        .select("id")
        .eq("jurisdiction_id", jurisdiction_id)
        .eq("slug", yaml_dict["slug"])
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]

    row = {
        "jurisdiction_id": jurisdiction_id,
        "name": yaml_dict["name"],
        "slug": yaml_dict["slug"],
        "category": yaml_dict["category"],
    }
    result = supabase.table("bodies").insert(row).execute()
    return result.data[0]["id"]


if __name__ == "__main__":
    sys.exit(main())
