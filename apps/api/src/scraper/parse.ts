import { AppError } from "../errors.js";

const UNICODE_ZERO = "０".charCodeAt(0);

export function normalizeDigits(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= UNICODE_ZERO && code <= UNICODE_ZERO + 9 ? String(code - UNICODE_ZERO) : character;
    })
    .join("")
    .replace(/[\u200B\u00A0]/g, " ");
}

export function parseDisplayedPrice(text: string): { price: number; currency: string } {
  const normalized = normalizeDigits(text).trim();
  const currency = /₹|\bINR\b|\bRs\.?\b/i.test(normalized) ? "INR" : null;
  if (!currency) throw new AppError("PRICE_INVALID", "Price currency was missing or unknown.", 502);

  const match = normalized.match(/[0-9][0-9,. ]*/);
  if (!match) throw new AppError("PRICE_INVALID", "Price did not contain a number.", 502);
  let numberText = match[0].replace(/\s/g, "");
  if (/^[0-9.]+,[0-9]{2}$/.test(numberText)) numberText = numberText.replace(/\./g, "").replace(",", ".");
  else numberText = numberText.replace(/,/g, "");
  const price = Number(numberText);
  if (!Number.isFinite(price) || price < 0) throw new AppError("PRICE_INVALID", "Price was not a valid non-negative number.", 502);
  return { price, currency };
}

export function parseStock(text: string): boolean {
  const normalized = text.trim().toLocaleLowerCase();
  if (/out of stock|unavailable/.test(normalized)) return false;
  if (/in stock|left|selling fast/.test(normalized)) return true;
  throw new AppError("STOCK_INVALID", "Stock status was missing or unknown.", 502);
}
