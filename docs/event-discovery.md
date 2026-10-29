# European tech events and networking

Implemented 5 October 2026. User-confirmed scope: in-person events across Europe, with Germany ranked first. No travel budget or excluded topics supplied. No paid event-data service is enabled.

## Working sources

| Platform | Connection | Default refresh | Coverage and limitations |
| --- | --- | --- | --- |
| [Developers.events](https://developers.events/) | Public `all-events.json` from the [community conference agenda](https://github.com/scraly/developers-conferences-agenda) | 24 hours | Worldwide index filtered to European venues and the next 366 days. Dates may be date-only; community listings require organizer confirmation. |
| [Confs.tech](https://confs.tech/) | [Public conference-data repository](https://github.com/tech-conferences/conference-data) | 24 hours | Current and next year; JavaScript, TypeScript, APIs, data, DevOps, general development, open source, CSS, testing. Categories deduplicate by URL/date. Missing next-year files are expected; fetch failures produce a partial run. |
| [Luma](https://luma.com/discover) | Public city pages: Berlin, Munich, London, Paris, Amsterdam, Lisbon, Barcelona, Zurich | 6 hours | Reads the public city page (normally its first 20 listings), then the public discovery listing behind it (`api.lu.ma/discover/get-paginated-events`, up to 5 pages of 50), deduplicated by event id. Added 19 October 2026: Berlin went from 20 to 48 listings. If the extended listing fails, the page selection is kept and the run message says so. Always marked limited coverage. Exact times, published price, approval and sold-out status retained when supplied. Guest/host profiles are not stored. |
| [Major League Hacking](https://www.mlh.com/) | Current academic-season public event microdata | 12 hours | European venues only. Every record flags student/recent-graduate eligibility for review. Season rolls over in July. |
| [HackTrack EU](https://github.com/lorenzopalaia/HackTrack-EU) | Published upcoming-event table | 6 hours | Community European hackathon index. Date-only ranges preserved, no invented venue times or prices. |

These are five source families and twelve independently scheduled connections. They do not cover every platform or every event on those platforms. An organizer listing is a discovery, not confirmation of participation eligibility, availability, or suitability.

## Other platforms reviewed

| Platform | Findings and next connection option |
| --- | --- |
| Meetup | [Official API access guidance](https://help.meetup.com/hc/en-us/articles/41453576628749-How-can-I-get-access-to-Meetup-s-API): active Pro plus approved OAuth client; approval is not guaranteed. No automatic adapter configured. Use manual event entry until approved access or explicit group feeds are available. |
| Eventbrite | [Official API documentation](https://www.eventbrite.com/platform/new/api): public Search Events API was discontinued in December 2019. Authorized organizer/venue access is not global discovery. No automatic adapter configured. |
| Luma subscription feeds | [Official iCal guidance](https://help.luma.com/p/ical-syncing) describes city/calendar subscriptions. Public city pages were verified for this implementation; an accessible subscription URL was not found in the current page UI. Owner API access is not substituted for global discovery. Add a supported iCal adapter when feed URLs are established. |
| Devpost | Public hackathon discovery JSON was reachable in research, but submission-window dates cannot be represented as venue attendance dates. Direct integration remains pending reliable event-date/location enrichment and pagination tests. Use manual entry now. |
| Devfolio | [Hackathon directory](https://devfolio.co/hackathons) and [official MCP guide](https://guide.devfolio.co/docs/guide/devfolio-mcp) reviewed. MCP is for participating/submitting with project context, not established global event discovery. No direct adapter. |
| DoraHacks | [Hackathon directory](https://dorahacks.io/hackathon) remains a manual discovery link; no verified broad data integration enabled. |
| ETHGlobal | [Public events page](https://ethglobal.com/events) reviewed; mixes upcoming and past listings. A direct adapter and Web3 interest control remain future work. No production Web3 expertise is inferred from attending an event. |
| FOSS.events | [European open-source event index](https://foss.events/) reviewed. Public page is available; no confirmed iCal endpoint. Direct adapter pending. Open-source conferences are also covered by the active community datasets. |
| Sessionize | [Official API documentation](https://sessionize.com/api-documentation) describes per-event schedule/speaker integration. A CFP deadline is not an event registration deadline. No discovery adapter configured. |

“Add an event” accepts published details and a public HTTPS link from any platform. It stores the supplied data without fetching arbitrary URLs. It does not automatically refresh manually entered listings.

## Matching and attendance

The matcher uses the candidate's confirmed areas: frontend/full-stack, backend/API/payments, AI and agent project work, CI/CD/cloud/developer tools, and engineering communities. Reasons are shown for each result. Germany adds a travel-priority weight, hands-on hackathons add collaboration relevance, and best-match sorting is the default. This is deterministic topic scoring, not an assessment of admission eligibility or a probability of finding a job.

Online-only and non-European venues are excluded. Hybrid events with a real European venue remain eligible. Events without usable dates or country evidence do not become travel recommendations. Unknown prices remain unknown; the free filter only includes explicit free-entry evidence from source data. Travel/accommodation costs are not estimated. Date-only events export as all-day iCalendar entries; timed entries preserve their UTC instants and display the venue timezone when supplied, otherwise Europe/Berlin is explicitly shown.

Shortlist, registered, attended and dismissed are personal states. Registration status is explicitly confirmed by the user; opening an organizer page or downloading `.ics` is not registration. Notes, number of people met, follow-up date and completion are stored in `EventPlan`. The shortlist includes past attended events and can filter for overdue follow-ups or dismissed records. Contacts are the sum of user-recorded counts on attended events, not unique identity resolution. No messages, registrations or purchases are automated.

## Scheduling and storage

`TechEvent` stores discovery data. `EventSource`, `EventListing` and `EventSourceRun` preserve provenance and sync health. Personal attendance/notes remain separate in `EventPlan`.

The existing BullMQ worker checks due sources every minute. Each source has an independent interval, enabled flag, next-run timestamp, and 15-minute lease. Queued fetches have stable source IDs; leases prevent overlap. Crashed runs recover after expiry. Failures retry after at least 30 minutes and respect HTTP Retry-After; HTTP requests have 25-second timeouts and 12 MB response limits. Network destinations are adapter constants, with redirects rejected. Luma page limits and partial conference-category failures remain visible. Existing events are never cancelled merely because they vanish from a limited feed or a request fails.

Stable source IDs preserve event plans when dates change. Matching normalized URL/date entries from different sources share a canonical record; `lu.ma` and `luma.com` aliases are normalized. Different URLs for the same conference can still produce duplicates; fuzzy automatic merging is intentionally not implemented. Date-only index data cannot overwrite a more precise schedule. This is not a complete versioned history of event changes.

Run `npm run setup` for the migration and source seed, then `npm run dev` to start the dashboard and worker. Local refreshes pause when the worker/Mac stops. Always-on hosting remains future deployment work.

```sh
npm run sync:events          # Fetch due sources once
npm run sync:events -- --force # Refresh all enabled sources now
npm test
npm run test:integration
npm run test:events:browser  # Requires the local app and database
```

Validation covers geography and relevance, source parsing, date-only ranges, calendar escaping and UTF-8 folding, duplicate imports, preservation of plans, failed-source recovery, and a browser flow using synthetic data. Browser tests never register for an event.
