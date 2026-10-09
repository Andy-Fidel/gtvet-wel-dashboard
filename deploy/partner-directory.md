# Institution partner directory

Institution Admins, Managers and Staff can browse the nationally approved partner registry. The directory defaults to the institution record's region (with user-region fallback for legacy records). The dropdown covers all 16 regions and All regions. Region aliases, including G. Accra, normalize to the canonical name. Sector choices include the actual recorded sectors in the selected region.

The Browse tab shows approved active partners. My submissions & changes shows the institution's own submissions and existing change queue. Linked submissions retain their existing access, but broad national browsing does not expose unrelated pending/rejected submissions. Regional and HQ review scopes remain scoped as before. Institution relationship notes and change requests are excluded from directory payloads; their existing endpoints enforce institution ownership.

Use for placement opens the existing placement form with the selected host, region, supervisor and registered location. Staff submit requests; Admin/Manager activation, learner ownership, readiness, WEL dates, duplicate prevention, capacity and recovery checks continue to apply. Cross-region placements remain owned by the learner's institution. Delegation is a separate action.

Region, search, sector and availability filters run before pagination. Availability uses approved reservations at the requested capacity date and active placements, including use by other institutions. Only the user's reserved/shared availability is returned. Cards show availability for today; placement refreshes capacity for its start date and activation checks again. Availability is a snapshot and can change while browsing.

## Deployment

No record rewrite is required. Build the new app image with deployment metadata, then install the additive nonunique partner-capacity index from that image before replacing the running container:

```
docker run --rm --env-file /etc/gtvet-wel/app.env --network gtvet-wel-web gtvet-wel-dashboard:local node /app/server/scripts/install_partner_slot_indexes.js
```

This creates `partner_active_institution` on placements (`partner, status, institution`) and ensures the existing slot-allocation indexes. It never changes records or the unique learner activation index. Reverting the app image safely leaves this additional index in place.

Verify an institution's default region, switching to another region, all-region search, accurate filtered pagination, full and reserved capacity, Staff requests and management conversion, hidden unrelated submissions, unchanged regional restrictions and the institution's own rejected-submission correction flow.
