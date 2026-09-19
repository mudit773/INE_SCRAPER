import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./errors.js";
import { getStoreProduct, productUrl } from "./store-api.js";
import type { GlobalAttempt, PricePoint, ScrapeAttempt, ScrapeTrigger, ScrapedObservation, TrackedProduct } from "./types.js";

function requireData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new AppError("DATABASE_ERROR", "The database request failed.", 503, true);
  if (data === null) throw new AppError("NOT_FOUND", "The requested record was not found.", 404);
  return data;
}

export class ProductRepository {
  constructor(private readonly db: SupabaseClient) {}

  async health(): Promise<boolean> {
    const { error } = await this.db.from("tracked_products").select("id", { count: "exact", head: true });
    return !error;
  }

  async track(sourceProductId: string): Promise<TrackedProduct> {
    const product = await getStoreProduct(sourceProductId);
    const { data, error } = await this.db
      .from("tracked_products")
      .upsert({
        source_product_id: String(product.id),
        url: productUrl(String(product.id)),
        name: product.name,
        image_url: product.image_url ?? null,
        active: true,
        next_scrape_at: new Date().toISOString()
      }, { onConflict: "source_product_id" })
      .select()
      .single();
    return requireData(data as TrackedProduct | null, error);
  }

  async list(): Promise<Array<TrackedProduct & { latestPrice: PricePoint | null; latestAttempt: ScrapeAttempt | null }>> {
    const { data, error } = await this.db.from("tracked_products").select("*").eq("active", true).order("created_at", { ascending: false });
    const products = requireData(data as TrackedProduct[] | null, error);
    return Promise.all(products.map(async (product) => ({
      ...product,
      latestPrice: await this.latestPrice(product.id),
      latestAttempt: await this.latestAttempt(product.id)
    })));
  }

  async get(id: string): Promise<TrackedProduct & { latestPrice: PricePoint | null; latestAttempt: ScrapeAttempt | null }> {
    const { data, error } = await this.db.from("tracked_products").select("*").eq("id", id).maybeSingle();
    const product = requireData(data as TrackedProduct | null, error);
    return {
      ...product,
      latestPrice: await this.latestPrice(product.id),
      latestAttempt: await this.latestAttempt(product.id)
    };
  }

  async untrack(id: string): Promise<void> {
    const { data, error } = await this.db.from("tracked_products").update({ active: false, lease_token: null, lease_until: null }).eq("id", id).select("id").maybeSingle();
    requireData(data, error);
  }

  async history(productId: string, limit: number, before?: string): Promise<PricePoint[]> {
    let query = this.db.from("price_history").select("*").eq("product_id", productId).order("observed_at", { ascending: false }).limit(limit);
    if (before) query = query.lt("observed_at", before);
    const { data, error } = await query;
    return requireData(data as PricePoint[] | null, error);
  }

  async attempts(productId: string, limit: number, before?: string): Promise<ScrapeAttempt[]> {
    let query = this.db.from("scrape_attempts").select("*").eq("product_id", productId).order("started_at", { ascending: false }).limit(limit);
    if (before) query = query.lt("started_at", before);
    const { data, error } = await query;
    return requireData(data as ScrapeAttempt[] | null, error);
  }

  async globalAttempts(limit: number, before?: string): Promise<GlobalAttempt[]> {
    let query = this.db
      .from("scrape_attempts")
      .select("*, tracked_products(name, source_product_id)")
      .order("started_at", { ascending: false })
      .limit(limit);
    if (before) query = query.lt("started_at", before);
    const { data, error } = await query;
    const rows = requireData(data as Array<Record<string, unknown>> | null, error);
    return rows.map((row) => {
      const product = row.tracked_products as { name?: string; source_product_id?: string } | null;
      return {
        ...(row as unknown as ScrapeAttempt),
        product_name: product?.name ?? "Unknown Product",
        source_product_id: product?.source_product_id ?? null
      };
    });
  }

  async claimDue(limit: number): Promise<TrackedProduct[]> {
    const { data, error } = await this.db.rpc("claim_due_products", { p_limit: limit, p_lease_seconds: 180 });
    return requireData(data as TrackedProduct[] | null, error);
  }

  async claimOne(id: string): Promise<TrackedProduct> {
    const { data, error } = await this.db.rpc("claim_product", { p_product_id: id, p_lease_seconds: 180 });
    const rows = requireData(data as TrackedProduct[] | null, error);
    if (!rows[0]) throw new AppError("PRODUCT_BUSY", "The product is already being scraped.", 409);
    return rows[0];
  }

  async createAttempt(productId: string, runId: string, attemptNumber: number, trigger: ScrapeTrigger): Promise<ScrapeAttempt> {
    const { data, error } = await this.db.from("scrape_attempts").insert({
      product_id: productId,
      run_id: runId,
      attempt_number: attemptNumber,
      trigger,
      status: "running"
    }).select().single();
    return requireData(data as ScrapeAttempt | null, error);
  }

  async finishFailedAttempt(attempt: ScrapeAttempt, status: "retried" | "failed", error: Error): Promise<void> {
    const code = error instanceof AppError ? error.code : "SCRAPE_FAILED";
    const duration = Date.now() - new Date(attempt.started_at).getTime();
    const { error: updateError } = await this.db.from("scrape_attempts").update({
      status,
      error_code: code,
      error_message: error.message.slice(0, 500),
      duration_ms: Math.max(0, duration),
      finished_at: new Date().toISOString()
    }).eq("id", attempt.id);
    if (updateError) throw new AppError("DATABASE_ERROR", "Could not record the scrape failure.", 503, true);
  }

  async complete(product: TrackedProduct, attempt: ScrapeAttempt, observation: ScrapedObservation): Promise<void> {
    const duration = Date.now() - new Date(attempt.started_at).getTime();
    const { error } = await this.db.rpc("complete_scrape", {
      p_product_id: product.id,
      p_attempt_id: attempt.id,
      p_price: observation.price,
      p_currency: observation.currency,
      p_in_stock: observation.inStock,
      p_observed_at: observation.observedAt,
      p_duration_ms: Math.max(0, duration)
    });
    if (error) throw new AppError("DATABASE_ERROR", "Could not save the successful scrape.", 503, true);
  }

  async release(productId: string): Promise<void> {
    const { error } = await this.db.from("tracked_products").update({
      lease_token: null,
      lease_until: null,
      next_scrape_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    }).eq("id", productId);
    if (error) throw new AppError("DATABASE_ERROR", "Could not release the scrape lease.", 503, true);
  }

  async reconcile(): Promise<void> {
    const { error } = await this.db.rpc("reconcile_abandoned_attempts");
    if (error) throw new AppError("DATABASE_ERROR", "Could not reconcile interrupted scrapes.", 503, true);
  }

  private async latestPrice(productId: string): Promise<PricePoint | null> {
    const { data, error } = await this.db.from("price_history").select("*").eq("product_id", productId).order("observed_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new AppError("DATABASE_ERROR", "Could not load price history.", 503, true);
    return data as PricePoint | null;
  }

  private async latestAttempt(productId: string): Promise<ScrapeAttempt | null> {
    const { data, error } = await this.db.from("scrape_attempts").select("*").eq("product_id", productId).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new AppError("DATABASE_ERROR", "Could not load scrape attempts.", 503, true);
    return data as ScrapeAttempt | null;
  }
}

export function createRepository(url: string, secret: string): ProductRepository {
  return new ProductRepository(createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }));
}
