import { scrapeProduct } from "../scraper/store.js";
import { withRetries } from "../scraper/retry.js";

function separator(label: string): void {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${label}`);
  console.log("═".repeat(60) + "\n");
}

async function runDemo(productId: string, label: string, expectedOutcome: string): Promise<void> {
  separator(`${label}  [expected: ${expectedOutcome}]`);
  console.log(`Product ID: ${productId}`);
  console.log(`Time: ${new Date().toLocaleTimeString()}\n`);

  try {
    const observation = await withRetries(
      async (attempt) => {
        console.log(`[Attempt ${attempt}/3] Launching visible Chromium...`);
        return await scrapeProduct(productId, { headed: true });
      },
      {
        delaysMs: [3000, 6000],
        onFailure: ({ attempt, error, willRetry }) => {
          const msg = error instanceof Error ? error.message : String(error);
          if (willRetry) {
            console.warn(`\n[Attempt ${attempt}/3 FAILED] ${msg}`);
            console.warn(`  → Will retry with backoff...\n`);
          } else {
            console.error(`\n[Attempt ${attempt}/3 FAILED] ${msg}`);
            console.error(`  → No more retries. Recording failure.\n`);
          }
        }
      }
    );
    console.log("\n✅ Scrape SUCCEEDED:");
    console.table([{
      product: observation.name,
      price: `${observation.currency} ${observation.price}`,
      inStock: observation.inStock,
      observedAt: observation.observedAt
    }]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Scrape FAILED after all retries: ${msg}`);
    console.error(`   (This failure would be recorded honestly in the database.)\n`);
  }
}

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║          WATCHTOWER — Headed Scraper Demo Run              ║");
console.log("║  Shows: live browser interaction + retry/failure handling  ║");
console.log("╚════════════════════════════════════════════════════════════╝");

console.log("\n[Part 1] Normal product scrape — real store interaction");
console.log("Watch the browser window that opens.\n");

await runDemo("1", "Nordkraft Headphones Pro (#1)", "success or natural retry");

await new Promise((resolve) => setTimeout(resolve, 2000));

console.log("\n[Part 2] Non-existent product — permanent failure (no retry)");
console.log("The store returns 404. The scraper stops immediately without retrying.\n");

await runDemo("999999", "Non-existent product (#999999)", "immediate permanent failure");

separator("Demo complete");
console.log("The two runs above demonstrate:");
console.log("  • Real browser interaction with mouse movement + price reveal");
console.log("  • Retry logic with backoff on temporary failures");
console.log("  • Immediate stop on permanent failures (404 = product not found)");
console.log("  • In production, both outcomes are recorded honestly in Supabase.\n");
