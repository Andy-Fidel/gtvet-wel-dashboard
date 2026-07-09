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

Render deployment

The repository is configured for a single Render Node.js web service. Render builds the Vite client into `client/dist` and starts the Express server, which serves both `/api/*` routes and the production SPA.

The included `render.yaml` Blueprint can create the web service with these commands:

- Build command: `npm run render-build`
- Start command: `npm start`
- Health check path: `/health`

Required Render environment variables:

```bash
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=a-long-random-secret
FRONTEND_URL=https://your-service-name.onrender.com
WEB_CONCURRENCY=1
```

Optional config vars are listed in `.env.example` for SMTP, Cloudinary, Twilio WhatsApp, CORS, and rate-limit tuning.

Deploy with the Blueprint:

1. Push this repository to GitHub or GitLab.
2. In Render, choose **New +** > **Blueprint**.
3. Connect the repository and select the branch to deploy.
4. Fill in the secret values requested from `render.yaml`, especially `MONGODB_URI` and `FRONTEND_URL`.
5. Apply the Blueprint.

Alternatively, create a Render web service manually:

- Runtime: Node
- Build command: `npm run render-build`
- Start command: `npm start`
- Health check path: `/health`

After deployment, verify:

```bash
curl https://your-service-name.onrender.com/health
```

Contributing

Feel free to open issues or PRs. For local development follow the Quick start above.

License

Specify a license in the project root if desired.
