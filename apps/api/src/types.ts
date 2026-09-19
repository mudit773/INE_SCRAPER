export type StoreProduct = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  sku: string;
  description: string;
  image_url?: string | null;
};

export type TrackedProduct = {
  id: string;
  source_product_id: string;
  url: string;
  name: string;
  image_url: string | null;
  active: boolean;
  created_at: string;
  next_scrape_at: string;
  lease_token: string | null;
  lease_until: string | null;
};

export type ScrapedObservation = {
  sourceProductId: string;
  name: string;
  price: number;
  currency: string;
  inStock: boolean;
  observedAt: string;
};

export type AttemptStatus = "running" | "success" | "retried" | "failed";
export type ScrapeTrigger = "scheduled" | "manual";

export type ScrapeAttempt = {
  id: string;
  product_id: string;
  run_id: string;
  attempt_number: number;
  trigger: ScrapeTrigger;
  started_at: string;
  finished_at: string | null;
  status: AttemptStatus;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | null;
};

export type PricePoint = {
  id: string;
  product_id: string;
  attempt_id: string;
  price: number;
  currency: string;
  in_stock: boolean;
  observed_at: string;
};

export type GlobalAttempt = ScrapeAttempt & {
  product_name?: string | null;
  source_product_id?: string | null;
};
