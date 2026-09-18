import { describe, expect, it, vi } from "vitest";
import { AppError } from "./errors.js";
import type { ProductRepository } from "./db.js";
import { runProductScrape } from "./scrape-runner.js";
import type { ScrapeAttempt, TrackedProduct } from "./types.js";

vi.mock("./scraper/store.js", () => ({
  scrapeProduct: vi.fn()
}));

import { scrapeProduct } from "./scraper/store.js";

const product: TrackedProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  source_product_id: "1",
  url: "https://demo.inelabteamdev.com/product/1",
  name: "Example",
  image_url: null,
  active: true,
  created_at: new Date().toISOString(),
  next_scrape_at: new Date().toISOString(),
  lease_token: null,
  lease_until: null
};

function attemptRow(number: number): ScrapeAttempt {
  return {
    id: `22222222-2222-4222-8222-${String(number).padStart(12, "0")}`,
    product_id: product.id,
    run_id: "33333333-3333-4333-8333-333333333333",
    attempt_number: number,
    trigger: "scheduled",
    started_at: new Date().toISOString(),
    finished_at: null,
    status: "running",
    error_code: null,
    error_message: null,
    duration_ms: null
  };
}

function repositoryStub(overrides: Partial<ProductRepository> = {}): ProductRepository {
  return {
    createAttempt: vi.fn(async (_productId, _runId, attemptNumber) => attemptRow(attemptNumber)),
    finishFailedAttempt: vi.fn(async () => undefined),
    complete: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
    ...overrides
  } as unknown as ProductRepository;
}

describe("runProductScrape", () => {
  it("persists a successful observation and does not release the lease", async () => {
    vi.mocked(scrapeProduct).mockResolvedValue({
      sourceProductId: "1",
      name: "Example",
      price: 100,
      currency: "INR",
      inStock: true,
      observedAt: new Date().toISOString()
    });
    const repository = repositoryStub();
    const result = await runProductScrape(repository, product, "scheduled");
    expect(result.ok).toBe(true);
    expect(repository.complete).toHaveBeenCalledOnce();
    expect(repository.release).not.toHaveBeenCalled();
  });

  it("marks retried attempts and releases after final failure", async () => {
    vi.mocked(scrapeProduct).mockRejectedValue(new AppError("TEMP", "temporary", 502, true));
    const repository = repositoryStub();
    const result = await runProductScrape(repository, product, "scheduled", undefined, {
      delaysMs: [0, 0],
      sleep: async () => undefined
    });
    expect(result.ok).toBe(false);
    expect(repository.finishFailedAttempt).toHaveBeenCalledTimes(3);
    expect(repository.complete).not.toHaveBeenCalled();
    expect(repository.release).toHaveBeenCalledOnce();
  });

  it("does not retry permanent validation failures", async () => {
    vi.mocked(scrapeProduct).mockRejectedValue(new AppError("PRICE_INVALID", "bad price", 502, false));
    const repository = repositoryStub();
    const result = await runProductScrape(repository, product, "manual");
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(1);
    expect(repository.finishFailedAttempt).toHaveBeenCalledOnce();
  });
});
