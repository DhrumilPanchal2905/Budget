import mongoose from "mongoose";

// Serverless-safe MongoDB connection: one cached connection per warm function instance.
type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

const g = globalThis as unknown as { __mongoose?: Cache; __indexCheck?: boolean };
const cache: Cache = g.__mongoose ?? (g.__mongoose = { conn: null, promise: null });

mongoose.set("strictQuery", true);
// Production: never build indexes on the request path (it slowed every cold start). They are created once per
// deploy in the background by ensureIndexes() below, and by the daily job.
if (process.env.NODE_ENV === "production") mongoose.set("autoIndex", false);

/** Bump when indexes in models.ts change → every new deployment creates the missing ones once, in the background. */
const INDEX_VERSION = "2026-10-19.1";

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to .env.local (dev) or Vercel env vars (prod).");
  }
  // Common mistake: special characters in the password must be URL-encoded (@ → %40, # → %23, : → %3A, / → %2F).
  const auth = uri.match(/^mongodb(?:\+srv)?:\/\/([^/]*)/)?.[1] ?? "";
  if ((auth.match(/@/g) || []).length > 1) {
    throw new Error(
      "MONGODB_URI is invalid: the password contains '@'. URL-encode special characters in the password (@ → %40, # → %23, : → %3A, / → %2F).",
    );
  }
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(uri, {
        dbName: process.env.MONGODB_DB || "budgetpro",
        bufferCommands: false,
        // The dashboard runs ~25 small queries in parallel; a slightly bigger pool runs them in fewer waves.
        // Kept modest because every warm serverless instance holds its own pool (Atlas has a connection cap).
        maxPoolSize: Math.max(5, Math.min(50, Number(process.env.MONGODB_POOL_SIZE) || 15)),
        serverSelectionTimeoutMS: 8_000,
        socketTimeoutMS: 45_000,
        maxIdleTimeMS: 60_000,
        family: 4, // skip slow IPv6 DNS attempts on some serverless hosts
      })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }
  cache.conn = await cache.promise;
  if (!g.__indexCheck) {
    g.__indexCheck = true;
    const task = () =>
      ensureIndexes(false).catch(() => {
        g.__indexCheck = false;
      });
    // background, never awaited — no request waits for it and a failure can't break the request
    setTimeout(() => void task(), 0);
  }
  return cache.conn;
}

/**
 * Creates any missing indexes (never drops). `force` = always run (daily job / admin button); otherwise only when
 * INDEX_VERSION changed since the last run — one tiny read per cold start, done in the background.
 */
export async function ensureIndexes(force: boolean): Promise<{ ran: boolean; models: number }> {
  const { AppSetting, ALL_MODELS } = await import("./models");
  if (!force) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur: any = await AppSetting.findOne({ key: "indexVersion" }).lean();
    if (cur?.value === INDEX_VERSION) return { ran: false, models: 0 };
  }
  const models = Object.values(ALL_MODELS);
  let failed = 0;
  for (const m of models) {
    try {
      await m.createIndexes();
    } catch (err) {
      failed++;
      console.error("[db] index build failed for", m.modelName, (err as Error)?.message);
    }
  }
  if (failed) return { ran: true, models: models.length - failed }; // retried on the next cold start / daily job
  await AppSetting.updateOne({ key: "indexVersion" }, { $set: { value: INDEX_VERSION, updatedAt: new Date() } }, { upsert: true });
  return { ran: true, models: models.length };
}
