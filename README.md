# GTVET - WEL Dashboard

Full‑stack dashboard for GTVET — WEL project. Frontend is a TypeScript + React + Vite app located in `client/`. Backend is a Node.js Express server in `server/`.

Quick start

1. Install dependencies for client and server:

```bash
cd client && npm install
cd ../server && npm install
```

2. Run client (development):

```bash
cd client
npm run dev
```

3. Run server (development):

```bash
cd server
node index.js
```

Notes

- See `client/README.md` for client-specific details.
- Add a `.env` file at the repository root or in `server/` for any secrets; `.env` is ignored by Git.

Heroku deployment

The repository is configured for a single Heroku Node.js app. Heroku installs from the root, builds the Vite client into `client/dist`, and starts the Express server, which serves both `/api/*` routes and the production SPA.

Required Heroku config vars:

```bash
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI="mongodb+srv://..."
heroku config:set JWT_SECRET="a-long-random-secret"
heroku config:set FRONTEND_URL="https://your-app-name.herokuapp.com"
heroku config:set WEB_CONCURRENCY=1
```

Optional config vars are listed in `.env.example` for SMTP, Cloudinary, Twilio WhatsApp, CORS, and rate-limit tuning.

Deploy from the repository root:

```bash
git push heroku main
```

After deployment, verify:

```bash
heroku open
heroku logs --tail
```

Contributing

Feel free to open issues or PRs. For local development follow the Quick start above.

License

Specify a license in the project root if desired.
