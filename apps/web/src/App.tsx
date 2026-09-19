import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { ProductCard } from "./components/ProductCard";
import { SearchBox } from "./components/SearchBox";
import { ScrapeActivity } from "./components/ScrapeActivity";
import { PriceHistoryPage } from "./components/PriceHistoryPage";
import { NotificationBell, type AlertNotification } from "./components/NotificationBell";
import type { TrackedProduct } from "./types";
import "./styles.css";

const ProductDetail = lazy(() => import("./components/ProductDetail").then((module) => ({ default: module.ProductDetail })));

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "history" | "activity">("dashboard");
  const [products, setProducts] = useState<TrackedProduct[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading tracked products…");
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);

  const computeAlerts = useCallback((items: TrackedProduct[]) => {
    const alerts: AlertNotification[] = [];
    for (const item of items) {
      if (item.latestPrice) {
        if (item.latestPrice.in_stock) {
          alerts.push({
            id: `stock-${item.id}`,
            type: "back_in_stock",
            productId: item.id,
            productName: item.name,
            message: `${item.name} is currently in stock!`,
            timestamp: new Date(item.latestPrice.observed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            read: false
          });
        }
        alerts.push({
          id: `price-${item.id}`,
          type: "price_drop",
          productId: item.id,
          productName: item.name,
          message: `${item.name} active tracked price: ₹${item.latestPrice.price.toLocaleString("en-IN")}`,
          timestamp: new Date(item.latestPrice.observed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          read: false
        });
      }
    }
    setNotifications(alerts.slice(0, 10));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await api.listProducts();
      setProducts(response.items);
      setSelectedId((current) => current && response.items.some((item) => item.id === current) ? current : response.items[0]?.id ?? null);
      setMessage(response.items.length ? "" : "No products are being tracked yet.");
      computeAlerts(response.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load tracked products.");
    }
  }, [computeAlerts]);

  useEffect(() => { void refresh(); }, [refresh]);
  const selected = products.find((product) => product.id === selectedId) ?? null;

  async function untrack(id: string) {
    try {
      await api.untrack(id);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not stop tracking the product.");
    }
  }

  const handleSelectFromAlert = (productId: string) => {
    setSelectedId(productId);
    setActiveTab("history");
  };

  return (
    <>
      <header className="site-header">
        <a href="#main" className="brand">
          <span>W</span> Watchtower
        </a>
        <div className="header-actions">
          <p>INE mock-store monitor</p>
          <NotificationBell
            notifications={notifications}
            onSelectProduct={handleSelectFromAlert}
            onClear={() => setNotifications([])}
          />
        </div>
      </header>
      <main id="main">
        <section className="hero">
          <p className="eyebrow">Reliable price tracking</p>
          <h1>Know what changed, and when.</h1>
          <p>Watch prices and availability on INE’s assignment store. Every check—including every failure—is recorded.</p>
        </section>

        <nav className="nav-tabs" aria-label="Main Navigation">
          <button
            className={`nav-tab ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`nav-tab ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            Price History & Scrape Log
          </button>
          <button
            className={`nav-tab ${activeTab === "activity" ? "active" : ""}`}
            onClick={() => setActiveTab("activity")}
          >
            All Scrape Activity
          </button>
        </nav>

        {activeTab === "dashboard" && (
          <>
            <SearchBox onTracked={refresh} />
            <section className="products-section" aria-labelledby="tracked-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Dashboard</p>
                  <h2 id="tracked-title">Tracked products</h2>
                </div>
                <button className="text-button" onClick={() => void refresh()}>
                  Refresh dashboard
                </button>
              </div>
              {message && <p className="empty-state" role="status">{message}</p>}
              <div className="product-grid">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    selected={product.id === selectedId}
                    onSelect={() => {
                      setSelectedId(product.id);
                      setActiveTab("history");
                    }}
                    onUntrack={() => untrack(product.id)}
                  />
                ))}
              </div>
            </section>
            {selected && (
              <Suspense fallback={<p className="empty-state">Loading product history…</p>}>
                <ProductDetail product={selected} />
              </Suspense>
            )}
          </>
        )}

        {activeTab === "history" && (
          <PriceHistoryPage
            products={products}
            selectedId={selectedId}
            onSelectProduct={(id) => setSelectedId(id)}
          />
        )}

        {activeTab === "activity" && <ScrapeActivity />}
      </main>
      <footer>
        <span>Watchtower</span>
        <span>Built for the INE Software Engineer Intern assignment.</span>
      </footer>
    </>
  );
}
