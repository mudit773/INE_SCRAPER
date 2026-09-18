import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRepository } from "./db.js";
import { readConfig } from "./config.js";

const integrationEnabled = process.env.RUN_SUPABASE_INTEGRATION === "1";

describe.skipIf(!integrationEnabled)("Supabase integration", () => {
  it("claims due products without overlapping leases under parallel cron calls", async () => {
    const config = readConfig();
    const repository = createRepository(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY);
    await repository.reconcile();
    const [first, second] = await Promise.all([repository.claimDue(3), repository.claimDue(3)]);
    const firstIds = new Set(first.map((row) => row.id));
    for (const row of second) {
      expect(firstIds.has(row.id)).toBe(false);
    }
  });
});

describe("migration lease SQL", () => {
  it("uses skip locked claiming and atomic complete_scrape", () => {
    const migrationPath = fileURLToPath(new URL("../../../supabase/migrations/202609180001_initial.sql", import.meta.url));
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/for update skip locked/i);
    expect(sql).toMatch(/complete_scrape/i);
    expect(sql).toMatch(/reconcile_abandoned_attempts/i);
  });
});
