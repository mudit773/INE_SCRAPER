import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => vi.restoreAllMocks());

describe("tracking flow", () => {
  it("searches, tracks, and displays a product", async () => {
    const product = { id: "11111111-1111-4111-8111-111111111111", source_product_id: "1", name: "Nordkraft Headphones Pro", active: true, next_scrape_at: new Date().toISOString(), latestPrice: null, latestAttempt: null };
    let tracked = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/search")) return new Response(JSON.stringify({ items: [{ id: 1, name: product.name, brand: "Nordkraft", category: "Audio", sku: "NOR-10001" }] }), { status: 200 });
      if (url.endsWith("/products") && init?.method === "POST") { tracked = true; return new Response(JSON.stringify(product), { status: 201 }); }
      if (url.endsWith("/products")) return new Response(JSON.stringify({ items: tracked ? [product] : [] }), { status: 200 });
      if (url.includes("/history")) return new Response(JSON.stringify({ items: [] }), { status: 200 });
      if (url.includes("/attempts")) return new Response(JSON.stringify({ items: [] }), { status: 200 });
      return new Response("{}", { status: 404 });
    }));

    render(<App />);
    await screen.findByText("No products are being tracked yet.");
    await userEvent.type(screen.getByPlaceholderText(/monitor/i), "headphones");
    await screen.findByText(product.name);
    await userEvent.click(screen.getByRole("button", { name: "Track" }));
    await waitFor(() => expect(screen.getAllByText(product.name).length).toBeGreaterThan(0));
    expect(screen.getByText("Awaiting first check")).toBeInTheDocument();
    await screen.findByRole(
      "heading",
      { level: 2, name: product.name },
      { timeout: 5_000 }
    );
  });
});
