// Promote an existing (registered) user to admin with every permission.
// Usage:  npm run make-admin -- someone@example.com
// Reads MONGODB_URI / MONGODB_DB from the environment or from .env.local / .env.
import { readFileSync, existsSync } from "node:fs";
import mongoose from "mongoose";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run make-admin -- you@example.com");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set.");
  process.exit(1);
}

const ALL = [
  "finance.read", "finance.write",
  "income.view", "income.create", "income.update", "income.delete",
  "expense.view", "expense.create", "expense.update", "expense.delete",
  "debt.view", "debt.create", "debt.update", "debt.delete",
  "goal.view", "goal.create", "goal.update", "goal.delete",
  "notifications.read", "notifications.manage", "insights.view",
  "reports.view", "reports.export", "settings.write",
  "users.view", "users.create", "users.update", "users.delete",
  "users.finance.view", "users.finance.manage",
  "database.view", "database.delete", "audit.view", "admin.notifications.send",
];

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || "budgetpro" });
const res = await mongoose.connection.collection("users").updateOne(
  { email },
  { $set: { role: "admin", plan: "unlimited", permissions: ALL, status: "active", updatedAt: new Date() } },
);
if (!res.matchedCount) console.error(`No user found with email ${email}. Register first, then run this again.`);
else console.log(`✅ ${email} is now an admin with all permissions.`);
await mongoose.disconnect();
