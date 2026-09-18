import { describe, expect, it } from "vitest";
import { parseDisplayedPrice, parseStock } from "./parse.js";

describe("parseDisplayedPrice", () => {
  it.each([
    ["₹1,29,999", 129999],
    ["Rs. 42,900.00", 42900],
    ["₹ １２３４", 1234],
    ["₹1 29 999", 129999],
    ["₹1.299,00", 1299]
  ])("parses %s", (text, expected) => {
    expect(parseDisplayedPrice(text)).toEqual({ price: expected, currency: "INR" });
  });

  it.each(["", "Loading...", "$42", "₹ nope"])("rejects %s", (text) => {
    expect(() => parseDisplayedPrice(text)).toThrow();
  });
});

describe("parseStock", () => {
  it("understands positive and negative stock states", () => {
    expect(parseStock("Only 2 left")).toBe(true);
    expect(parseStock("Out of stock")).toBe(false);
  });

  it("does not invent a stock state", () => {
    expect(() => parseStock("Check later")).toThrow();
  });
});
