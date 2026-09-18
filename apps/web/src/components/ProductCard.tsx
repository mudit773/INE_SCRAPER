import type { TrackedProduct } from "../types";

const money = (value: number, currency: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const time = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function ProductCard({ product, selected, onSelect, onUntrack }: {
  product: TrackedProduct;
  selected: boolean;
  onSelect: () => void;
  onUntrack: () => Promise<void>;
}) {
  const last = product.latestPrice;
  const attempt = product.latestAttempt;
  const stale = !last || Date.now() - new Date(last.observed_at).getTime() > 3 * 60 * 60 * 1000;

  return (
    <article className={`product-card ${selected ? "selected" : ""}`}>
      <button className="card-main" onClick={onSelect} aria-pressed={selected}>
        <span className="card-topline"><span className="product-id">#{product.source_product_id}</span><span className={`status-dot ${attempt?.status ?? "waiting"}`}>{attempt?.status ?? "waiting"}</span></span>
        <strong>{product.name}</strong>
        <span className="price">{last ? money(last.price, last.currency) : "No confirmed price"}</span>
        <span className={last?.in_stock ? "stock in" : "stock out"}>{last ? (last.in_stock ? "In stock" : "Out of stock") : "Awaiting first check"}</span>
        <span className={stale ? "checked stale" : "checked"}>{last ? `Checked ${time(last.observed_at)}` : "Newly tracked"}{stale && last ? " · stale" : ""}</span>
      </button>
      <button className="text-button danger" onClick={() => { if (window.confirm(`Stop tracking ${product.name}? Its history will be kept.`)) void onUntrack(); }}>Stop tracking</button>
    </article>
  );
}

export { money, time };
