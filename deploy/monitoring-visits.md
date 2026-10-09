# Monitoring visit selection and attendance

Learner options for `purpose=monitoring` intersect the user's monitoring scope with active, unarchived placements before applying the learner limit. Options include the placement ID and the existing location reference. Active cross-region delegations are included; unplaced learners and closed placements are excluded even when a stale learner status says Placed. Cached options without a placement reference are hidden by the form as well.

Selecting a learner refreshes browser GPS and calls the authenticated, no-store `POST /api/monitoring-visits/location-check`. This reads only; it does not create a visit or enter the offline mutation queue. The check uses the same server location decision as save, scoped to the selected learner and an active authorized placement. Requests abort when selection changes and time out after ten seconds. No GPS coordinates are put in URL query strings. Offline or unavailable prechecks are labelled unavailable; saving/syncing rechecks the current placement. Historical visit edits retain their original captured GPS and can still reference a closed placement.

Actual workplace checks retain the 500 m radius; town checks retain the approximate 5 km radius. The result checks the officer's device against a saved point; it does not establish the learner's physical presence or the exact boundary of a town. Browser GPS accuracy is displayed. Outside or missing-location references need an explanation for review.

Attendance has two form choices with a required, mutually exclusive follow-up. Present/On-time stores Present, Present/Late stores Late, Absent/Excused Yes stores Excused, and Absent/Excused No stores Absent. This preserves existing model validation, statistics, exports and historical records without migration. Drafts retain the new answer and older four-value drafts map to the matching form choices. The review table and detail screen display both attendance and its follow-up answer.

No new service or data migration is required. Verify active own/delegated options, exclusion of unplaced/closed learners, precheck authorization, Actual/Town radii, no precheck writes, save-time placement closure, and Present/Absent follow-up validation and persistence.

## GPS evidence integrity

Automatic verification requires the reading's distance plus its reported accuracy to fit inside the saved radius (500 m actual workplace, 5 km town). Missing/poor accuracy stays PendingReview as Low accuracy. Capture timestamps come from the device, are preserved through offline replay, and are never replaced by sync or edit time. Readings older than five minutes, missing timestamps, or timestamps over one minute in the future stay PendingReview as Stale GPS; offline reports can still be saved. The form asks for a fresh capture before saving an old reading.

Operating areas without a fixed reference are GPS captured / PendingReview. An institution administrator can approve an exception using the existing explanation and evidence process. Capturing GPS alone does not establish proximity to a workplace.

Report edits preserve coordinates, capture time, saved reference point, distance, verification result and administrator review. The edit API rejects replacement GPS coordinates. Automatic rechecks remain limited to pending visits after an explicit placement location correction, and audit the result. Historical results are not rewritten by this release. Device GPS and timestamps remain client evidence, not cryptographic proof of presence.
