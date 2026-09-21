# Partner corrections and institution relationships

Institution users open **Industry Partners → Request changes**. Staff submissions
go to their institution Admin/Manager for endorsement; management submissions go
directly to HQ. HQManager/SuperAdmin can approve, return with a comment, or reject.
The requester can withdraw pending requests or correct and resubmit returned ones.
One open request per institution and partner prevents duplicate submissions.

The request queue appears in the institution registry and HQ partner page. Review
shows original, current and proposed values, supporting documents, and decision
history. Approval changes only proposed fields. Changes to those fields since
submission cause a conflict; return the request so its owner can reconfirm it.
Unrelated partner edits do not block approval. Request versions prevent competing
decisions. Request approval and partner changes use one atomic MongoDB update;
capacity approvals also serialize with the existing placement operation lock.
Occupied slots, administrative status and institution linking cannot be proposed.
Existing placements, attendance, assessments and monitoring records are untouched.

**Institution details** stores that institution's contacts, liaison officer name
and notes separately. Admin/Manager can save these directly; Staff can view them.
These details never change the shared general contact fields.

Requests and relationship details are embedded in the partner document and excluded
from normal partner queries. Dedicated endpoints enforce institution and HQ scopes.
Staff see their own requests; management sees its institution's requests. Historical
requests stay accessible to the submitting institution after a region change.
Documents use authenticated server storage; replacement MoUs must be uploaded as
MoU evidence. Referenced review documents and partners with review history cannot
be deleted through the normal delete endpoints. No migration is needed for existing
partners. At very high lifetime request volumes, archive closed embedded histories
before approaching MongoDB's document-size limit.

Notifications use existing in-app/channel preferences, and decisions are recorded
in the existing audit log as well as embedded history. Notification delivery is
best-effort; the request queue is the authoritative status.

Validation:

```sh
PARTNER_MONGO_INTEGRATION=1 node --test server/tests/partnerChanges.integration.test.js
node --test server/tests/hqAccess.test.js server/tests/partnerVisibility.test.js
npm run build --prefix client
```

Integration tests require a disposable MongoDB on 127.0.0.1:27030. Each run creates
and removes only its uniquely named QA database.
