"""One-off debug dump of Legistar persons + office records for a tenant.

Usage (from services/scraper/):
    python -m scraper.debug_legistar_people monterey
    python -m scraper.debug_legistar_people monterey --limit 5
    python -m scraper.debug_legistar_people monterey --include-inactive
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from datetime import date

from scraper.adapters.legistar import LegistarAdapter


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("tenant")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--include-inactive", action="store_true")
    args = parser.parse_args()

    adapter = LegistarAdapter({"tenant": args.tenant})

    print(f"\n=== persons ({args.tenant}) ===")
    persons = list(adapter.list_persons(include_inactive=args.include_inactive))
    print(f"total: {len(persons)}")
    for p in persons[: args.limit]:
        print(
            f"  [{p['external_id']}] {p['name']}"
            f"  email={p['email']!r}  phone={p['phone']!r}"
            f"  active={p['active']}"
        )

    print(f"\n=== office records ({args.tenant}) ===")
    records = list(adapter.list_roles())
    print(f"total: {len(records)}")

    today = date.today()
    current = [
        r for r in records
        if r["end_date"] is None or r["end_date"] >= today
    ]
    with_title = sum(1 for r in current if r["title"])
    by_body = Counter(r["body_ext_id"] for r in current)
    print(
        f"current (end_date null or >= today): {len(current)}  "
        f"with title: {with_title}  distinct bodies: {len(by_body)}"
    )

    print("\n-- first N current records --")
    for r in current[: args.limit]:
        print(
            f"  [{r['external_id']}] person={r['person_ext_id']} "
            f"body={r['body_ext_id']} title={r['title']!r} "
            f"{r['start_date']} → {r['end_date']}"
        )

    print("\n-- top 10 bodies by current-member count --")
    for body_id, n in by_body.most_common(10):
        print(f"  body={body_id}: {n} current members")
    return 0


if __name__ == "__main__":
    sys.exit(main())
