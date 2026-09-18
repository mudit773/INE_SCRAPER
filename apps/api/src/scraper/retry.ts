import { AppError } from "../errors.js";

export type RetryEvent = { attempt: number; error: Error; willRetry: boolean };

export async function withRetries<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    attempts?: number;
    delaysMs?: number[];
    onFailure?: (event: RetryEvent) => Promise<void> | void;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delays = options.delaysMs ?? [2_000, 5_000];
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let finalError: Error = new Error("Scrape failed.");

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      finalError = error instanceof Error ? error : new Error(String(error));
      const retryable = !(error instanceof AppError) || error.retryable;
      const willRetry = retryable && attempt < attempts;
      await options.onFailure?.({ attempt, error: finalError, willRetry });
      if (!willRetry) throw finalError;
      const baseDelay = delays[attempt - 1] ?? delays.at(-1) ?? 0;
      await sleep(baseDelay + Math.floor(Math.random() * 250));
    }
  }
  throw finalError;
}
