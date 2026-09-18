import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { AppError } from "./errors.js";
import type { ProductRepository } from "./db.js";
import { scrapeProduct } from "./scraper/store.js";
import { withRetries } from "./scraper/retry.js";
import type { ScrapeTrigger, TrackedProduct } from "./types.js";

export type RunResult = { productId: string; ok: boolean; attempts: number; error?: string };

export async function runProductScrape(
  repository: ProductRepository,
  product: TrackedProduct,
  trigger: ScrapeTrigger,
  browser = undefined as Awaited<ReturnType<typeof chromium.launch>> | undefined,
  retryOptions: { delaysMs?: number[]; sleep?: (milliseconds: number) => Promise<void> } = {}
): Promise<RunResult> {
  const runId = randomUUID();
  let attempts = 0;
  let currentAttempt: Awaited<ReturnType<ProductRepository["createAttempt"]>> | null = null;
  try {
    const observation = await withRetries(
      async (attemptNumber) => {
        attempts = attemptNumber;
        currentAttempt = null;
        currentAttempt = await repository.createAttempt(product.id, runId, attemptNumber, trigger);
        return scrapeProduct(product.source_product_id, { browser });
      },
      {
        ...retryOptions,
        onFailure: async ({ error, willRetry }) => {
          if (currentAttempt) await repository.finishFailedAttempt(currentAttempt, willRetry ? "retried" : "failed", error);
        }
      }
    );
    if (!currentAttempt) throw new AppError("ATTEMPT_MISSING", "Scrape attempt was not created.", 500);
    await repository.complete(product, currentAttempt, observation);
    return { productId: product.id, ok: true, attempts };
  } catch (error) {
    try { await repository.release(product.id); } catch { /* the original failure is more useful to the caller */ }
    return { productId: product.id, ok: false, attempts, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runDueScrapes(repository: ProductRepository, limit = 3): Promise<RunResult[]> {
  await repository.reconcile();
  const products = await repository.claimDue(limit);
  if (products.length === 0) return [];
  const browser = await chromium.launch({ headless: true });
  try {
    const results: RunResult[] = [];
    for (const product of products) results.push(await runProductScrape(repository, product, "scheduled", browser));
    return results;
  } finally {
    await browser.close();
  }
}
