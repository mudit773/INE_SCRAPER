# Watchtower (INE Price Tracker) — Comprehensive Project Documentation

**Repository name (npm):** `ine-price-tracker`  
**Product name (UI):** Watchtower  
**Target Storefront:** `https://demo.inelabteamdev.com/`  
**Document path:** `docs/PROJECT_DOCUMENTATION.md`  
**Documentation Version:** 1.0.0  

---

## Table of Contents

1. [Project Overview and Purpose](#1-project-overview-and-purpose)
2. [Main Features and User Workflows](#2-main-features-and-user-workflows)
3. [Complete Folder and File Structure](#3-complete-folder-and-file-structure)
4. [Purpose of Important Folders and Files](#4-purpose-of-important-folders-and-files)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [Entry Points and How the Application Starts](#7-entry-points-and-how-the-application-starts)
8. [Important Modules, Classes, Functions, and Components](#8-important-modules-classes-functions-and-components)
9. [How Data Flows Through the Application](#9-how-data-flows-through-the-application)
10. [API Endpoints](#10-api-endpoints)
11. [Database Schema, Tables, Relationships, Queries, and Migrations](#11-database-schema-tables-relationships-queries-and-migrations)
12. [External APIs, SDKs, Services, and Integrations](#12-external-apis-sdks-services-and-integrations)
13. [Authentication and Authorization Flow](#13-authentication-and-authorization-flow)
14. [Web Scraping and Automation Flow](#14-web-scraping-and-automation-flow)
15. [Configuration Files and Environment Variables](#15-configuration-files-and-environment-variables)
16. [Required Software and Dependencies](#16-required-software-and-dependencies)
17. [Installation and Local Setup Instructions](#17-installation-and-local-setup-instructions)
18. [Development, Build, Test, and Production Commands](#18-development-build-test-and-production-commands)
19. [How to Run the Project Locally](#19-how-to-run-the-project-locally)
20. [Important Assumptions, Limitations, Known Issues, and Risks](#20-important-assumptions-limitations-known-issues-and-risks)
21. [Troubleshooting](#21-troubleshooting)
22. [Architecture Diagram (Mermaid)](#22-architecture-diagram-mermaid)
23. [Request and Data-Flow Diagram (Mermaid)](#23-request-and-data-flow-diagram-mermaid)
24. [Requirement Verification & Specification Mapping](#24-requirement-verification--specification-mapping)
25. [Files Inspected and Verification Summary](#25-files-inspected-and-verification-summary)

---

## 1. Project Overview and Purpose

Watchtower is a **full-stack web application and automated price/stock tracker** built for INE's mock e-commerce storefront at `https://demo.inelabteamdev.com/`.

The application enables users to:
1. Search products from the mock store catalog by keyword, brand, or SKU.
2. Select and track products in a central PostgreSQL database (via Supabase).
3. Automate scheduled scraping runs (every 2 hours) to track price fluctuations and stock status.
4. Visualize historical price changes with interactive charts and tables.
5. Inspect complete, honest scrape audit logs recording every attempt (success, retried, or failed) along with execution timing and error diagnostics.
6. Run interactive, headed browser scrapes locally to observe scraper resilience against intentionally tricky frontend behaviors (such as dynamic CSS classes, delayed layout loading, and intermittent HTTP errors).

### Key Architectural Characteristics
- **Monorepo structure:** Built using npm workspaces (`apps/web` for React Vite frontend and `apps/api` for Node.js Express backend).
- **Hybrid scraping engine:** Combines fast, lightweight HTTP catalog fetching for search/metadata with resilient Playwright Chromium browser automation for dynamic pricing and anti-scraping challenges.
- **Sleep-resilient scheduling:** Leverages external cron triggering via HTTP webhooks with distributed PostgreSQL row-level leases (`FOR UPDATE SKIP LOCKED`) rather than an in-memory loop, perfectly accommodating serverless and sleeping hosting tiers (like Render free tier).

---

## 2. Main Features and User Workflows

### 2.1 Product Search and Selection
1. The user navigates to the dashboard and inputs a search query (minimum 2 characters) into the search bar (`apps/web/src/components/SearchBox.tsx`).
2. The frontend debounces the input by 350 ms and sends an abortable HTTP request: `GET /api/search?q=<query>`.
3. The backend (`apps/api/src/store-api.ts`) queries the mock store's `/api/catalog` (cached for 2 minutes in memory) and matches products by name, brand, category, or SKU (limited to 20 results).
4. The user clicks **"Track"** on any search result.
5. The frontend calls `POST /api/products` with `{ "sourceProductId": "123" }`.
6. The backend loads the exact product metadata from `/api/product/:id`, upserts the row into `tracked_products` with `next_scrape_at = NOW()`, and enriches it with the product image URL.

### 2.2 Product Dashboard and Status Monitoring
1. On initial load or refresh, the dashboard queries `GET /api/products`.
2. Active tracked products are displayed as cards (`apps/web/src/components/ProductCard.tsx`).
3. Each card displays:
   - Product name and thumbnail image.
   - Latest recorded price and currency (INR ₹).
   - In-stock or out-of-stock badge.
   - Status badge of the latest scrape attempt (`success`, `retried`, `failed`, or `running`).
   - Stale indicator if the latest observation is older than 3 hours.
   - Time of the next scheduled scrape run.

### 2.3 Historical Analytics and Audit Logs
1. Clicking on a product card expands the detail view (`apps/web/src/components/ProductDetail.tsx`).
2. The frontend fetches:
   - Price history: `GET /api/products/:id/history`
   - Scrape attempts: `GET /api/products/:id/attempts`
3. If more than one price point exists, an interactive Recharts SVG line chart displays the price trajectory over time.
4. A chronological observation table lists all recorded price changes, stock states, and observation timestamps.
5. A comprehensive audit log lists each scrape run attempt, showing:
   - Run timestamp and duration in milliseconds.
   - Execution trigger (`scheduled` vs `manual`).
   - Outcome status (`success`, `retried`, `failed`).
   - Error code and error diagnostic message (if any).

### 2.4 Product Untracking
1. The user clicks **"Untrack"** on a tracked product card and confirms the prompt.
2. The frontend issues `DELETE /api/products/:id`.
3. The backend sets `active = FALSE` and clears any active lease. Existing price history and attempt logs are preserved for historical record.

### 2.5 Automated Background Scraping
1. An external scheduler (e.g., cron-job.org or GitHub Actions) sends a periodic POST request to `POST /api/jobs/scrape-due` with `Authorization: Bearer <CRON_SECRET>`.
2. The backend:
   - Reconciles any stale or abandoned leases (`reconcile_abandoned_attempts`).
   - Atomically claims up to 3 due products via PostgreSQL `FOR UPDATE SKIP LOCKED`.
   - Launches a single headless Playwright browser instance.
   - Executes product scrapes sequentially with exponential backoff retries.
   - On success: records price point in `price_history`, updates attempt to `success`, sets `next_scrape_at = NOW() + 2 hours`, and releases the lease.
   - On final failure: marks attempt as `failed`, records the error code, reschedules `next_scrape_at = NOW() + 10 minutes`, and releases the lease.

---

## 3. Complete Folder and File Structure

```text
INE/
├── .github/
│   └── workflows/
│       └── checks.yml              # GitHub Actions CI workflow (lint, typecheck, test, build)
├── apps/
│   ├── api/                        # Express backend application
│   │   ├── package.json            # API dependencies and scripts
│   │   ├── tsconfig.json           # API TypeScript configuration
│   │   └── src/
│   │       ├── app.ts              # Express application factory, middleware, and route handlers
│   │       ├── app.test.ts         # Unit tests for Express API routes and auth
│   │       ├── config.ts           # Zod-validated environment configuration loader
│   │       ├── db.ts               # ProductRepository data access layer & Supabase client
│   │       ├── db.integration.test.ts # Database migration & integration lease tests
│   │       ├── errors.ts           # AppError class and error status definitions
│   │       ├── scrape-runner.ts    # Scrape execution manager and batch processor
│   │       ├── scrape-runner.test.ts # Tests for scrape runner retries and leases
│   │       ├── server.ts           # Production/development API entry point
│   │       ├── store-api.ts        # Mock store HTTP client & in-memory catalog cache
│   │       ├── store-api.test.ts   # Tests for store API helper functions
│   │       ├── types.ts            # Shared TypeScript type definitions
│   │       ├── scraper/
│   │       │   ├── parse.ts        # Price and stock regex parsers and extractors
│   │       │   ├── parse.test.ts   # Unit tests for price/stock parsing logic
│   │       │   ├── retry.ts        # Generic retry wrapper with exponential backoff
│   │       │   ├── retry.test.ts   # Unit tests for retry mechanics
│   │       │   └── store.ts        # Playwright browser automation against mock store
│   │       └── scripts/
│   │           ├── headed.ts       # CLI script to run scraper in visible headed browser
│   │           ├── production-check.ts # Automated smoke check against live deployments
│   │           └── store-smoke.ts  # CLI tool to test mock store HTTP endpoints
│   └── web/                        # React Vite frontend application
│       ├── index.html              # Frontend HTML entry template
│       ├── package.json            # Web dependencies and scripts
│       ├── tsconfig.json           # Web TypeScript configuration
│       ├── vite.config.ts          # Vite bundler configuration
│       └── src/
│           ├── main.tsx            # React DOM client root mount
│           ├── App.tsx             # Root dashboard application component
│           ├── App.test.tsx        # Frontend integration and tracking flow tests
│           ├── api.ts              # Typed HTTP client for API communication
│           ├── styles.css          # Application UI styles and responsive layouts
│           ├── test-setup.ts       # Vitest DOM matchers and test environment setup
│           ├── types.ts            # Frontend data types and interfaces
│           └── components/
│               ├── ProductCard.tsx # Individual tracked product overview card
│               ├── ProductDetail.tsx # History chart, observation table, and attempt log
│               └── SearchBox.tsx   # Debounced live search component
├── docs/
│   └── PROJECT_DOCUMENTATION.md    # Comprehensive project documentation
├── supabase/
│   └── migrations/
│       └── 202609180001_initial.sql # PostgreSQL schema, constraints, RLS, and RPC functions
├── .env.example                    # Template for required environment variables
├── .gitignore                      # Git ignore patterns
├── Dockerfile                      # Production Docker container image definition
├── eslint.config.js                # ESLint 9 configuration
├── package.json                    # Monorepo root workspace configuration
├── package-lock.json               # Locked dependency tree
├── render.yaml                     # Render Blueprint deployment specification
├── tsconfig.base.json              # Base TypeScript compiler options
├── vercel.json                     # Vercel deployment configuration
├── README.md                       # High-level repository overview and quickstart
├── DESIGN.md                       # Scraper resilience and engineering design document
├── DEVELOPMENT_SPEC.md             # Functional specification and requirements checklist
└── flow.md                         # Mermaid sequence diagrams and system flows
```

---

## 4. Purpose of Important Folders and Files

| File / Path | Purpose |
|-------------|---------|
| `apps/api/src/server.ts` | Backend startup entry point; reads configuration, initializes database repository, creates Express app, and listens on configured port. |
| `apps/api/src/app.ts` | Express application factory (`createApp`); configures Helmet security headers, CORS, body parsers, rate limiters, route registrations, and centralized error handling. |
| `apps/api/src/db.ts` | `ProductRepository` class wrapping all Supabase/PostgreSQL operations (upserting tracked items, listing, fetching history, logging attempts, calling database RPCs). |
| `apps/api/src/scraper/store.ts` | Core Playwright scraping logic; automates browser navigation, mouse movement to reveal price buttons, layout token extraction, and DOM extraction. |
| `apps/api/src/scraper/parse.ts` | Pure functions for sanitizing currency strings, extracting numerical INR values, and detecting in-stock / out-of-stock states. |
| `apps/api/src/scraper/retry.ts` | Resilient retry wrapper (`withRetries`) providing configurable attempts, exponential delay, and retryable error classification. |
| `apps/api/src/scrape-runner.ts` | Orchestrates batch scraping of due products, handles claim leases, runs retries, and coordinates atomic completions or failure releases. |
| `apps/api/src/store-api.ts` | HTTP client for searching the mock store catalog with an in-memory 2-minute TTL cache and extracting product images. |
| `apps/api/src/scripts/headed.ts` | Interactive CLI script to execute the scraper in a visible headed Chromium browser to demo scraper behavior under difficulty. |
| `apps/api/src/scripts/production-check.ts` | Health and smoke verification script to validate production CORS, endpoints, and database connectivity. |
| `apps/web/src/App.tsx` | Main React dashboard component orchestrating search, product list state, auto-refresh intervals, and product detail inspection modal. |
| `apps/web/src/api.ts` | Frontend API client communicating with the backend Express endpoints with fallback support for dev/prod environments. |
| `supabase/migrations/202609180001_initial.sql` | Complete database schema including `tracked_products`, `scrape_attempts`, `price_history`, indexes, and RPC stored procedures (`claim_due_products`, `complete_scrape`). |
| `Dockerfile` | Multi-stage production container based on Microsoft Playwright image with pre-installed Chromium and compiled API server. |
| `render.yaml` | Infrastructure-as-code Blueprint configuring the Render web service environment, health checks, and build plan. |
| `vercel.json` | Vercel deployment configuration specifying the build command, output directory, and API proxy URL. |

---

## 5. Frontend Architecture

The frontend is a modern single-page application (SPA) built with **React 19**, **TypeScript**, and **Vite 7**.

### 5.1 Structure and Component Tree
```text
index.html
└── main.tsx
    └── App.tsx (State: products, activeProduct, loading, searchResults)
        ├── SearchBox.tsx (Debounced search, abortable fetch)
        ├── ProductCard.tsx (List item, pricing summary, freshness badge)
        └── ProductDetail.tsx (Interactive Recharts graph, history table, scrape log)
```

### 5.2 Key Frontend Characteristics
- **Zero Heavy State Libraries:** Uses native React state (`useState`, `useEffect`, `useCallback`) for lean bundle size and fast rendering.
- **Abortable Live Search:** `SearchBox.tsx` utilizes `AbortController` passed to `api.search(query, { signal })` to cancel stale in-flight search requests when the user types quickly.
- **Data Visualization:** `ProductDetail.tsx` utilizes `recharts` (`ResponsiveContainer`, `LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`) to render dynamic price curves over time.
- **Environment Awareness:** `apps/web/src/api.ts` dynamically switches between `http://localhost:3000/api` in local development (`import.meta.env.DEV`) and the production Render API URL when deployed.

---

## 6. Backend Architecture

The backend is an **Express 5** RESTful API written in **TypeScript** using Node.js 22+.

### 6.1 Architectural Layers
```text
┌─────────────────────────────────────────────────────────────┐
│                    HTTP Middleware Layer                    │
│      Helmet (Security) | CORS | JSON Parser | Rate Limit    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Route Controllers                        │
│   /api/health | /api/search | /api/products | /api/jobs     │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
┌──────────────▼──────────────┐ ┌──────────────▼──────────────┐
│       Store API & Cache     │ │       Scrape Runner         │
│   HTTP Catalog (2-min TTL)  │ │   Playwright Scraper Engine │
└──────────────┬──────────────┘ └──────────────┬──────────────┘
               │                               │
┌──────────────▼───────────────────────────────▼──────────────┐
│                 Data Access Layer (db.ts)                   │
│             Supabase Client / PostgreSQL RPCs               │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Key Backend Patterns
- **Application Factory:** `createApp(config, repository)` decouples configuration and data persistence, allowing isolated unit and integration testing with mocked repositories.
- **Rate Limiting:** Protects the public API with `express-rate-limit` (60 requests/minute general limit; 15 requests/minute for mutating product track/untrack routes).
- **Zod Validation:** All query parameters, URL path parameters, and request JSON bodies are strictly validated with Zod schemas.
- **Centralized Error Handling:** Custom `AppError` classes with machine-readable error codes and HTTP status codes ensure standard error envelopes: `{ "error": { "code": "...", "message": "..." } }`.

---

## 7. Entry Points and How the Application Starts

### 7.1 Production API Server
- **Entry point:** `apps/api/src/server.ts`
- **Execution:** `node apps/api/dist/server.js` (or via Docker container `CMD ["node", "apps/api/dist/server.js"]`)
- **Lifecycle:**
  1. `readConfig()` reads and validates environment variables from `process.env` (and repo root `.env` in dev).
  2. `createRepository(SUPABASE_URL, SUPABASE_SECRET_KEY)` initializes the Supabase database connection.
  3. `createApp(config, repository)` configures Express middleware and routes.
  4. Server starts listening on `PORT` (default: 3000).

### 7.2 Development API Server
- **Command:** `npm run dev -w @tracker/api`
- **Execution:** `tsx watch src/server.ts` provides auto-reloading TypeScript execution.

### 7.3 Frontend Web Application
- **Entry point:** `apps/web/index.html` → `apps/web/src/main.tsx`
- **Development Server:** `npm run dev -w @tracker/web` launches Vite on `http://localhost:5173`.
- **Production Build:** `npm run build -w @tracker/web` compiles TypeScript and creates static assets in `apps/web/dist/`.

### 7.4 Unified Workspace Startup
- **Root Command:** `npm run dev` uses `concurrently` to launch both API (`localhost:3000`) and Web (`localhost:5173`) simultaneously.

---

## 8. Important Modules, Classes, Functions, and Components

### 8.1 Backend Modules (`apps/api/src/`)

- **`createApp(config, repository)` (`app.ts`):** Builds Express app instance with security headers, CORS, rate limits, routes, and error handlers.
- **`authorized(expectedToken, authHeader)` (`app.ts`):** Timing-safe verification of Bearer authentication tokens for protected cron endpoints.
- **`ProductRepository` (`db.ts`):** Class managing database operations:
  - `track(product)`: Upserts product into `tracked_products` with metadata and image.
  - `list()`: Retrieves active products enriched with their latest price and latest scrape attempt.
  - `claimDue(limit)`: Calls SQL RPC `claim_due_products` to claim unleased due items.
  - `complete(product, attempt, observation)`: Atomically calls SQL RPC `complete_scrape`.
  - `finishFailedAttempt(attempt, status, error)`: Updates attempt record on failure or retry.
  - `release(productId)`: Releases product lease and delays next scrape by 10 minutes.
  - `reconcile()`: Calls SQL RPC `reconcile_abandoned_attempts` to clean up crashed runs.
- **`scrapeProduct(sourceProductId, options)` (`scraper/store.ts`):** Automates Playwright to navigate to product page, simulate user mouse interaction, handle reveal buttons, and capture dynamic layout classes.
- **`withRetries(operation, options)` (`scraper/retry.ts`):** Retries asynchronous operations up to 3 times with exponential backoff while distinguishing retryable vs permanent errors.
- **`parseDisplayedPrice(text)` / `parseStock(text)` (`scraper/parse.ts`):** Extracts currency numbers and stock status from raw DOM text.
- **`searchStore(query)` / `getStoreProduct(id)` (`store-api.ts`):** Queries mock store HTTP catalog and details with in-memory caching.

### 8.2 Frontend Components (`apps/web/src/`)

- **`App` (`App.tsx`):** Root container managing state for search, product list, selected product, error alerts, and auto-refresh timers.
- **`SearchBox` (`components/SearchBox.tsx`):** Debounced search input field with live autocomplete dropdown and direct track action.
- **`ProductCard` (`components/ProductCard.tsx`):** Product card displaying thumbnail, current price, stock badge, scrape health indicator, and untrack button.
- **`ProductDetail` (`components/ProductDetail.tsx`):** Detail view with Recharts price line chart, chronological observation table, and full scrape attempt audit log.

---

## 9. How Data Flows Through the Application

### 9.1 Search and Track Data Flow
```text
User Types Query
      │
      ▼
SearchBox.tsx (Debounced 350ms)
      │  GET /api/search?q=query
      ▼
apps/api/src/app.ts
      │  searchStore(query)
      ▼
apps/api/src/store-api.ts (Checks 2-min in-memory cache)
      │  fetch("https://demo.inelabteamdev.com/api/catalog")
      ▼
Return SearchProduct[] ──► Render dropdown in SearchBox.tsx

User clicks "Track"
      │  POST /api/products { sourceProductId: "1" }
      ▼
apps/api/src/app.ts
      │  getStoreProduct("1") + repository.track(...)
      ▼
apps/api/src/db.ts
      │  INSERT INTO tracked_products ... ON CONFLICT DO UPDATE
      ▼
Supabase PostgreSQL ──► Return TrackedProduct ──► Update Dashboard
```

### 9.2 Scheduled Scrape Data Flow
```text
Cron Trigger (cron-job.org or HTTP client)
      │  POST /api/jobs/scrape-due (Bearer CRON_SECRET)
      ▼
apps/api/src/app.ts
      │  runDueScrapes(repository, 3)
      ▼
apps/api/src/scrape-runner.ts
      ├─► repository.reconcile() [RPC: reconcile_abandoned_attempts]
      ├─► repository.claimDue(3) [RPC: claim_due_products (FOR UPDATE SKIP LOCKED)]
      │
      ▼ (Launch Chromium browser)
For each claimed product:
      │  withRetries(...) ──► createAttempt() [status: running]
      │  scrapeProduct(productId) [Playwright navigation & DOM extraction]
      │
      ├── If Success:
      │     └─► repository.complete(...) [RPC: complete_scrape]
      │           ├─► INSERT INTO price_history
      │           ├─► UPDATE scrape_attempts SET status='success'
      │           └─► UPDATE tracked_products SET next_scrape_at=NOW()+2h, lease=NULL
      │
      └── If Failure:
            ├─► repository.finishFailedAttempt(...) [status: 'failed' / 'retried']
            └─► repository.release(...) [next_scrape_at=NOW()+10m, lease=NULL]
```

---

## 10. API Endpoints

All API endpoints are prefixed with `/api`. Standard responses are returned as `application/json`.

### 10.1 Public Routes (No Authentication Required)

#### `GET /api/health`
- **Description:** Health check endpoint reporting API and database connectivity status.
- **Success Response (200 OK):**
  ```json
  {
    "ok": true,
    "database": true
  }
  ```
- **Error Response (503 Service Unavailable):**
  ```json
  {
    "ok": false,
    "database": false
  }
  ```

#### `GET /api/search`
- **Description:** Search the mock store catalog by keyword, brand, category, or SKU.
- **Query Parameters:** `q` (string, 2–80 characters, required).
- **Success Response (200 OK):**
  ```json
  {
    "items": [
      {
        "id": "1",
        "name": "Wireless Noise-Canceling Headphones",
        "brand": "AudioTech",
        "category": "Electronics",
        "sku": "AUD-NC-001",
        "description": "Premium over-ear headphones with active noise cancellation."
      }
    ]
  }
  ```

#### `GET /api/products`
- **Description:** Lists all actively tracked products enriched with their latest recorded price and latest scrape attempt.
- **Success Response (200 OK):**
  ```json
  {
    "items": [
      {
        "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        "source_product_id": "1",
        "url": "https://demo.inelabteamdev.com/product/1",
        "name": "Wireless Noise-Canceling Headphones",
        "image_url": "https://demo.inelabteamdev.com/images/headphones.jpg",
        "active": true,
        "created_at": "2026-09-18T10:00:00.000Z",
        "next_scrape_at": "2026-09-18T12:00:00.000Z",
        "lease_token": null,
        "lease_until": null,
        "latestPrice": {
          "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
          "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          "attempt_id": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
          "price": 14999.00,
          "currency": "INR",
          "in_stock": true,
          "observed_at": "2026-09-18T10:00:05.000Z",
          "created_at": "2026-09-18T10:00:05.000Z"
        },
        "latestAttempt": {
          "id": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
          "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          "run_id": "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
          "attempt_number": 1,
          "trigger": "scheduled",
          "started_at": "2026-09-18T10:00:01.000Z",
          "finished_at": "2026-09-18T10:00:05.000Z",
          "status": "success",
          "error_code": null,
          "error_message": null,
          "duration_ms": 4120
        }
      }
    ]
  }
  ```

#### `POST /api/products`
- **Description:** Adds a product from the mock store to tracking.
- **Request Body:**
  ```json
  {
    "sourceProductId": "1"
  }
  ```
- **Success Response (201 Created):** Returns the newly created/updated `TrackedProduct` object.

#### `GET /api/products/:id`
- **Description:** Retrieves metadata for a single tracked product by internal UUID.
- **Success Response (200 OK):** Returns `TrackedProduct` object with `latestPrice` and `latestAttempt`.

#### `DELETE /api/products/:id`
- **Description:** Untracks a product by setting `active = FALSE` and releasing any active lease.
- **Success Response (204 No Content):** Empty body.

#### `GET /api/products/:id/history`
- **Description:** Fetches historical price and stock records for a tracked product.
- **Query Parameters:**
  - `limit` (integer, 1–200, default: 50).
  - `before` (ISO 8601 timestamp string, optional pagination cursor).
- **Success Response (200 OK):**
  ```json
  {
    "items": [
      {
        "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
        "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        "attempt_id": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
        "price": 14999.00,
        "currency": "INR",
        "in_stock": true,
        "observed_at": "2026-09-18T10:00:05.000Z",
        "created_at": "2026-09-18T10:00:05.000Z"
      }
    ]
  }
  ```

#### `GET /api/products/:id/attempts`
- **Description:** Fetches scrape attempt audit records for a tracked product.
- **Query Parameters:** `limit` (1–200, default: 50), `before` (ISO 8601 string, optional).
- **Success Response (200 OK):**
  ```json
  {
    "items": [
      {
        "id": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
        "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        "run_id": "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
        "attempt_number": 1,
        "trigger": "scheduled",
        "started_at": "2026-09-18T10:00:01.000Z",
        "finished_at": "2026-09-18T10:00:05.000Z",
        "status": "success",
        "error_code": null,
        "error_message": null,
        "duration_ms": 4120
      }
    ]
  }
  ```

---

### 10.2 Protected Routes (Requires Header `Authorization: Bearer <CRON_SECRET>`)

#### `POST /api/jobs/scrape-due`
- **Description:** Batch worker endpoint that claims due products and executes scheduled scrapes.
- **Success Response (200 OK):**
  ```json
  {
    "processed": 1,
    "results": [
      {
        "productId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        "ok": true,
        "attempts": 1
      }
    ]
  }
  ```

#### `POST /api/products/:id/scrape`
- **Description:** Manually triggers an immediate scrape for a single product.
- **Success Response (200 OK):** Returns `{ "productId": "...", "ok": true, "attempts": 1 }`.
- **Busy Conflict (409 Conflict):** Returns error if product is currently leased by another scrape worker.

---

### 10.3 Standard Error Format
All errors follow a unified structure:
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Validation failed: 'q' must be at least 2 characters."
  }
}
```

Common Error Codes:
- `INVALID_REQUEST` (400): Malformed query, invalid UUID, or invalid body payload.
- `UNAUTHORIZED` (401): Missing or invalid Bearer token on protected routes.
- `NOT_FOUND` (404): Route or product ID does not exist.
- `PRODUCT_BUSY` (409): Product currently locked under an active lease.
- `STORE_TIMEOUT` / `STORE_NETWORK_ERROR` (502): Target mock store unreachable or timed out.
- `PRICE_INVALID` / `PRODUCT_MISMATCH` (502): Scraped page content failed structural validation.
- `INTERNAL_ERROR` (500): Unhandled backend server exception.

---

## 11. Database Schema, Tables, Relationships, Queries, and Migrations

The database is PostgreSQL hosted on **Supabase**. The complete schema is defined in `supabase/migrations/202609180001_initial.sql`.

### 11.1 Entity-Relationship Diagram

```mermaid
erDiagram
    TRACKED_PRODUCTS ||--o{ SCRAPE_ATTEMPTS : "has many"
    TRACKED_PRODUCTS ||--o{ PRICE_HISTORY : "has many"
    SCRAPE_ATTEMPTS ||--o| PRICE_HISTORY : "produces on success"

    TRACKED_PRODUCTS {
        uuid id PK
        text source_product_id UK
        text url
        text name
        text image_url
        boolean active
        timestamptz created_at
        timestamptz next_scrape_at
        text lease_token
        timestamptz lease_until
    }

    SCRAPE_ATTEMPTS {
        uuid id PK
        uuid product_id FK
        uuid run_id
        int attempt_number
        text trigger
        timestamptz started_at
        timestamptz finished_at
        text status
        text error_code
        text error_message
        int duration_ms
    }

    PRICE_HISTORY {
        uuid id PK
        uuid product_id FK
        uuid attempt_id FK,UK
        numeric price
        char3 currency
        boolean in_stock
        timestamptz observed_at
        timestamptz created_at
    }
```

### 11.2 Tables and Indexes

#### 1. `tracked_products`
- `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Internal unique identifier.
- `source_product_id` (`TEXT NOT NULL UNIQUE`): Mock store product identifier (digits).
- `url` (`TEXT NOT NULL`): Full product URL; constrained to mock store origin via `CHECK (url ~ '^https://demo\.inelabteamdev\.com/product/[0-9]+$')`.
- `name` (`TEXT NOT NULL`): Product title.
- `image_url` (`TEXT`): Optional thumbnail image URL.
- `active` (`BOOLEAN NOT NULL DEFAULT true`): Whether automated tracking is active.
- `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`): Record creation timestamp.
- `next_scrape_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`): Scheduled timestamp for the next scrape run.
- `lease_token` (`TEXT`): UUID lease identifier for concurrent worker locking.
- `lease_until` (`TIMESTAMPTZ`): Lease expiration timestamp.
- **Indexes:** `idx_tracked_products_active_next_scrape` on `(active, next_scrape_at)` where `active = true`.

#### 2. `scrape_attempts`
- `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Unique attempt record identifier.
- `product_id` (`UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE`): Tracked product foreign key.
- `run_id` (`UUID NOT NULL`): Groups retried attempts belonging to the same scrape session.
- `attempt_number` (`INTEGER NOT NULL CHECK (attempt_number >= 1)`): Attempt counter (1, 2, 3).
- `trigger` (`TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual'))`): How the run was initiated.
- `started_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`): When attempt began.
- `finished_at` (`TIMESTAMPTZ`): When attempt concluded.
- `status` (`TEXT NOT NULL CHECK (status IN ('running', 'success', 'retried', 'failed'))`): Outcome status.
- `error_code` (`TEXT`): Standardized error code on failure.
- `error_message` (`TEXT`): Diagnostic error details.
- `duration_ms` (`INTEGER`): Execution duration in milliseconds.
- **Indexes:** `idx_scrape_attempts_product_started` on `(product_id, started_at DESC)`.

#### 3. `price_history`
- `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Unique observation identifier.
- `product_id` (`UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE`): Tracked product foreign key.
- `attempt_id` (`UUID UNIQUE REFERENCES scrape_attempts(id) ON DELETE SET NULL`): Links observation to the specific successful attempt.
- `price` (`NUMERIC(10, 2) NOT NULL CHECK (price >= 0)`): Scraped product price in INR.
- `currency` (`CHAR(3) NOT NULL DEFAULT 'INR'`): ISO 4217 currency code.
- `in_stock` (`BOOLEAN NOT NULL`): Availability flag.
- `observed_at` (`TIMESTAMPTZ NOT NULL`): Timestamp when price was observed.
- `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`): Database insert timestamp.
- **Indexes:** `idx_price_history_product_observed` on `(product_id, observed_at DESC)`.

### 11.3 Stored Procedures (RPC Functions)

- **`claim_due_products(p_limit INT, p_lease_seconds INT)`:**
  Selects up to `p_limit` active products whose `next_scrape_at <= NOW()` and whose lease is null or expired. Uses PostgreSQL `FOR UPDATE SKIP LOCKED` to guarantee zero lock contention and zero duplicate scrapes between concurrent workers.
- **`claim_product(p_product_id UUID, p_lease_seconds INT)`:**
  Atomically claims a single specific product for immediate manual scrape.
- **`complete_scrape(p_product_id UUID, p_attempt_id UUID, p_price NUMERIC, p_currency TEXT, p_in_stock BOOLEAN, p_observed_at TIMESTAMPTZ, p_interval_minutes INT)`:**
  Transactional function that:
  1. Inserts observation into `price_history`.
  2. Updates `scrape_attempts` to status `'success'`, calculates `duration_ms`, and sets `finished_at`.
  3. Updates `tracked_products` setting `next_scrape_at = p_observed_at + interval '2 hours'`, clearing `lease_token` and `lease_until`.
- **`reconcile_abandoned_attempts()`:**
  Detects any scrape attempts left in `'running'` status whose product lease has expired, marking them as `'failed'` with error code `'ABANDONED_LEASE'`.

---

## 12. External APIs, SDKs, Services, and Integrations

| External Service | Role and Integration Method |
|------------------|-----------------------------|
| **Mock Storefront (`demo.inelabteamdev.com`)** | Target e-commerce store. Integrated via: (1) HTTP REST calls to `/api/catalog` and `/api/product/:id`, and (2) Headless Playwright Chromium automation navigating `/product/:id` and querying dynamic `/api/layout` styling endpoints. |
| **Supabase PostgreSQL** | Cloud database persistence. Integrated via `@supabase/supabase-js` client in `apps/api/src/db.ts` utilizing service role key for backend-only database access. |
| **Playwright Chromium** | Headless and headed browser automation engine (`playwright` package) used to render, interact with, and scrape the mock storefront. |
| **Vercel** | Hosting platform for the React Vite static frontend web application (`apps/web`). |
| **Render** | Dockerized hosting platform for the Express Node.js API backend (`apps/api`). |
| **cron-job.org / GitHub Actions** | External scheduler that invokes `POST /api/jobs/scrape-due` every 10–30 minutes to wake sleeping instances and trigger due scrapes. |

---

## 13. Authentication and Authorization Flow

### 13.1 Security Architecture
```mermaid
flowchart LR
    Browser[Web Browser User] -->|No Login Required| PublicAPI["Public API Routes (/api/products, /api/search)"]
    PublicAPI -->|Rate Limited 60 req/min| Express[Express Backend]
    
    Cron[External Cron / Admin] -->|Bearer CRON_SECRET| ProtectedAPI["Protected Jobs (/api/jobs/scrape-due)"]
    ProtectedAPI --> Express
    
    Express -->|SUPABASE_SECRET_KEY (Service Role)| Postgres[(Supabase PostgreSQL)]
    Browser -.->|No Direct Access (RLS Denied)| Postgres
```

### 13.2 Authorization Rules
1. **Public Web Users:** No authentication required. Visitors can search catalog items, track products, untrack products, and view price history.
2. **Protected Scrape Endpoints:** `POST /api/jobs/scrape-due` and `POST /api/products/:id/scrape` require an `Authorization: Bearer <CRON_SECRET>` header.
3. **Constant-Time Verification:** The backend uses `crypto.timingSafeEqual` in `apps/api/src/app.ts` (`authorized` function) to prevent timing-attack vulnerabilities when comparing tokens.
4. **Database Security (RLS):** Row Level Security (RLS) is enabled on all tables (`tracked_products`, `scrape_attempts`, `price_history`). Public `anon` and `authenticated` access is revoked; only the backend's `service_role` can query and mutate data.

---

## 14. Web Scraping and Automation Flow

The scraping engine is designed to overcome specific intentional obstacles in INE's mock storefront.

### 14.1 Mock Store Challenges and Countermeasures

| Store Obstacle | How the Engine Handles It | Source Reference |
|----------------|---------------------------|------------------|
| **Delayed / Hidden Price Button** | Moves mouse across `.price-block` to simulate human presence, waits for reveal button (`button.price-reveal-btn, [data-testid="reveal-price"]`), clicks it, and waits for price to resolve. | `apps/api/src/scraper/store.ts` |
| **Dynamic / Shuffled CSS Classes** | Intercepts `/api/layout` response to extract dynamically generated layout tokens and CSS class names for price and stock elements. | `apps/api/src/scraper/store.ts` |
| **Simulated Network Errors / 500s** | Wrapped with `withRetries` (up to 3 attempts) using exponential backoff (2s, 5s delays). Every attempt is logged in `scrape_attempts`. | `apps/api/src/scraper/retry.ts` |
| **Product Name Mismatch** | Validates the scraped `<h1>` title against expected store metadata before accepting extracted data. | `apps/api/src/scraper/store.ts` |
| **Currency & Number Formatting** | Robust regex parser extracts numerical INR values from formats like `₹ 14,999.00`, `Rs. 14999`, or `14999 INR`. | `apps/api/src/scraper/parse.ts` |
| **Resource Isolation & Origin Guard** | Aborts requests to third-party domains, tracking scripts, and unnecessary media to maintain fast, predictable scrape execution. | `apps/api/src/scraper/store.ts` |

### 14.2 Scrape Lifecycle Sequence
1. Scraper calls `getStoreProduct(sourceProductId)` via fast HTTP to obtain product name baseline.
2. Creates an attempt row in `scrape_attempts` with status `'running'`.
3. Opens Chromium page navigating to `https://demo.inelabteamdev.com/product/<id>`.
4. Asserts `h1` matches expected product name (throws `PRODUCT_MISMATCH` if altered).
5. Interacts with reveal trigger and waits for `.price-value, [data-testid="price-value"]`.
6. Extracts price string and stock status string.
7. Parses price through `parseDisplayedPrice` and stock through `parseStock`.
8. Saves data atomically via `complete_scrape` stored procedure.

---

## 15. Configuration Files and Environment Variables

### 15.1 Configuration Files Overview
- `.env.example`: Template listing all environment variables.
- `apps/api/src/config.ts`: Loads variables using Zod schema validation; halts startup if required variables are missing or malformed.
- `apps/web/vite.config.ts`: Configures Vite dev server and proxy rules.
- `vercel.json`: Configures Vercel frontend build output.
- `render.yaml`: Infrastructure definition for Render web service.

### 15.2 Environment Variables Reference

| Variable Name | Required? | Location | Description |
|---------------|-----------|----------|-------------|
| `PORT` | Optional (default: `3000`) | Backend | Port on which the Express server listens. |
| `SUPABASE_URL` | **Required** | Backend | Full HTTPS URL of the Supabase project. |
| `SUPABASE_SECRET_KEY` | **Required** | Backend | Supabase Service Role Secret Key (minimum 20 characters). |
| `CRON_SECRET` | **Required** | Backend | Secret bearer token required to invoke `/api/jobs/scrape-due` (minimum 16 characters). |
| `FRONTEND_ORIGIN` | Optional | Backend | Allowed CORS origin (e.g. `https://ine-price-tracker-mauve.vercel.app` or `http://localhost:5173`). |
| `VITE_API_BASE_URL` | Optional | Frontend | Base URL of backend API (e.g. `https://ine-price-tracker-api-vfq3.onrender.com/api`). |

> [!CAUTION]
> Never put `SUPABASE_SECRET_KEY` into frontend environment variables or client builds (`VITE_*`). Only the backend needs direct database credentials.

---

## 16. Required Software and Dependencies

### 16.1 System Prerequisites
- **Node.js:** Version 22.0.0 or higher.
- **npm:** Version 10.0.0 or higher (with workspaces support).
- **Playwright Chromium:** Browser binaries installed via `npx playwright install chromium`.
- **Supabase Account / Instance:** PostgreSQL database with migration `202609180001_initial.sql` applied.

### 16.2 Major Dependencies

#### Backend (`apps/api/package.json`)
- `express` (v5.x): Web server framework.
- `playwright` (v1.63.x): Headless browser automation.
- `@supabase/supabase-js` (v2.57.x): Supabase database client.
- `zod` (v4.x): Type-safe schema validation.
- `helmet` (v8.x): HTTP security header middleware.
- `cors` (v2.8.x): Cross-Origin Resource Sharing.
- `express-rate-limit` (v8.x): IP-based rate limiting.

#### Frontend (`apps/web/package.json`)
- `react` / `react-dom` (v19.x): UI rendering engine.
- `recharts` (v3.x): SVG charts and data visualization.
- `vite` (v7.x): Development server and production bundler.
- `vitest` (v3.x) & `@testing-library/react`: Unit and integration testing.

---

## 17. Installation and Local Setup Instructions

Follow these step-by-step instructions to set up the repository from scratch:

### Step 1: Clone Repository and Install Dependencies
```bash
git clone <repository-url>
cd INE
npm install
```

### Step 2: Install Playwright Chromium Browser
```bash
npx playwright install chromium
```

### Step 3: Configure Environment Variables
Create a `.env` file at the root of the repository by copying `.env.example`:
```bash
cp .env.example .env
```
Populate `.env` with your Supabase and secret keys:
```env
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-service-role-secret-key-min-20-chars
CRON_SECRET=your-secure-cron-secret-min-16-chars
FRONTEND_ORIGIN=http://localhost:5173
```

### Step 4: Run Database Migration
Open your Supabase SQL Editor and execute the SQL migration script located at:
`supabase/migrations/202609180001_initial.sql`

---

## 18. Development, Build, Test, and Production Commands

All commands are run from the monorepo root:

| Command | Action |
|---------|--------|
| `npm run dev` | Runs both backend API and frontend Vite dev servers concurrently. |
| `npm test` | Executes all Vitest unit and integration test suites across both workspaces. |
| `npm run lint` | Runs ESLint across all TypeScript and React source files. |
| `npm run typecheck` | Executes TypeScript type checking (`tsc --noEmit`) for API and Web. |
| `npm run build` | Compiles backend TypeScript to `apps/api/dist` and builds frontend Vite bundle to `apps/web/dist`. |
| `npm run scrape:headed -- --product <id>` | Runs scraper in a visible headed Chromium browser to observe real-time page interactions. |
| `npm run smoke:store -- [query]` | Tests live mock store HTTP connectivity and catalog endpoints. |
| `npm run production:check` | Verifies deployed production API health, search, and CORS preflight. |
| `npm run start -w @tracker/api` | Starts the compiled production API server. |

---

## 19. How to Run the Project Locally

1. Complete the setup in [Section 17](#17-installation-and-local-setup-instructions).
2. Start development servers:
   ```bash
   npm run dev
   ```
3. Open your browser:
   - **Frontend UI:** `http://localhost:5173`
   - **Backend API Health:** `http://localhost:3000/api/health`
4. Search for a product (e.g. `"Headphones"`) and click **Track**.
5. Manually trigger a scrape run for due items:
   ```bash
   curl -X POST "http://localhost:3000/api/jobs/scrape-due" \
     -H "Authorization: Bearer your-secure-cron-secret-min-16-chars"
   ```
6. Observe the product price update and scrape attempt log in the UI dashboard!

---

## 20. Important Assumptions, Limitations, Known Issues, and Risks

### 20.1 Assumptions
- **Single Global Tenant:** The dashboard is open and shared; all tracked products are visible to all visitors.
- **Mock Store Domain:** The scraper strictly targets `https://demo.inelabteamdev.com/` and validates origins to avoid accidental scraping of third-party websites.

### 20.2 Limitations and Known Behaviors
- **Batch Processing Limit:** `POST /api/jobs/scrape-due` processes a maximum of 3 products per invocation to avoid HTTP timeouts on serverless/free-tier proxies.
- **Render Free Tier Sleep:** The free tier of Render puts the API to sleep after 15 minutes of inactivity. The first request after sleep may take ~30–50 seconds to respond.
- **In-Memory Catalog Cache:** The mock store catalog search cache has a 2-minute TTL stored in process memory.

### 20.3 Operational Risks
- **Mock Store Layout Shifts:** If the mock store modifies its HTML structure beyond the current dynamic layout tokens, price extraction will fail. The scraper honestly logs these as `PRICE_INVALID` or `STORE_LAYOUT_CHANGED` failures in the database.

---

## 21. Troubleshooting

| Symptom / Error | Probable Cause | Resolution |
|-----------------|----------------|------------|
| `GET /api/health` returns `database: false` | Incorrect `SUPABASE_URL` / `SUPABASE_SECRET_KEY` or migration not executed. | Verify credentials in `.env` and verify tables exist in Supabase SQL editor. |
| Scraper throws `Executable doesn't exist` | Playwright browser binaries not downloaded. | Run `npx playwright install chromium`. |
| CORS error in browser console | `FRONTEND_ORIGIN` does not match the frontend's origin URL. | Set `FRONTEND_ORIGIN` in `.env` or Render environment settings to match the frontend URL. |
| `POST /api/jobs/scrape-due` returns 401 Unauthorized | Missing or incorrect `CRON_SECRET` in `Authorization` header. | Pass header `-H "Authorization: Bearer <CRON_SECRET>"`. |
| Prices not updating automatically | External cron job is not triggering `/api/jobs/scrape-due`. | Set up a recurring schedule on cron-job.org or GitHub Actions calling `/api/jobs/scrape-due` every 10–30 minutes. |
| Scrape attempt marked `failed` with `STORE_TIMEOUT` | Mock store was experiencing delayed responses or downtime. | The scraper automatically retries up to 3 times and reschedules in 10 minutes. Check `demo.inelabteamdev.com` status. |

---

## 22. Architecture Diagram (Mermaid)

```mermaid
flowchart TB
    subgraph Client["Client Browser"]
        UI["React 19 Dashboard (apps/web)"]
    end

    subgraph ExternalServices["External Services & Host"]
        Vercel["Vercel (Frontend CDN)"]
        Render["Render.com (Docker Web Service)"]
        CronJob["cron-job.org (External Scheduler)"]
        Store["Mock Store (demo.inelabteamdev.com)"]
    end

    subgraph BackendAPI["Backend Service (apps/api)"]
        Express["Express 5 HTTP Server"]
        ScrapeRunner["Scrape Runner & Retry Engine"]
        Playwright["Playwright Chromium Browser"]
        StoreClient["Store HTTP API Client"]
    end

    subgraph Storage["Database Layer"]
        Supabase[(Supabase PostgreSQL)]
    end

    Vercel -.->|Hosts Static Assets| UI
    UI -->|HTTPS /api/products, /api/search| Express
    CronJob -->|POST /api/jobs/scrape-due| Express

    Express --> StoreClient
    StoreClient -->|HTTP GET /api/catalog| Store

    Express --> ScrapeRunner
    ScrapeRunner -->|Controls| Playwright
    Playwright -->|Scrapes /product/:id| Store

    Express -->|Supabase JS SDK (Service Role)| Supabase
    ScrapeRunner -->|RPC claim_due_products / complete_scrape| Supabase
```

---

## 23. Request and Data-Flow Diagram (Mermaid)

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Web as React Web App
    participant API as Express API
    participant Store as Mock Store
    participant DB as Supabase PostgreSQL
    participant Cron as cron-job.org

    %% Search and Track Flow
    rect rgb(240, 245, 255)
    Note over User, DB: Search and Track Flow
    User->>Web: Enters search keyword
    Web->>API: GET /api/search?q=query
    API->>Store: GET /api/catalog (cached)
    Store-->>API: 200 OK (Catalog items)
    API-->>Web: 200 OK (Filtered items)
    User->>Web: Clicks "Track Product"
    Web->>API: POST /api/products { sourceProductId }
    API->>Store: GET /api/product/:id
    Store-->>API: 200 OK (Metadata)
    API->>DB: Upsert tracked_products
    DB-->>API: 201 Created
    API-->>Web: 201 Created (Tracked product)
    end

    %% Scheduled Scrape Flow
    rect rgb(245, 255, 245)
    Note over Cron, DB: Scheduled Background Scrape Flow
    Cron->>API: POST /api/jobs/scrape-due (Bearer CRON_SECRET)
    API->>DB: RPC reconcile_abandoned_attempts()
    API->>DB: RPC claim_due_products(limit=3, lease=180s)
    DB-->>API: Claimed TrackedProduct[]
    loop For Each Claimed Product
        API->>DB: INSERT scrape_attempts (status='running')
        API->>Store: Launch Playwright & Navigate /product/:id
        Store-->>API: Rendered HTML & /api/layout tokens
        alt Scrape Successful
            API->>DB: RPC complete_scrape(price, in_stock, next_scrape=+2h)
        else Scrape Failed (after 3 retries)
            API->>DB: UPDATE scrape_attempts (status='failed')
            API->>DB: Release lease (next_scrape=+10m)
        end
    end
    API-->>Cron: 200 OK { processed, results }
    end

    %% View Analytics Flow
    rect rgb(255, 250, 240)
    Note over User, DB: View Analytics & Attempt Logs
    User->>Web: Clicks Product Card
    Web->>API: GET /api/products/:id/history
    API->>DB: SELECT * FROM price_history ORDER BY observed_at DESC
    DB-->>API: PricePoint[]
    Web->>API: GET /api/products/:id/attempts
    API->>DB: SELECT * FROM scrape_attempts ORDER BY started_at DESC
    DB-->>API: ScrapeAttempt[]
    API-->>Web: 200 OK
    Web-->>User: Renders Recharts Price Curve & Audit Log Table
    end
```

---

## 24. Requirement Verification & Specification Mapping

| Requirement Specification | Implementation Status | Repository File Reference |
|----------------------------|-----------------------|---------------------------|
| **1. Product Search** | ✅ Implemented | `apps/web/src/components/SearchBox.tsx`, `apps/api/src/store-api.ts` |
| **2. Product Tracking** | ✅ Implemented | `apps/api/src/db.ts` (`track`), `apps/web/src/App.tsx` |
| **3. Scheduled Scraping (2h interval)** | ✅ Implemented | `supabase/migrations/202609180001_initial.sql` (`complete_scrape`), `apps/api/src/scrape-runner.ts` |
| **4. Price and Stock Extraction** | ✅ Implemented | `apps/api/src/scraper/store.ts`, `apps/api/src/scraper/parse.ts` |
| **5. Retries and Error Resilience** | ✅ Implemented | `apps/api/src/scraper/retry.ts`, `apps/api/src/scrape-runner.ts` |
| **6. Price History Visualization** | ✅ Implemented | `apps/web/src/components/ProductDetail.tsx` (Recharts LineChart & Table) |
| **7. Honest Scrape Attempt Logging** | ✅ Implemented | `supabase/migrations/202609180001_initial.sql` (`scrape_attempts`), `ProductDetail.tsx` |
| **8. Observable Headed Run Script** | ✅ Implemented | `apps/api/src/scripts/headed.ts`, `npm run scrape:headed` |
| **9. Monorepo & Deployment Ready** | ✅ Implemented | `package.json` (workspaces), `Dockerfile`, `render.yaml`, `vercel.json` |
| **10. Comprehensive Test Coverage** | ✅ Implemented | `apps/api/src/**/*.test.ts`, `apps/web/src/**/*.test.tsx` (100% passing) |

---

## 25. Files Inspected and Verification Summary

### Files Inspected
- **Configuration & Root:** `package.json`, `tsconfig.base.json`, `eslint.config.js`, `Dockerfile`, `render.yaml`, `vercel.json`, `.env.example`, `.github/workflows/checks.yml`, `README.md`, `DESIGN.md`, `DEVELOPMENT_SPEC.md`, `flow.md`.
- **Database:** `supabase/migrations/202609180001_initial.sql`.
- **API Backend:** `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/api/src/app.test.ts`, `apps/api/src/config.ts`, `apps/api/src/db.ts`, `apps/api/src/db.integration.test.ts`, `apps/api/src/store-api.ts`, `apps/api/src/store-api.test.ts`, `apps/api/src/scrape-runner.ts`, `apps/api/src/scrape-runner.test.ts`, `apps/api/src/errors.ts`, `apps/api/src/types.ts`, `apps/api/src/scraper/store.ts`, `apps/api/src/scraper/parse.ts`, `apps/api/src/scraper/parse.test.ts`, `apps/api/src/scraper/retry.ts`, `apps/api/src/scraper/retry.test.ts`, `apps/api/src/scripts/headed.ts`, `apps/api/src/scripts/production-check.ts`, `apps/api/src/scripts/store-smoke.ts`.
- **Web Frontend:** `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`, `apps/web/src/api.ts`, `apps/web/src/types.ts`, `apps/web/src/styles.css`, `apps/web/src/test-setup.ts`, `apps/web/src/components/SearchBox.tsx`, `apps/web/src/components/ProductCard.tsx`, `apps/web/src/components/ProductDetail.tsx`.

### Verification Status
- **Test Suite:** All unit, integration, and UI tests pass (`npm test` returns exit code 0).
- **Type Checking:** All TypeScript type checks pass with zero errors (`npm run typecheck`).
- **Linting:** ESLint passes with zero warnings or errors (`npm run lint`).
- **Production Smoke Checks:** `npm run production:check` verified live production health, search, and CORS preflight against Render and Vercel deployments.
