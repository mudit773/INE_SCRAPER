# Design note

## What the store actually does

The storefront is a React single-page application. Its first HTML response contains no products. Product metadata comes from two same-origin JSON endpoints:

- `GET /api/catalog?page=<page>&pageSize=<size>` returns a paginated catalog. The server caps a page at 60 products.
- `GET /api/product/<id>` returns stable metadata such as name, SKU, description, specifications, and reviews.

The price is deliberately harder. A product page requires several real mouse movements over the price area, a short dwell, and a trusted click on **Reveal price**. The page then performs a challenge/token exchange. Responses sometimes fail, and the UI retries. It also rotates CSS class names through `/api/layout`, formats prices in several unusual ways, and renders hidden decoy numbers alongside the real price.

The scraper therefore uses ordinary HTTP for catalog search and metadata, and Playwright only for price and availability. This keeps search quick while preserving the real browser behavior required by the assignment.

## Extraction strategy

For a product check, Playwright:

1. Starts listening for the page's `/api/layout` response.
2. Restricts requests and redirects to `demo.inelabteamdev.com`.
3. Opens `/product/<id>` and compares the visible `h1` with metadata from `/api/product/<id>`.
4. Moves the mouse across `.price-block` twelve times over more than 600 ms.
5. Clicks the enabled reveal button and waits for `.price-success` or `.price-error`.
6. Uses the current `priceValue` and `stock` classes from the captured layout response.
7. Normalizes Indian grouping, spaces, non-breaking/zero-width characters, European separators, and full-width Unicode digits.

The scraper never reads the hidden `.price-value` or `.amount[data-price]` decoys. A missing currency, price, stock state, layout response, or matching identity fails validation and creates no history row.

## Reliability and honest logs

Each run has at most three application-level attempts. Temporary network, timeout, rate-limit, and server failures retry after approximately two and five seconds with small jitter. Permanent identity and validation failures stop immediately.

An attempt row is inserted before each scrape. A failed attempt becomes `retried` only when another attempt will start. The final failure becomes `failed`. A successful observation and its attempt status are committed in one PostgreSQL function, so the dashboard cannot show success without a matching price row.

The store's own reveal UI also retries its internal challenge. Those internal retries are part of one browser attempt; the application log measures complete page attempts.

## Scheduling and concurrency

cron-job.org calls the backend every ten minutes. PostgreSQL chooses only rows whose `next_scrape_at` is due. Successful observations set the next due time to two hours later.

`claim_due_products` uses `FOR UPDATE SKIP LOCKED` and writes a short lease in the same transaction. Two cron requests cannot claim the same row. If a process stops, the lease expires; the next call records the abandoned running attempt as interrupted and can claim the product again.

Failed runs move the next check ten minutes forward. This prevents every cron request from repeatedly hammering a temporarily broken product while still recovering before the next normal two-hour interval.

## Kept deliberately simple

- One React app, one Express app, and three PostgreSQL tables.
- No accounts: the assignment dashboard is shared.
- No Redis, queue, worker service, or in-process scheduler.
- One browser per cron batch and one product at a time.
- Search catalog cache lasts two minutes in one backend process. It is only a performance cache; PostgreSQL remains the durable source of tracked data.

## Failure classifications

| Code | Meaning | Retry |
|---|---|---|
| `STORE_NETWORK_ERROR` / `STORE_TIMEOUT` | Store could not be reached in time | Yes |
| `STORE_TEMPORARY_ERROR` | Store returned 429 or 5xx | Yes |
| `STORE_PRICE_ERROR` | The reveal flow exhausted its internal attempts | Yes |
| `LAYOUT_MISSING` | Rotating layout description was unavailable | Yes |
| `PRODUCT_NOT_FOUND` | Confirmed missing product | No |
| `PRODUCT_MISMATCH` | Page identity did not match requested product | No |
| `PRICE_INVALID` / `STOCK_INVALID` | Required value was absent or malformed | No |

## What AI got wrong initially and how it was corrected

The first architectural pass assumed ordinary selectors on a delayed product page would be enough. Inspecting the actual bundle showed a challenge/token flow, required mouse movement and dwell, rotating class names, hidden decoy prices, and deliberately varied number formatting. The implementation was changed to perform the real interaction and capture the current layout response instead of guessing selectors.

The first live smoke run also timed out. A traced second run showed each stage and completed successfully, confirming that the earlier failure was one of the store's intended intermittent cases. The retry layer remains responsible for that behavior rather than weakening validation or reading a fallback number.

The early repository plan also risked representing a final retry only. The finished schema stores a separate row for every attempt and defines exactly when an attempt becomes `retried` or `failed`.
