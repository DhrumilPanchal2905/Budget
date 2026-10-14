import mongoose from "mongoose";

// Serverless-safe MongoDB connection: one cached connection per warm function instance.
type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

const g = globalThis as unknown as { __mongoose?: Cache };
const cache: Cache = g.__mongoose ?? (g.__mongoose = { conn: null, promise: null });

mongoose.set("strictQuery", true);

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
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10_000,
      })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
