export type SearchProduct = {
  id: number;
  name: string;
  brand: string;
  category: string;
  sku: string;
};

export type PricePoint = {
  id: string;
  price: number;
  currency: string;
  in_stock: boolean;
  observed_at: string;
};

export type Attempt = {
  id: string;
  attempt_number: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "retried" | "failed";
  error_message: string | null;
  duration_ms: number | null;
};

export type TrackedProduct = {
  id: string;
  source_product_id: string;
  name: string;
  active: boolean;
  next_scrape_at: string;
  latestPrice: PricePoint | null;
  latestAttempt: Attempt | null;
};
