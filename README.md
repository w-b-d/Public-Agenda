# Public Agenda

> Local government, for the people it actually governs.

Public Agenda is a free, mobile-first app that makes local government accessible to ordinary residents. It aggregates meeting schedules, agendas, and AI-generated plain-language summaries from city councils, boards of supervisors, school boards, planning commissions, and state legislative bodies — so you can see what your local government is about to decide before the decision is made.

Built during the Kelp Your Neighbor Hackathon (Apr 17–19, 2026) by Kristopher Church, Brandon Algarra, and William Brady-Diaz.

---

## Why this exists

Most local government tracking tools today are built for corporate lobbyists and government relations professionals — products like Curate Solutions and Quorum charge organizations thousands of dollars a year to monitor city council agendas, planning commission filings, and school board resolutions. The people who actually live in these communities have no comparable tool.

The result is an information asymmetry: developers, industry groups, and lobbyists know what's on next Tuesday's agenda; the residents affected usually don't, until the decision has already been made.

A handful of civic tech projects have started closing this gap — [citymeetings.nyc](https://citymeetings.nyc) for New York, [Civic Sunlight](https://civicsunlight.com) for parts of Maine, [OpenCouncil](https://github.com/schemalabz/opencouncil) for Greek municipalities — but they're fragmented, mostly single-jurisdiction, and almost all web or newsletter-first. Public Agenda aims to be the missing piece: a mobile-native, multi-jurisdiction, US-focused app that any resident can download for free.

## Who this is for

- **Engaged residents** who want to know what their local government is doing without reading 80-page agenda packets.
- **Renters, homeowners, and parents** who care about specific issues — housing policy, school board decisions, zoning near their home — and want targeted alerts when those topics appear on an agenda.
- **Newcomers to a city** who don't yet know which bodies govern them or when they meet.
- **Anyone who's ever found out about a local decision after it was already made** and wished they'd had a heads-up.


## Scope

### MVP (hackathon deliverable)

- Aggregate meeting schedules for {target government bodies in target cities} — e.g. Monterey City Council, and Monterey Board of Supervisors
- Display agendas with AI-generated plain-language summaries.
- Let users filter by address so they only see bodies that govern them.
- Let users subscribe to topics (housing, schools, transportation, etc.) and receive push notifications when those topics appear on an upcoming agenda.
- One-tap actions: add a meeting to your phone calendar, email the relevant official, share a meeting link.

### Out of scope for the hackathon

- National coverage (we're starting with {number} cities).
- State and federal legislative tracking (planned for later).
- Public comment submission directly through the app (may be added post-hackathon).
- Web companion app (mobile-first; web later if useful).
- Coverage of meeting *minutes* and archival search — we're focused on upcoming meetings and agendas, not historical research.

## Architecture

Public Agenda is a monorepo containing a mobile app, a data pipeline, and infrastructure configuration. Supabase handles the traditional "backend" concerns (database, auth, API, push-notification storage), so we can focus our effort on the parts that are actually novel: scraping fragmented government data sources and generating useful summaries from them.

### As built at the hackathon

```
 County sites (Legistar, CivicClerk,            ┌───────────────────────────┐
 PrimeGov, meeting video pages)                 │  Mobile app               │
          │                                     │  (Expo / React Native)    │
          ▼                                     └──────┬─────────────┬──────┘
 ┌──────────────────┐   meetings,    ┌──────────┐      │ reads       │ meeting chat
 │ services/scraper │ ── agendas, ─> │ Supabase │ <────┘ meetings,   │ (POST /chat)
 └──────────────────┘   video URLs   └──────────┘   summaries        ▼
                                          ▲             ┌───────────────────────────┐
                                          └──────────── │ services/ai-server        │
                                 transcripts, summaries,│ Whisper + Qwen on a Colab │
                                 attendees              │ GPU (populate_db.py)      │
                                                        └───────────────────────────┘
```

- **Mobile app → Supabase:** the app reads meetings, bodies, people, and AI summaries directly with the Supabase JS client.
- **Scraper → Supabase:** the scraper writes jurisdictions, bodies, meetings, and meeting video URLs.
- **AI server → Supabase:** `populate_db.py` sends meeting audio to the transcription server and writes the transcript, summary, and attendees back to the `meetings` row.
- **Mobile chat → AI server:** `MeetingChat` calls the chat server's `/chat` endpoint directly, using `EXPO_PUBLIC_COLAB_URL`.

See [services/ai-server/README.md](services/ai-server/README.md) for details and the Colab demo setup.

### System overview (original plan)

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  City websites   │       │  Python pipeline │       │     Supabase     │
│  (Legistar, PDFs,│ ────> │  - scraper       │ ────> │  - Postgres DB   │
│   CivicPlus...)  │       │  - LLM summarize │       │  - Auth          │
└──────────────────┘       └──────────────────┘       │  - Auto REST API │
                                                      │  - Realtime      │
                                                      └────────┬─────────┘
                                                               │
                                                               ▼
                                                      ┌──────────────────┐
                                                      │    Expo app      │
                                                      │  (React Native)  │
                                                      │  Reads directly  │
                                                      │  from Supabase   │
                                                      └──────────────────┘
```

### Repo structure

```
{app-name}/
├── apps/
│   └── mobile/          # Expo / React Native app (TypeScript)
├── services/
│   ├── scraper/         # Python pipeline: scraping + LLM summarization
│   └── ai-server/       # Transcription, summaries, and meeting chat (Colab GPU)
├── supabase/            # Supabase schema, migrations, edge functions
├── docs/                # Additional design notes and data-source research
├── .gitignore
└── README.md
```

### Tech choices

| Layer                  | Tool                          | Why                                                                                                                                 |
|------------------------|-------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| Mobile app             | Expo (React Native, TS)       | One codebase for iOS and Android. Expo Go speeds up dev. EAS Build produces real installable binaries for the demo.                 |
| Backend platform       | Supabase                      | Gives us Postgres, auth, auto-generated REST API, row-level security, and realtime subscriptions — no backend framework to write.   |
| Scraper & summarizer   | Python                        | Best ecosystem for scraping (requests, BeautifulSoup, playwright) and LLM orchestration.                                            |
| LLM                    | {Claude / GPT / TBD}          | For turning dense agenda text into plain-language summaries and extracting topic tags.                                              |
| Push notifications     | Expo Notifications            | Built into Expo, no separate service to configure.                                                                                  |

### Data flow

1. **Scrape.** A Python job pulls upcoming meeting schedules and agendas from each target jurisdiction's publishing system (Legistar, CivicPlus, Granicus, or plain-HTML city websites). Each jurisdiction may need a dedicated adapter.
2. **Normalize.** Scraped data is mapped into a consistent schema: `jurisdictions`, `bodies`, `meetings`, `agenda_items`, with foreign keys and timestamps.
3. **Summarize.** Each agenda item is passed to an LLM with a prompt that produces a plain-language summary, a list of topic tags, and (when possible) the location/address the item concerns.
4. **Store.** Normalized + summarized data is written to Supabase Postgres.
5. **Serve.** The Expo app reads from Supabase using the JS client library, authenticated via Supabase Auth.
6. **Notify.** A Supabase edge function (or a Python cron job) checks new agenda items against users' topic/location subscriptions and dispatches push notifications via the Expo push service.

### Schema sketch (high-level)

- `jurisdictions` — the city/county/district a body belongs to
- `bodies` — city council, school board, planning commission, etc.
- `meetings` — a scheduled instance of a body, with date/time/location/link
- `agenda_items` — individual items on a meeting's agenda, with raw text, summary, topic tags
- `users` — authenticated users (Supabase Auth)
- `subscriptions` — a user's tracked topics and/or address
- `notifications_sent` — audit log of what was pushed to whom, to avoid duplicates

## Getting started

### Prerequisites

- Node.js 20+ and pnpm (or npm)
- Python 3.11+
- A Supabase project (free tier is fine)
- An LLM API key ({provider})
- Expo Go installed on your phone for local testing

### Setup

```bash
# Clone and install
git clone {repo-url}
cd {app-name}

# Mobile app
cd apps/mobile
npm install
cp .env.example .env   # fill in Supabase URL + anon key
npx expo start

# Scraper
cd ../../services/scraper
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in Supabase service key + LLM API key
python -m scraper.run --city {target-city}
```

See each subdirectory's own README for more detail.



## Who built what

- **Kristopher Church**: Supabase schema and scaffolding; config-driven scraper with Legistar, CivicClerk, and PrimeGov adapters plus meeting-video URL scraping; jurisdiction configs; politician profiles; sign-in and starred events; filter by public official.
- **Brandon Algarra**: repo structure and Expo project setup; styled UI; paginated event feed, calendar, and search with autocomplete; advanced filtering; transcript view.
- **William Brady-Diaz**: AI server (Whisper transcription, Qwen summaries and attendee extraction, meeting chat); Supabase batch population scripts; in-app MeetingChat.


