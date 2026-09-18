import { describe, expect, it } from "vitest";
import { imageUrlFromStorePayload } from "./store-api.js";

describe("imageUrlFromStorePayload", () => {
  it("reads known image fields", () => {
    expect(imageUrlFromStorePayload({ imageUrl: "https://cdn.example/a.jpg" })).toBe("https://cdn.example/a.jpg");
    expect(imageUrlFromStorePayload({ image_url: "https://cdn.example/b.jpg" })).toBe("https://cdn.example/b.jpg");
  });

  it("ignores missing or non-http values", () => {
    expect(imageUrlFromStorePayload({ imageUrl: "/relative.jpg" })).toBeNull();
    expect(imageUrlFromStorePayload({})).toBeNull();
  });
});
