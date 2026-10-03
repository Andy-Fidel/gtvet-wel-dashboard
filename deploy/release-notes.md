# User release notes

Every deployment with a user-visible feature, improvement or fix should include
plain-language notes in `client/src/data/releases.json`, committed with the code.
The notes ship in the same app image as the feature; there is no separate service
or database migration. The installed-app refresh prompt activates the new client,
which then shows the new release announcement.

Add a new entry at the top with a **new, unique ID**, the release date, a short
title and a one-sentence summary. Reusing the previous ID will not announce a new
release to people who already read or dismissed it. Keep earlier releases so
users can return to their history. Correcting a typo can keep the existing ID.

Each change needs:

- `kind`: `New`, `Improved` or `Fixed`.
- `title`: describe the benefit in everyday words.
- `body`: explain what users can now do and any action they need to take.
- `audience`: a readable label such as `Everyone` or `Institution teams`.
- `roles` (optional): limit the default **For my role** view to the relevant roles.
- `action` (optional): a readable link label and an existing internal portal path.

Explain the user's workflow. Avoid commit hashes, file names, internal technical
details, secrets, personal data, or promises about unfinished features. Ensure
action links are accessible to every role listed for that change. All users may
read **All updates**; links to other roles' workflows are hidden.

Before deploying, run:

```sh
npm run validate:releases --prefix client
npm run build --prefix client
cd client && npm run test:releases
```

The build validates IDs, dates, ordering, content, roles and links. It cannot judge
whether the notes accurately describe the deployed changes; review them with the
feature. Users find **What’s new** in the sidebar or profile menu. They can dismiss
an announcement or mark the latest update as read without losing the history.
Reading status is stored per account in the current browser and syncs between its
tabs. Other browsers and devices may show the announcement again. If browser
storage is unavailable, dismissal still works for the current session. Inspection
mode does not change the inspected user's reading status.
