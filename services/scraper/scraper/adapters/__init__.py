"""Adapter registry: maps the `adapter` field in a YAML body config to a class."""
from scraper.adapters.base import MeetingAdapter
from scraper.adapters.ical_generic import ICalAdapter
from scraper.adapters.legistar import LegistarAdapter

ADAPTERS: dict[str, type[MeetingAdapter]] = {
    "legistar": LegistarAdapter,
    "ical": ICalAdapter,
}
