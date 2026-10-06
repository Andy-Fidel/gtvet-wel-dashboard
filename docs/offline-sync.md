# Offline field actions

Monitoring visit creation and updates, attendance creation and updates, support ticket creation and replies can be queued. Other writes require a connection. Drafts, queues and form options belong to the signed-in account. Only field roles can restore a recent offline session, for up to 24 hours; previously loaded learner options use the same expiry. No credential is stored, and all server requests still require authentication and current authorization.

Each supported request receives an action UUID before its first network attempt. The server claims an account-scoped receipt using MongoDB's unique primary key, and stores a minimal acknowledgement before responding. Repeating the same action returns its acknowledgement. Receipts have no TTL: expiring them would permit an old browser queue to repeat a write. This adds one collection, with no index migration required.

An interrupted operation may have saved data before its receipt was completed. Pending receipts and server failures stop automatic retry and require checking the server record. This deliberately prefers a visible unresolved action over a duplicate. An operator should inspect the corresponding record and audit log, then discard an action that is already present, or explicitly correct and resubmit work that was not saved. There is no automatic takeover of pending receipts. Notifications and audit side effects are not transactional with the domain write; a crash can still leave them incomplete.

Old queued actions without a receipt key require review because their original write result cannot be established safely. Review loads the current record for updates and retains its ID; saving a correction removes or replaces the original queue item. Opening or cancelling review leaves the original intact. Uncertain create results must be checked before resubmitting.

Queue storage changes are serialized across tabs with Web Locks where supported. Replay has a separate account lock and checks the current queue before each action. Without Web Locks, duplicate network attempts are still prevented from executing twice by server receipts, but simultaneous local storage writes across tabs cannot be guaranteed atomic. Use one tab on browsers without Web Locks.

Local data can be lost if browser storage is cleared or the device fails. Sign-out removes the offline session snapshot and keeps unsynced account queues for the next authenticated sign-in. Inspection cannot restore offline access or enqueue writes.
