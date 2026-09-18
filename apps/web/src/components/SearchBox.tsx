import { useEffect, useState } from "react";
import { api } from "../api";
import type { SearchProduct } from "../types";

export function SearchBox({ onTracked }: { onTracked: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setMessage("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setMessage("Searching the mock store…");
      try {
        const response = await api.search(query.trim(), { signal: controller.signal });
        if (!controller.signal.aborted) {
          setResults(response.items);
          setMessage(response.items.length ? "" : "No matching products found.");
        }
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Search failed.");
      }
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  async function track(product: SearchProduct) {
    setBusyId(product.id);
    setMessage("");
    try {
      await api.track(String(product.id));
      setQuery("");
      setResults([]);
      await onTracked();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not track this product.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="search-panel" aria-labelledby="search-heading">
      <div>
        <p className="eyebrow">Add a product</p>
        <h2 id="search-heading">What should we watch?</h2>
      </div>
      <label className="search-field">
        <span className="sr-only">Search products</span>
        <span aria-hidden="true">⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try ‘monitor’ or a full product name" />
      </label>
      {message && <p className="form-message" role="status">{message}</p>}
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((product) => (
            <li key={product.id}>
              <div><strong>{product.name}</strong><span>{product.brand} · {product.category} · {product.sku}</span></div>
              <button onClick={() => void track(product)} disabled={busyId === product.id}>{busyId === product.id ? "Adding…" : "Track"}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
