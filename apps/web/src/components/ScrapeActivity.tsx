import { useEffect, useState } from "react";
import { api } from "../api";
import type { GlobalAttempt } from "../types";
import { time } from "./ProductCard";

export function ScrapeActivity() {
  const [attempts, setAttempts] = useState<GlobalAttempt[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadActivity = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.activity();
      setAttempts(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load scrape activity.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadActivity();
  }, []);

  const total = attempts.length;
  const successCount = attempts.filter((a) => a.status === "success").length;
  const failedCount = attempts.filter((a) => a.status === "failed").length;
  const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;
  const completedDurations = attempts.filter((a) => a.duration_ms !== null).map((a) => a.duration_ms as number);
  const avgDuration = completedDurations.length > 0 ? Math.round(completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length) : 0;

  const filteredAttempts = attempts.filter((a) => (filter === "all" ? true : a.status === filter));

  return (
    <section className="detail-panel" aria-labelledby="activity-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Scraper Audit Log</p>
          <h2 id="activity-title">Live Scrape Activity</h2>
        </div>
        <button className="text-button" onClick={() => void loadActivity()}>
          Refresh activity
        </button>
      </div>

      <div className="activity-stats">
        <div className="stat-card">
          <span className="stat-label">Total Scrapes</span>
          <strong className="stat-value">{total}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Success Rate</span>
          <strong className="stat-value">{successRate}%</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Successful</span>
          <strong className="stat-value text-success">{successCount}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Failed</span>
          <strong className="stat-value text-danger">{failedCount}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Avg Duration</span>
          <strong className="stat-value">{avgDuration}ms</strong>
        </div>
      </div>

      <div className="activity-filters">
        {["all", "success", "failed", "retried", "running"].map((status) => (
          <button
            key={status}
            className={`filter-chip ${filter === status ? "active" : ""}`}
            onClick={() => setFilter(status)}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p className="empty-state">Loading activity feed…</p>}
      {error && <p className="error-banner">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Product</th>
                <th>Attempt</th>
                <th>Trigger</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Details / Error</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td>{time(attempt.started_at)}</td>
                  <td>
                    <strong>{attempt.product_name ?? "Unknown"}</strong>
                    {attempt.source_product_id && <span className="product-id"> #{attempt.source_product_id}</span>}
                  </td>
                  <td>#{attempt.attempt_number}</td>
                  <td>
                    <span className="trigger-badge">{attempt.trigger ?? "scheduled"}</span>
                  </td>
                  <td>
                    <span className={`log-status ${attempt.status}`}>{attempt.status}</span>
                  </td>
                  <td>{attempt.duration_ms !== null ? `${attempt.duration_ms}ms` : "—"}</td>
                  <td>{attempt.error_message ? <small>{attempt.error_message}</small> : <span className="text-muted">Clean run</span>}</td>
                </tr>
              ))}
              {!filteredAttempts.length && (
                <tr>
                  <td colSpan={7}>No scrape activity found for this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
