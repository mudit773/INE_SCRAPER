import { scrapeProduct } from "../scraper/store.js";

const productIndex = process.argv.indexOf("--product");
const productId = productIndex >= 0 ? process.argv[productIndex + 1] : undefined;
if (!productId || !/^\d+$/.test(productId)) {
  console.error("Usage: npm run scrape:headed -- --product <mock-store-product-id>");
  process.exit(1);
}

console.log(`Opening mock-store product ${productId} in headed mode...`);
try {
  const observation = await scrapeProduct(productId, { headed: true });
  console.log("Scrape succeeded:", observation);
} catch (error) {
  console.error("Scrape failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
