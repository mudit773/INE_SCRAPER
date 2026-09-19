import { timingSafeEqual } from "node:crypto";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { ProductRepository } from "./db.js";
import { AppError, publicError } from "./errors.js";
import { runDueScrapes, runProductScrape } from "./scrape-runner.js";
import { searchStore } from "./store-api.js";

const uuid = z.uuid();
const pagination = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), before: z.iso.datetime().optional() });

function asyncRoute(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => handler(request, response).catch(next);
}

function authorized(header: string | undefined, secret: string): boolean {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp(config: AppConfig, repository: ProductRepository) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.FRONTEND_ORIGIN.split(",").map((value) => value.trim()) }));
  app.use(express.json({ limit: "20kb" }));
  const publicLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false });
  const mutationLimiter = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: "draft-8", legacyHeaders: false });
  app.use("/api", publicLimiter);

  app.get("/api/health", asyncRoute(async (_request, response) => {
    const database = await repository.health();
    response.status(database ? 200 : 503).json({ ok: database, database });
  }));

  app.get("/api/search", asyncRoute(async (request, response) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(80) }).parse(request.query);
    response.json({ items: await searchStore(q) });
  }));

  app.post("/api/products", mutationLimiter, asyncRoute(async (request, response) => {
    const { sourceProductId } = z.object({ sourceProductId: z.coerce.string().regex(/^\d+$/) }).parse(request.body);
    response.status(201).json(await repository.track(sourceProductId));
  }));

  app.get("/api/products", asyncRoute(async (_request, response) => {
    response.json({ items: await repository.list() });
  }));

  app.get("/api/products/:id", asyncRoute(async (request, response) => {
    response.json(await repository.get(uuid.parse(request.params.id)));
  }));

  app.delete("/api/products/:id", mutationLimiter, asyncRoute(async (request, response) => {
    await repository.untrack(uuid.parse(request.params.id));
    response.status(204).end();
  }));

  app.get("/api/products/:id/history", asyncRoute(async (request, response) => {
    const productId = uuid.parse(request.params.id);
    const query = pagination.parse(request.query);
    response.json({ items: await repository.history(productId, query.limit, query.before) });
  }));

  app.get("/api/products/:id/attempts", asyncRoute(async (request, response) => {
    const productId = uuid.parse(request.params.id);
    const query = pagination.parse(request.query);
    response.json({ items: await repository.attempts(productId, query.limit, query.before) });
  }));

  app.get("/api/activity", asyncRoute(async (request, response) => {
    const query = pagination.parse(request.query);
    response.json({ items: await repository.globalAttempts(query.limit, query.before) });
  }));

  const requireCron = (request: Request, response: Response, next: NextFunction) => {
    if (!authorized(request.headers.authorization, config.CRON_SECRET)) {
      response.status(401).json({ error: { code: "UNAUTHORIZED", message: "A valid cron token is required." } });
      return;
    }
    next();
  };

  app.post("/api/jobs/scrape-due", requireCron, asyncRoute(async (_request, response) => {
    const results = await runDueScrapes(repository, 3);
    response.json({ processed: results.length, results });
  }));

  app.post("/api/products/:id/scrape", requireCron, asyncRoute(async (request, response) => {
    const product = await repository.claimOne(uuid.parse(request.params.id));
    const result = await runProductScrape(repository, product, "manual");
    response.status(result.ok ? 200 : 502).json(result);
  }));

  app.use((_request, response) => response.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } }));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next;
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: { code: "INVALID_REQUEST", message: error.issues[0]?.message ?? "Invalid request." } });
      return;
    }
    const status = error instanceof AppError ? error.status : 500;
    if (status >= 500) console.error(error);
    response.status(status).json({ error: publicError(error) });
  });
  return app;
}

export { authorized };
