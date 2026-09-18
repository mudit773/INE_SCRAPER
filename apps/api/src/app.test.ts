import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, authorized } from "./app.js";
import type { AppConfig } from "./config.js";
import type { ProductRepository } from "./db.js";

const config: AppConfig = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "x".repeat(30),
  CRON_SECRET: "a-secure-test-secret",
  FRONTEND_ORIGIN: "http://localhost:5173",
  PORT: 3000
};

function repositoryStub() {
  return {
    health: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    track: vi.fn(),
    untrack: vi.fn(),
    history: vi.fn(),
    attempts: vi.fn(),
    claimOne: vi.fn(),
    claimDue: vi.fn(),
    reconcile: vi.fn()
  } as unknown as ProductRepository;
}

describe("API validation", () => {
  it("reports health", async () => {
    const response = await request(createApp(config, repositoryStub())).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, database: true });
  });

  it("rejects an invalid product UUID", async () => {
    const response = await request(createApp(config, repositoryStub())).get("/api/products/not-a-uuid");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("protects scheduled scraping", async () => {
    const response = await request(createApp(config, repositoryStub())).post("/api/jobs/scrape-due");
    expect(response.status).toBe(401);
  });
});

describe("cron token comparison", () => {
  it("requires the full bearer token", () => {
    expect(authorized("Bearer a-secure-test-secret", config.CRON_SECRET)).toBe(true);
    expect(authorized("Bearer a-secure-test", config.CRON_SECRET)).toBe(false);
    expect(authorized(undefined, config.CRON_SECRET)).toBe(false);
  });
});
