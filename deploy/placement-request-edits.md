# Pending placement request edits

`PUT /api/placement-requests/:id` edits without creating placements, allocating slots or changing learner status. Institution Admin/Manager may edit pending requests in their institution; Staff may edit their own Submitted, SelfSourced_Submitted or Rejected requests. Archived, converted and already placed requests cannot be edited. Source classification, ownership, academic year and review decisions are not client-writable.

The full edit form preserves current location, workplace and supervisor details. Registered host, learners, dates and region can be corrected. A learner-found lead retains that classification; editing it resets institution verification and returns it to SelfSourced_Submitted. Saving is a separate action from management review/activation.

Changes require the current `sourceVersion` (`workflowVersion`), and run through the existing placement coordinator and durable replay mechanism. This serializes edits against activation and review; a prepared activation is recovered before a new edit can run. Repeated identical saves replay safely. Activation re-reads the request snapshot inside the coordinator and the portal submits its observed version to reject stale decisions. Backend checks ownership, readiness, active placements, dates and approved partner access. Capacity is rechecked when activating, not reserved when editing.

No migration or new service is required. Run edit permission/validation tests, the isolated database workflow test and browser save-without-activation checks. The endpoint is included in existing authenticated, CSRF-protected assignment mutation handling and audit logging.
