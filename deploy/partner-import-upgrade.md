# Partner import upgrade

Before deploying this change, back up the target database and pause partner writes on every app instance.

With `MONGODB_URI` securely set for the target database, run from the project root:

```
node server/scripts/migrate_partner_name_uniqueness.js
```

The default is read-only. If it reports conflicting names, resolve them with the data owner; do not automatically merge or delete partners and their references.

When there are no conflicts, run:

```
node server/scripts/migrate_partner_name_uniqueness.js --apply
```

This trims existing names and creates/verifies `partner_name_ci_unique` (English collation, strength 2). Only resume partner writes after this succeeds and the new application is deployed. The previous exact-name index is retained. Future Mongoose partner writes trim names; the database index arbitrates concurrent case-variant inserts/renames.

Imports now persist batch rows before registering partners. Each Resume request processes up to ten rows, checkpointing each result. Stable row partner IDs make retry after an interrupted save safe. Reposting the same file by the same user retrieves the same batch. Closing the page pauses processing; reopen Recent saved batches to resume. Skipped rows are final for that batch; correct the CSV to create a new batch. Accounts remain a separate registration step.

Batch history retains row data and is visible only to its submitting SuperAdmin. No database migration or production deployment is performed merely by adding this code.
