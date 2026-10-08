# Approximate town location

Partner registration and correction use one location control: actual workplace or town. Both fill `coordinates`. Town points carry `precision: Town` and `townName`; actual points carry `precision: Actual`. Old points without precision retain the actual-workplace interpretation. `approximateLocation` retains OSM attribution metadata where present. Selecting a town satisfies the coordinates requirement; the server records `TownSelected`, rather than claiming exact GPS verification. Requests, activation, edits and transfers preserve the selected precision.

Monitoring uses one server decision function for submission and pending rechecks. Actual workplaces use a 500 m radius; towns use a 5,000 m approximate radius around the selected point. This radius is a policy default, not an administrative town boundary. The chosen type, radius, town and reference coordinates are saved with each visit. Outside-area or missing-reference visits can be submitted with a location explanation for review. A mobile operating area without a fixed point keeps its existing evidence workflow; if a point is selected, the usual radius check applies.

Existing placement coordinates remain the reference snapshot; missing legacy placement points can fall back to their registered partner point or selected approximate town. Completed review decisions are not rewritten. Editing the town text clears the selected town point in the registration form; switching to actual location clears town coordinates so users can capture or enter the workplace point.

## Free OpenStreetMap lookup

This is a deliberate, application-specific town lookup using public Nominatim. No Google key or billing is needed. Follow https://operations.osmfoundation.org/policies/nominatim/:

- User-triggered searches only, no autocomplete or bulk jobs.
- At most one upstream request at a time across all app workers. MongoDB holds a shared reservation; after a request finishes, another waits at least 1.1 seconds. Busy searches return 429 instead of forming an unbounded queue. Storage failures fail closed.
- Successful searches, including no matches, are cached in MongoDB for seven days, with a TTL index. Cache keys include the configured provider and normalized query. Expired entries are ignored even before TTL cleanup.
- Identifying User-Agent and OpenStreetMap attribution. Only public towns/areas should be entered; no personal or confidential details. Ghana country restriction and settlement filtering are enforced server-side.
- Moderate usage only; public service has no uptime guarantee and access can be withdrawn. Keep manual town entry and exact GPS capture available. Move to an approved hosted provider if demand grows.

Optional protected server environment:

```
TOWN_LOOKUP_ENABLED=true
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT=GTVET-WEL/1.0 (+https://wel.gtvets.gov.gh)
```

The endpoint can be disabled or switched to a compatible HTTPS Nominatim provider by environment configuration and container recreation, without a code build. Do not disable the shared gate when changing providers. Public upstream calls have a six-second timeout and errors are redacted. Responses are no-store; only the explicitly maintained shared cache persists lookup responses. Data remains subject to OSM's ODbL licence: https://www.openstreetmap.org/copyright.

## Deployment and verification

No existing partner records are rewritten and no data migration is required. Mongoose creates the cache TTL index through its usual index initialization. Check its creation after deployment; partner approximate location is an optional field and old records remain valid. Retain existing monitoring GPS tests and verify: select/save/reload a town and check precision follows the coordinate boxes; switch to actual GPS; editing town clears its approximate point; concurrent misses cannot make parallel provider requests; repeated searches hit cache; disabled/upstream failure preserves manual entry.
