import { AppError } from "./errors.js";
import type { StoreProduct } from "./types.js";

const STORE_ORIGIN = "https://demo.inelabteamdev.com";
const PAGE_SIZE = 60;
const CACHE_MS = 2 * 60 * 1000;

type CatalogPage = {
  page: number;
  pages: number;
  total: number;
  items: StoreProduct[];
};

let catalogCache: { expiresAt: number; products: StoreProduct[] } | null = null;

async function storeJson<T>(path: string, timeoutMs = 12_000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${STORE_ORIGIN}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json", "User-Agent": "INE-Assignment-Price-Tracker/1.0" }
    });
  } catch {
    throw new AppError("STORE_NETWORK_ERROR", "The mock store could not be reached.", 502, true);
  }
  if (!response.ok) {
    const code = response.status === 404 ? "PRODUCT_NOT_FOUND" : "STORE_HTTP_ERROR";
    const status = response.status === 404 ? 404 : 502;
    throw new AppError(code, `Mock store returned HTTP ${response.status}.`, status, response.status >= 500 || response.status === 429);
  }
  return response.json() as Promise<T>;
}

async function loadCatalog(): Promise<StoreProduct[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.products;

  const first = await storeJson<CatalogPage>(`/api/catalog?page=1&pageSize=${PAGE_SIZE}`);
  const remaining = await Promise.all(
    Array.from({ length: Math.max(0, first.pages - 1) }, (_, index) =>
      storeJson<CatalogPage>(`/api/catalog?page=${index + 2}&pageSize=${PAGE_SIZE}`)
    )
  );
  const unique = new Map<number, StoreProduct>();
  for (const page of [first, ...remaining]) {
    for (const product of page.items) unique.set(product.id, product);
  }
  const products = [...unique.values()];
  catalogCache = { expiresAt: Date.now() + CACHE_MS, products };
  return products;
}

export async function searchStore(query: string): Promise<StoreProduct[]> {
  const wanted = query.trim().toLocaleLowerCase();
  const products = await loadCatalog();
  return products
    .filter((product) => `${product.name} ${product.brand} ${product.sku}`.toLocaleLowerCase().includes(wanted))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 20);
}

export function imageUrlFromStorePayload(data: Record<string, unknown>): string | null {
  for (const key of ["imageUrl", "image_url", "image"]) {
    const value = data[key];
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  }
  return null;
}

export async function getStoreProduct(id: string): Promise<StoreProduct> {
  if (!/^\d+$/.test(id)) throw new AppError("INVALID_PRODUCT", "Invalid store product ID.", 400);
  const raw = await storeJson<StoreProduct & Record<string, unknown>>(`/api/product/${id}`);
  return { ...raw, image_url: imageUrlFromStorePayload(raw) };
}

export function productUrl(id: string): string {
  return `${STORE_ORIGIN}/product/${id}`;
}

export { STORE_ORIGIN };
