import { describe, expect, it, vi } from "vitest";
import { AppError } from "../errors.js";
import { withRetries } from "./retry.js";

describe("withRetries", () => {
  it("retries a temporary failure and reports the failed attempt", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new AppError("TEMP", "temporary", 502, true)).mockResolvedValue("ok");
    const onFailure = vi.fn();
    await expect(withRetries(operation, { onFailure, sleep: async () => undefined })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, willRetry: true }));
  });

  it("stops after three temporary failures", async () => {
    const operation = vi.fn().mockRejectedValue(new AppError("TEMP", "temporary", 502, true));
    const events: boolean[] = [];
    await expect(withRetries(operation, { onFailure: ({ willRetry }) => { events.push(willRetry); }, sleep: async () => undefined })).rejects.toThrow("temporary");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(events).toEqual([true, true, false]);
  });

  it("does not retry permanent validation errors", async () => {
    const operation = vi.fn().mockRejectedValue(new AppError("BAD", "bad data", 502, false));
    await expect(withRetries(operation, { sleep: async () => undefined })).rejects.toThrow("bad data");
    expect(operation).toHaveBeenCalledOnce();
  });
});
