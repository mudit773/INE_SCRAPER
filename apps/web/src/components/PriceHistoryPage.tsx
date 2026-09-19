import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import type { Attempt, PricePoint, TrackedProduct } from "../types";
import { money, time } from "./ProductCard";

export function PriceHistoryPage({
  products,
  selectedId,
  onSelectProduct
}: {
  products: TrackedProduct[];
  selectedId: string | null;
  onSelectProduct: (id: string) => void;
}) {
  const currentProduct = products.find((p) => p.id === selectedId) ?? products[0] ?? null;
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentProduct) return;
    let active = true;
    setLoading(true);
    setError("");

    Promise.all([api.history(currentProduct.id), api.attempts(currentProduct.id)])
      .then(([prices, logs]) => {
        if (active) {
          setHistory(prices.items);
          setAttempts(logs.items);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load history details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentProduct?.id]);

  if (!currentProduct) {
    return (
      <section className="detail-panel">
        <div className="empty-state">
          <p>No products are currently being tracked.</p>
          <p className="text-muted">Track a product from the Dashboard to see its price history and scrape logs.</p>
        </div>
      </section>
    );
  }

  const chartData = [...history].reverse().map((point) => ({
    ...point,
    label: new Date(point.observed_at).toLocaleDateString()
  }));

  const lastPrice = history[0]?.price ?? currentProduct.latestPrice?.price ?? null;
  const currency = history[0]?.currency ?? currentProduct.latestPrice?.currency ?? "INR";
  const inStock = history[0]?.in_stock ?? currentProduct.latestPrice?.in_stock ?? null;

  return (
    <section className="detail-panel" aria-labelledby="history-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Price History & Logs</p>
          <h2 id="detail-title">{currentProduct.name}</h2>
          {currentProduct.source_product_id && (
            <span className="product-id">Mock Store Product ID #{currentProduct.source_product_id}</span>
          )}
        </div>
        <div className="product-selector-box">
          <label htmlFor="product-select" className="sr-only">
            Select Tracked Product
          </label>
          <select
            id="product-select"
            className="product-select-dropdown"
            value={currentProduct.id}
            onChange={(e) => onSelectProduct(e.target.value)}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="history-summary-bar">
        <div className="summary-metric">
          <span className="summary-label">Latest Price</span>
          <strong className="summary-value">
            {lastPrice !== null ? money(lastPrice, currency) : "Awaiting check"}
          </strong>
        </div>
        <div className="summary-metric">
          <span className="summary-label">Stock Status</span>
          <span className={inStock ? "stock in" : "stock out"}>
            {inStock !== null ? (inStock ? "In Stock" : "Out of Stock") : "Pending"}
          </span>
        </div>
        <div className="summary-metric">
          <span className="summary-label">Schedule</span>
          <span className="schedule-badge">Every 2 hours</span>
        </div>
        <div className="summary-metric">
          <span className="summary-label">Total Observations</span>
          <strong className="summary-value">{history.length}</strong>
        </div>
      </div>

      {loading && <p className="empty-state">Loading product observations and scrape logs…</p>}
      {error && <p className="error-banner">{error}</p>}

      {!loading && (
        <>
          <div className="chart-wrap" aria-label="Price history chart">
            <h3>Price Trajectory</h3>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 12, right: 12, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} width={72} />
                  <Tooltip formatter={(value) => money(Number(value), currency)} />
                  <Line type="monotone" dataKey="price" stroke="#059669" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="empty-detail">The interactive price chart appears after at least two successful checks.</p>
            )}
          </div>

          <div className="detail-grid">
            <div>
              <h3>Confirmed Price Observations</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Observed</th>
                      <th>Price</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((point) => (
                      <tr key={point.id}>
                        <td>{time(point.observed_at)}</td>
                        <td>{money(point.price, point.currency)}</td>
                        <td>
                          <span className={point.in_stock ? "stock in" : "stock out"}>
                            {point.in_stock ? "In stock" : "Out of stock"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!history.length && (
                      <tr>
                        <td colSpan={3}>No price observations recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3>Per-Product Scrape Audit Log</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Attempt</th>
                      <th>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td>{time(attempt.started_at)}</td>
                        <td>
                          #{attempt.attempt_number}
                          {attempt.duration_ms !== null ? ` · ${attempt.duration_ms}ms` : ""}
                        </td>
                        <td>
                          <span className={`log-status ${attempt.status}`}>{attempt.status}</span>
                          {attempt.error_message && <small>{attempt.error_message}</small>}
                        </td>
                      </tr>
                    ))}
                    {!attempts.length && (
                      <tr>
                        <td colSpan={3}>No scrape attempts recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
