/**
 * Read-only checks against a deployed API (default: production Render service).
 * Usage: npm run production:check -w @tracker/api
 * Optional env: PRODUCTION_API_BASE, PRODUCTION_FRONTEND_ORIGIN
 */

const API_BASE = process.env.PRODUCTION_API_BASE ?? "https://ine-price-tracker-api-vfq3.onrender.com/api";
const FRONTEND_ORIGIN = process.env.PRODUCTION_FRONTEND_ORIGIN ?? "https://ine-price-tracker-mauve.vercel.app";

type Check = { name: string; ok: boolean; detail: string };

async function check(name: string, run: () => Promise<void>): Promise<Check> {
  try {
    await run();
    return { name, ok: true, detail: "ok" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { name, ok: false, detail };
  }
}

async function main() {
  const results: Check[] = [];

  results.push(await check("health", async () => {
    const response = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(60_000) });
    const body = (await response.json()) as { ok?: boolean; database?: boolean };
    if (!response.ok || !body.ok || !body.database) {
      throw new Error(`health ${response.status} ok=${body.ok} database=${body.database}`);
    }
  }));

  results.push(await check("search", async () => {
    const response = await fetch(`${API_BASE}/search?q=monitor`, {
      signal: AbortSignal.timeout(60_000),
      headers: { Accept: "application/json" }
    });
    const body = (await response.json()) as { items?: unknown[] };
    if (!response.ok || !Array.isArray(body.items)) throw new Error(`search ${response.status}`);
  }));

  results.push(await check("cors-preflight", async () => {
    const response = await fetch(`${API_BASE}/health`, {
      method: "OPTIONS",
      headers: {
        Origin: FRONTEND_ORIGIN,
        "Access-Control-Request-Method": "GET"
      },
      signal: AbortSignal.timeout(60_000)
    });
    const allowOrigin = response.headers.get("access-control-allow-origin");
    if (!response.ok && response.status !== 204) throw new Error(`OPTIONS ${response.status}`);
    if (allowOrigin !== FRONTEND_ORIGIN && allowOrigin !== "*") {
      throw new Error(`Access-Control-Allow-Origin=${allowOrigin ?? "missing"} expected ${FRONTEND_ORIGIN}`);
    }
  }));

  results.push(await check("cors-get-products", async () => {
    const response = await fetch(`${API_BASE}/products`, {
      headers: { Origin: FRONTEND_ORIGIN, Accept: "application/json" },
      signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) throw new Error(`GET /products ${response.status}`);
    const allowOrigin = response.headers.get("access-control-allow-origin");
    if (allowOrigin !== FRONTEND_ORIGIN && allowOrigin !== "*") {
      throw new Error(`Allow-Origin=${allowOrigin ?? "missing"}`);
    }
  }));

  console.log(`Production checks for ${API_BASE} (Origin ${FRONTEND_ORIGIN})`);
  console.table(results);
  const failed = results.filter((row) => !row.ok);
  if (failed.length) {
    console.error(`${failed.length} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("All production checks passed.");
  }
}

await main();
