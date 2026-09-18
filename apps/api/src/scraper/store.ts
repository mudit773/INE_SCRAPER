import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { AppError } from "../errors.js";
import { getStoreProduct, productUrl, STORE_ORIGIN } from "../store-api.js";
import type { ScrapedObservation } from "../types.js";
import { parseDisplayedPrice, parseStock } from "./parse.js";

type Layout = { classes?: { priceValue?: string; stock?: string } };

async function revealPrice(page: Page): Promise<void> {
  const block = page.locator(".price-block");
  await block.waitFor({ state: "visible", timeout: 20_000 });
  const box = await block.boundingBox();
  if (!box) throw new AppError("PRICE_AREA_MISSING", "Price area could not be located.", 502);

  for (let step = 0; step < 12; step += 1) {
    const x = box.x + 12 + ((box.width - 24) * step) / 11;
    const y = box.y + box.height / 2 + (step % 2 === 0 ? -4 : 4);
    await page.mouse.move(x, y);
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(700);

  const reveal = page.getByRole("button", { name: /reveal price|try again/i });
  await reveal.waitFor({ state: "visible", timeout: 5_000 });
  await reveal.click();
  await page.locator(".price-success, .price-error").waitFor({ state: "visible", timeout: 25_000 });
  if (await page.locator(".price-error").isVisible()) {
    const message = (await page.locator(".price-error").innerText()).replace(/\s+/g, " ").trim();
    throw new AppError("STORE_PRICE_ERROR", message, 502, true);
  }
}

async function scrapePage(page: Page, sourceProductId: string): Promise<ScrapedObservation> {
  const layoutPromise = new Promise<Layout>((resolve) => {
    page.on("response", async (response) => {
      if (response.url().endsWith("/api/layout") && response.ok()) {
        try { resolve((await response.json()) as Layout); } catch { /* the timeout below reports this */ }
      }
    });
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["data:", "blob:", "about:"].includes(url.protocol) || url.origin === STORE_ORIGIN) await route.continue();
    else await route.abort();
  });

  const metadata = await getStoreProduct(sourceProductId);
  const response = await page.goto(productUrl(sourceProductId), { waitUntil: "domcontentloaded", timeout: 25_000 });
  if (!response) throw new AppError("STORE_NO_RESPONSE", "The product page returned no response.", 502, true);
  if (response.status() === 404) throw new AppError("PRODUCT_NOT_FOUND", "The product no longer exists.", 404);
  if (response.status() === 429 || response.status() >= 500) throw new AppError("STORE_TEMPORARY_ERROR", `Store returned HTTP ${response.status()}.`, 502, true);
  if (!response.ok()) throw new AppError("STORE_HTTP_ERROR", `Store returned HTTP ${response.status()}.`, 502);
  if (new URL(page.url()).origin !== STORE_ORIGIN) throw new AppError("STORE_REDIRECT", "The store redirected outside its allowed origin.", 502);

  const heading = page.getByRole("heading", { level: 1 });
  await heading.waitFor({ state: "visible", timeout: 15_000 });
  if ((await heading.innerText()).trim() !== metadata.name) {
    throw new AppError("PRODUCT_MISMATCH", "The loaded page did not match the requested product.", 502);
  }

  await revealPrice(page);
  const layout = await Promise.race([
    layoutPromise,
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new AppError("LAYOUT_MISSING", "The store layout description was unavailable.", 502, true)), 2_000))
  ]);
  if (!layout?.classes?.priceValue || !layout.classes.stock) {
    throw new AppError("LAYOUT_MISSING", "The store layout description was unavailable.", 502, true);
  }
  const priceText = await page.locator(`.${layout.classes.priceValue}`).innerText({ timeout: 5_000 });
  const stockText = await page.locator(`.${layout.classes.stock}`).innerText({ timeout: 5_000 });
  const { price, currency } = parseDisplayedPrice(priceText);

  return {
    sourceProductId,
    name: metadata.name,
    price,
    currency,
    inStock: parseStock(stockText),
    observedAt: new Date().toISOString()
  };
}

export async function scrapeProduct(
  sourceProductId: string,
  options: { headed?: boolean; browser?: Browser } = {}
): Promise<ScrapedObservation> {
  const ownsBrowser = !options.browser;
  const browser = options.browser ?? await chromium.launch({ headless: !options.headed });
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({ locale: "en-IN" });
    const page = await context.newPage();
    return await scrapePage(page, sourceProductId);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = /timeout/i.test(message);
    throw new AppError(isTimeout ? "STORE_TIMEOUT" : "SCRAPE_FAILED", isTimeout ? "The store did not respond in time." : "The product page could not be scraped.", 502, true);
  } finally {
    await context?.close();
    if (ownsBrowser) await browser.close();
  }
}
