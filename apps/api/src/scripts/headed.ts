import { scrapeProduct } from "../scraper/store.js";
import { withRetries } from "../scraper/retry.js";

const productIndex = process.argv.indexOf("--product");
const productId = productIndex >= 0 ? process.argv[productIndex + 1] : undefined;
if (!productId || !/^\d+$/.test(productId)) {
  console.error("Usage: npm run scrape:headed -- --product <mock-store-product-id>");
  process.exit(1);
}

console.log(`Starting headed scraper for mock-store product ${productId}...`);
try {
  const observation = await withRetries(
    async (attempt) => {
      console.log(`[Attempt ${attempt}/3] Launching visible Chromium browser...`);
      return await scrapeProduct(productId, { headed: true });
    },
    {
      onFailure: ({ attempt, error, willRetry }) => {
        const message = error instanceof Error ? error.message : String(error);
        if (willRetry) {
          console.warn(`[Attempt ${attempt}/3 failed]: ${message}. Retrying with backoff...`);
        } else {
          console.error(`[Attempt ${attempt}/3 failed]: ${message}. No more retries.`);
        }
      }
    }
  );
  console.log("\nHeaded scrape succeeded:");
  console.table([observation]);
} catch (error) {
  console.error("\nHeaded scrape failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
