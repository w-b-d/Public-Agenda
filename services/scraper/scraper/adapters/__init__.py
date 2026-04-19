"""Adapter registry: maps the `adapter` field in YAML to a class."""
from scraper.adapters.base import MeetingAdapter
from scraper.adapters.civicclerk import CivicClerkAdapter
from scraper.adapters.ical_generic import ICalAdapter
from scraper.adapters.legistar import LegistarAdapter
from scraper.adapters.primegov import PrimeGovAdapter

ADAPTERS: dict[str, type[MeetingAdapter]] = {
    "legistar": LegistarAdapter,
    "civicclerk": CivicClerkAdapter,
    "primegov": PrimeGovAdapter,
    "ical": ICalAdapter,
}
