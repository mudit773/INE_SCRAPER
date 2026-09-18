import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { ProductCard } from "./components/ProductCard";
import { SearchBox } from "./components/SearchBox";
import type { TrackedProduct } from "./types";
import "./styles.css";

const ProductDetail = lazy(() => import("./components/ProductDetail").then((module) => ({ default: module.ProductDetail })));

export default function App() {
  const [products, setProducts] = useState<TrackedProduct[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading tracked products…");

  const refresh = useCallback(async () => {
    try {
      const response = await api.listProducts();
      setProducts(response.items);
      setSelectedId((current) => current && response.items.some((item) => item.id === current) ? current : response.items[0]?.id ?? null);
      setMessage(response.items.length ? "" : "No products are being tracked yet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load tracked products.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const selected = products.find((product) => product.id === selectedId) ?? null;

  async function untrack(id: string) {
    try { await api.untrack(id); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not stop tracking the product."); }
  }

  return (
    <>
      <header className="site-header"><a href="#main" className="brand"><span>W</span> Watchtower</a><p>INE mock-store monitor</p></header>
      <main id="main">
        <section className="hero"><p className="eyebrow">Reliable price tracking</p><h1>Know what changed,<br />and when.</h1><p>Watch prices and availability on INE’s assignment store. Every check—including every failure—is recorded.</p></section>
        <SearchBox onTracked={refresh} />
        <section className="products-section" aria-labelledby="tracked-title">
          <div className="section-heading"><div><p className="eyebrow">Dashboard</p><h2 id="tracked-title">Tracked products</h2></div><button className="text-button" onClick={() => void refresh()}>Refresh dashboard</button></div>
          {message && <p className="empty-state" role="status">{message}</p>}
          <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} selected={product.id === selectedId} onSelect={() => setSelectedId(product.id)} onUntrack={() => untrack(product.id)} />)}</div>
        </section>
        {selected && <Suspense fallback={<p className="empty-state">Loading product history…</p>}><ProductDetail product={selected} /></Suspense>}
      </main>
      <footer><span>Watchtower</span><span>Built for the INE Software Engineer Intern assignment.</span></footer>
    </>
  );
}
