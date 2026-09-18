import type { Attempt, PricePoint, SearchProduct, TrackedProduct } from "./types";

const API =
  import.meta.env.VITE_API_BASE_URL ??
  "https://ine-price-tracker-api-vfq3.onrender.com/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers }
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "Request failed.");
  return body as T;
}

export const api = {
  search: (query: string) => request<{ items: SearchProduct[] }>(`/search?q=${encodeURIComponent(query)}`),
  listProducts: () => request<{ items: TrackedProduct[] }>("/products"),
  track: (sourceProductId: string) => request<TrackedProduct>("/products", { method: "POST", body: JSON.stringify({ sourceProductId }) }),
  untrack: (id: string) => request<void>(`/products/${id}`, { method: "DELETE" }),
  history: (id: string) => request<{ items: PricePoint[] }>(`/products/${id}/history?limit=100`),
  attempts: (id: string) => request<{ items: Attempt[] }>(`/products/${id}/attempts?limit=50`)
};
