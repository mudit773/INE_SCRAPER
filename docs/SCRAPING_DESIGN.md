# Scraping Reliability — Design Note

This note explains how the scraper was made reliable, the trade-offs that shaped its
architecture, and the specific mistakes made on the first attempt and how each one was
corrected.

---

## What the mock store actually does

The storefront at `demo.inelabteamdev.com` is a React single-page application. Its
initial HTML response contains no product data. Everything is loaded client-side.

**Cheap paths (plain HTTP):**
- `GET /api/catalog?page=N&pageSize=60` — full paginated catalog, JSON
- `GET /api/product/:id` — stable metadata: name, SKU, brand, description, specs

**Expensive path (requires real browser):**
- The price on a product page is never in the page source. It is hidden behind a
  "Reveal price" button that only becomes clickable after several genuine mouse
  movements across the `.price-block` area, a short dwell, and an internal
  challenge/token exchange with the server.
- After the reveal succeeds, the price and stock text appear under CSS class names that
  **rotate on every page load**. The current class names are served from `/api/layout`
  as a JSON response that the page fetches alongside the product data.
- The page also renders hidden decoy numbers in `.price-value` and `[data-price]`
  elements. Reading those directly gives wrong values.
- Prices are formatted with inconsistent separators, non-breaking spaces, zero-width
  characters, full-width Unicode digits, and mixed Indian/European grouping styles.

---

## How the scraper was made reliable

### Hybrid HTTP + browser approach

Catalog search and product metadata use plain `fetch`. Only the price-reveal step, which
genuinely requires a real browser session, uses Playwright. This keeps the common paths
fast and avoids browser overhead everywhere it is not needed.

### Price-reveal interaction

For each product check, Playwright:

1. Intercepts the `/api/layout` response and captures the current CSS class names for
   price and stock before touching any element.
2. Blocks all requests to origins other than `demo.inelabteamdev.com` to prevent
   side-channel data from outside the store.
3. Navigates to `/product/:id` and waits for the `<h1>` heading to become visible.
4. Cross-checks the heading text against the product name from `/api/product/:id`. A
   mismatch stops the scrape immediately — it means the page redirected or the store
   served the wrong product.
5. Moves the mouse across `.price-block` in twelve steps over ~660 ms, alternating
   slightly above and below centre, to satisfy the dwell detector.
6. Clicks the reveal button (matched by accessible name: `"Reveal price"` or
   `"Try again"`).
7. Waits for `.price-success` or `.price-error`. If `.price-error` appears, the error
   is thrown as retryable — the store's own reveal flow failed, but a fresh browser
   attempt can succeed.
8. Reads price and stock using the class names from step 1.
9. Normalises the price string: strips non-breaking spaces, zero-width characters,
   currency symbols, and converts full-width digits and European decimal commas before
   parsing as a float.

### Retry logic

Three application-level attempts per product run with progressive backoff:

| Attempt | Delay before next |
|---------|------------------|
| 1 → 2   | 2 000 ms + up to 250 ms jitter |
| 2 → 3   | 5 000 ms + up to 250 ms jitter |

Not all errors are retried. Temporary failures (network errors, timeouts, HTTP 429/5xx,
price-reveal failures, missing layout) are marked retryable. Permanent failures
(404 product not found, page identity mismatch, malformed price with no digits) stop
immediately — retrying them would waste a browser session without any chance of success.

This distinction is encoded in `AppError.retryable` and checked in `withRetries()`.

### Honest attempt records

A `scrape_attempts` row is written **before** the scrape begins, not after. This
guarantees that a process crash or Render free-tier sleep mid-scrape is not silently
lost. The next cron call runs `reconcile_abandoned_attempts`, which finds any attempt
still marked `"running"` whose product lease has expired and marks it `"interrupted"`.

Status transitions are strict:
- `running` → `retried` only when another attempt is about to start
- `running` → `failed` on the final failure
- `running` → `success` only when price and stock are saved in the same PostgreSQL
  transaction via the `complete_scrape` function

It is structurally impossible for the dashboard to show a `"success"` attempt without
a matching `price_history` row.

### Scheduling without an always-on process

Render's free tier sleeps between requests. An in-process `setInterval` would stop
working the moment the process sleeps. Instead, cron-job.org calls
`POST /api/jobs/scrape-due` every ten minutes. The PostgreSQL `claim_due_products`
function checks `next_scrape_at` and only returns products that are actually due,
so the two-hour cadence is enforced at the database level regardless of how often the
external trigger fires.

`FOR UPDATE SKIP LOCKED` in the claim query means two simultaneous cron calls cannot
claim the same product. The short lease (3 minutes) expires automatically if the backend
goes down between claim and completion.

Failed scrapes push `next_scrape_at` ten minutes forward rather than two hours. This
lets the system recover from a transient store outage quickly without hammering the
store on every cron tick.

---

## Trade-offs

| Decision | Benefit | Cost |
|---|---|---|
| Playwright for price only | Satisfies the "use HTTP where possible" guideline; catalog/metadata remain fast | Cold start on each cron run costs ~2–3 s to launch Chromium |
| One browser per cron batch | Saves 2–3 s of startup per additional product | Products must run sequentially — parallelism requires more browser instances |
| External cron (cron-job.org) | No always-on process; survives free-tier sleep | Extra third-party dependency; first call after a sleep is slow |
| Lease + `SKIP LOCKED` | Safe concurrent cron calls | Additional schema complexity (lease token, lease expiry, reconcile RPC) |
| All failures recorded | Complete audit trail; nothing is silently hidden | Database grows with every failed attempt, not just successes |
| 10-minute cron, 2-hour DB guard | Handles cold start; still delivers 2-hour cadence | Slightly confusing: the external trigger does not match the visible schedule |
| No parallelism per batch | Simple, predictable | Slow if tracking many products; limit 3 per cron call |
| Shared catalog cache (2 min) | Avoids hammering store catalog on every search | Cache lives in one process — a Render restart drops it; next search reloads it |

---

## What the AI got wrong on the first attempt — and how it was corrected

### Mistake 1 — Assumed static selectors would work

**What happened:** The first implementation read price text using fixed CSS class names
(`.price-value`, `[data-price]`) scraped from a single manual inspection of the page.

**Why it was wrong:** The store rotates class names on every page load via `/api/layout`.
The elements with those static names are hidden decoys that display wrong values. The
real price is only in whichever element the current layout response says is active.

**Correction:** The scraper now intercepts the `/api/layout` network response and
uses whatever class names the store sends at that moment. Static selectors were removed
entirely.

---

### Mistake 2 — Did not account for the mouse-movement gate

**What happened:** The first pass clicked the reveal button immediately after page load.
The button was always disabled. The scrape timed out waiting for `.price-success`.

**Why it was wrong:** The store checks for genuine pointer movement across the price
area before enabling the reveal button. A programmatic `click()` without prior movement
does nothing.

**Correction:** Twelve mouse-move events are now spread across the `.price-block`
bounding box over ~660 ms before the button click. This reliably enables the button.

---

### Mistake 3 — Used `Promise.all` for catalog pagination, which failed silently

**What happened:** Loading a multi-page catalog with `Promise.all` meant a single page
returning a 503 caused the entire search to throw and return no results.

**Why it was wrong:** The mock store intentionally returns intermittent 503s. Failing
the whole search because one of fifteen catalog pages errored was too fragile.

**Correction:** Catalog pagination now uses `Promise.allSettled`. Pages that fail are
skipped; the products from successful pages are still returned. The first page (required
to know the total page count) still fails hard because without it there is nothing to
show.

---

### Mistake 4 — Only the final retry status was stored

**What happened:** The early schema stored one row per scrape run. If three attempts were
made, only the final outcome (`"failed"`) was recorded. The intermediate retries were
invisible.

**Why it was wrong:** The requirement explicitly asks to show outcomes including
`"retried"` attempts. A row that says `"failed"` with no context about what was tried
before it hides useful information.

**Correction:** A `scrape_attempts` row is now written before each individual attempt.
The schema stores `attempt_number`, `run_id`, `error_code`, `error_message`, and
`duration_ms` per attempt. Each intermediate failure is marked `"retried"`, and only
the last failure is marked `"failed"`. The dashboard shows the complete sequence.

---

### Mistake 5 — First live run timed out and was mistaken for a code bug

**What happened:** The first end-to-end run against the live store timed out at the
reveal step. The initial diagnosis was that the mouse-movement logic was still wrong.

**Why it was wrong:** The timeout was not a bug — it was the store's intended
intermittent behavior. The store deliberately delays or fails the price-reveal response
on some requests. The retry layer is supposed to handle this.

**Correction:** A second traced run completed successfully, confirming that the scraper
was correct and the first run had hit a normal store failure. No code was changed. The
lesson was to trust the retry layer for intermittent failures rather than weakening
validation timeouts to make individual runs appear to succeed faster.
