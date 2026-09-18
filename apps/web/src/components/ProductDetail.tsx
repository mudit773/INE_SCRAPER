import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import type { Attempt, PricePoint, TrackedProduct } from "../types";
import { money, time } from "./ProductCard";

export function ProductDetail({ product }: { product: TrackedProduct }) {
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setError("");
    Promise.all([api.history(product.id), api.attempts(product.id)])
      .then(([prices, logs]) => { if (current) { setHistory(prices.items); setAttempts(logs.items); } })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : "Could not load product details."); });
    return () => { current = false; };
  }, [product.id]);

  const chartData = [...history].reverse().map((point) => ({ ...point, label: new Date(point.observed_at).toLocaleDateString() }));

  return (
    <section className="detail-panel" aria-labelledby="detail-title">
      <div className="section-heading"><div><p className="eyebrow">History</p><h2 id="detail-title">{product.name}</h2></div><span className="schedule-note">Checks every 2 hours</span></div>
      {error && <p className="error-banner">{error}</p>}
      <div className="chart-wrap" aria-label="Price history chart">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 12, right: 12, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="4 6" stroke="#d9ded6" />
              <XAxis dataKey="label" tick={{ fill: "#657067", fontSize: 12 }} />
              <YAxis tick={{ fill: "#657067", fontSize: 12 }} width={72} />
              <Tooltip formatter={(value) => money(Number(value), history[0]?.currency ?? "INR")} />
              <Line type="monotone" dataKey="price" stroke="#185c4a" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="empty-detail">The chart appears after two successful checks.</p>}
      </div>

      <div className="detail-grid">
        <div>
          <h3>Confirmed observations</h3>
          <div className="table-scroll"><table><thead><tr><th>Observed</th><th>Price</th><th>Stock</th></tr></thead><tbody>
            {history.map((point) => <tr key={point.id}><td>{time(point.observed_at)}</td><td>{money(point.price, point.currency)}</td><td>{point.in_stock ? "In stock" : "Out of stock"}</td></tr>)}
            {!history.length && <tr><td colSpan={3}>No successful observations yet.</td></tr>}
          </tbody></table></div>
        </div>
        <div>
          <h3>Scrape log</h3>
          <div className="table-scroll"><table><thead><tr><th>Started</th><th>Attempt</th><th>Outcome</th></tr></thead><tbody>
            {attempts.map((attempt) => <tr key={attempt.id}><td>{time(attempt.started_at)}</td><td>#{attempt.attempt_number}{attempt.duration_ms !== null ? ` · ${attempt.duration_ms}ms` : ""}</td><td><span className={`log-status ${attempt.status}`}>{attempt.status}</span>{attempt.error_message && <small>{attempt.error_message}</small>}</td></tr>)}
            {!attempts.length && <tr><td colSpan={3}>No scrape attempts yet.</td></tr>}
          </tbody></table></div>
        </div>
      </div>
    </section>
  );
}
