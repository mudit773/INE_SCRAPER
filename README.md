# Watchtower — INE Product Price Tracker

Watchtower searches INE's mock storefront, tracks selected products, checks price and stock every two hours, and keeps an honest record of successful, retried, and failed scrape attempts.

The implementation is intentionally small: a React/Vite frontend, an Express API, three Supabase tables, and Playwright for the part of the store that genuinely requires browser interaction.

> Screenshot placeholder: add a dashboard screenshot here after deployment.

## Architecture

```text
Vercel (React) -> Render (Express) -> Supabase PostgreSQL
                         |
                         +-> INE catalog/product JSON APIs
                         +-> Playwright product price reveal

cron-job.org -- every 10 minutes --> protected scrape-due endpoint
```

The cron trigger runs every ten minutes so sleeping free-tier infrastructure gets another chance after a cold-start failure. The database only claims products whose two-hour due time has arrived.

See [DESIGN.md](./DESIGN.md) for the verified storefront behavior and reliability decisions.

## Local setup

Prerequisites: Node.js 22+, npm, and a Supabase project.

```bash
npm install
npx playwright install chromium
```

Copy `.env.example` to `.env`, then fill in:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-secret
CRON_SECRET=a-long-random-secret
FRONTEND_ORIGIN=http://localhost:5173
PORT=3000
VITE_API_BASE_URL=http://localhost:3000/api
```

`SUPABASE_SECRET_KEY` is server-only. Never add it to a `VITE_` variable or Vercel's frontend environment.

Open Supabase's SQL editor and run:

```text
supabase/migrations/202609180001_initial.sql
```

Start both apps:

```bash
npm run dev
```

Frontend: <http://localhost:5173>  
Backend health: <http://localhost:3000/api/health>

## Useful commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke:store -- monitor
npm run scrape:headed -- --product 1
```

The headed command accepts the mock store's numeric product ID, opens the real storefront, performs the production interaction, and prints the validated observation. It does not write to Supabase.

## Deploy Supabase

1. Create a Supabase project.
2. Run the migration from `supabase/migrations` in the SQL editor.
3. Copy the project URL and server secret from the API settings.
4. Keep the secret for Render only. The migration enables RLS and gives browser roles no table access.

## Deploy the backend to Render

1. Push this repository to GitHub.
2. In Render, create a Blueprint from `render.yaml`, or create a Docker web service using the repository's `Dockerfile`.
3. Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `FRONTEND_ORIGIN`.
4. Keep the generated `CRON_SECRET` and copy it for cron-job.org.
5. Confirm `https://<render-service>/api/health` returns `{ "ok": true }`.

The Playwright Docker image includes Chromium and its Linux dependencies. Render's filesystem is not used for persistence.

## Deploy the frontend to Vercel

1. Import the same GitHub repository into Vercel.
2. The root `vercel.json` supplies the build command and output directory.
3. Set `VITE_API_BASE_URL=https://<render-service>/api`.
4. Deploy, then update Render's `FRONTEND_ORIGIN` to the final Vercel origin and redeploy the backend.

## Configure cron-job.org

Create one job:

- URL: `https://<render-service>/api/jobs/scrape-due`
- Method: `POST`
- Schedule: every 10 minutes
- Header: `Authorization: Bearer <CRON_SECRET>`
- Request timeout: use the largest free value available

The endpoint processes at most three products sequentially and responds only after each claimed scrape is saved.

## Testing

The normal test suite is deterministic and does not depend on the live store. It covers price and stock validation, unusual number formats, retry behavior, API validation, cron authentication, and the main frontend tracking flow.

`npm run smoke:store -- monitor` is an optional read-only check of the live catalog. The headed command is the manual live price check used for the recording.

Before submission, run several scheduled cycles in the deployed environment and inspect both `price_history` and `scrape_attempts` in Supabase.

## Free-tier limitations

- Render can sleep between requests, so the first cron call can be slow.
- The backend processes a small batch to stay inside external scheduler timeouts.
- The mock store intentionally changes prices, delays content, and sometimes fails.
- Search keeps a short in-memory catalog cache. A restart only makes the next search reload the catalog.

## Submission links

- Live site: `ADD_AFTER_VERCEL_DEPLOYMENT`
- Public repository: `ADD_AFTER_GITHUB_PUSH`
- Headed-run recording: `ADD_AFTER_RECORDING`
