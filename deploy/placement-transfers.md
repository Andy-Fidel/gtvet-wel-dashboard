# Placement changes

Use **Edit Details** for corrections and **Change workplace** for a move. An
institution Staff, Manager or Admin can submit a transfer. Institution Managers
and Admins approve or reject it; HQ can view changes within its normal scope.

The request requires an effective date, reason, supervisor contact, coordinates
and an approved partner or verified learner-sourced request. A new learner-sourced
host can be submitted from the transfer form, verified in Placement Requests,
then selected in a transfer request. Host verification alone does not transfer a
learner. Dates must fit the published WEL window, and partner capacity is checked
again when activation takes place. Backdated transfers are rejected.

Approval for today applies immediately. Future approvals are processed every
minute by the application workers, with the existing database placement lock
serializing activation. If capacity, eligibility or permissions change, the
request remains Scheduled and displays an actionable error. Management can
cancel it and submit a corrected request. Restarting the app resumes schedules.

The original placement closes with status Terminated and closure reason
Transferred. The UI displays Transferred. The replacement links to the original;
attendance, assessments, agreements and visits remain attached to their original
placement IDs. The new employer must sign its own agreement. The liaison owner
carries over, but employer supervisor accounts and monitoring delegation do not;
review and assign these on the replacement placement.

Activation uses the recoverable placement operation journal. If a database write
fails, the next placement operation replays the prepared command before accepting
new changes. Never manually create a second replacement to work around an error.

Learner history labels records as placement episodes. Graduate exports separately
count workplace transfers and exclude them from ordinary termination counts.
Unique learner coverage continues to use learner records.

Validation: `PLACEMENT_MONGO_INTEGRATION=1 node --test
server/tests/placementTransfers.integration.test.js` uses a fresh disposable
database on local MongoDB port 27030; it never uses the production database.
