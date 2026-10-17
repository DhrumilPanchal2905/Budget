import mongoose, { Schema, model, models, type Model, Types } from "mongoose";

const { ObjectId } = Schema.Types;

// ---------- Users ----------
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["user", "admin"], default: "user", index: true },
    permissions: { type: [String], default: [] },
    plan: { type: String, enum: ["free", "plus", "pro", "unlimited"], default: "free", index: true },
    status: { type: String, enum: ["active", "disabled"], default: "active", index: true },
    currency: { type: String, default: "INR", maxlength: 3 },
    theme: { type: String, default: "midnight", maxlength: 20 },
    /** preferred language for Angel AI replies + suggestions ("auto" = follow the question) */
    // NOTE: must NOT be called "language" — the users collection has a text index, and MongoDB treats a field named
    // "language" as the text-search language override and rejects values like "auto"/"hn" (broke every login).
    replyLanguage: { type: String, enum: ["auto", "en", "hi", "gu", "hn"] },
    lastLoginAt: { type: Date },
    /** self-registered accounts verify their email with an OTP; admin-created accounts are trusted */
    emailVerified: { type: Boolean, default: true },
    emailVerifiedAt: { type: Date },
    lastSeenAt: { type: Date },
    lastLocation: {
      country: { type: String, maxlength: 80 },
      region: { type: String, maxlength: 80 },
      city: { type: String, maxlength: 80 },
    },
  },
  { timestamps: true },
);
userSchema.index({ name: "text", email: "text" });
userSchema.index({ createdAt: -1 });

// ---------- Sessions (server-side, token stored only as SHA-256 hash) ----------
const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: ObjectId, ref: "User", required: true, index: true },
  expiresAt: { type: Date, required: true },
  lastSeenAt: { type: Date, default: Date.now },
  ip: { type: String, maxlength: 64 },
  userAgent: { type: String, maxlength: 300 },
  remember: { type: Boolean, default: false },
  method: { type: String, enum: ["password", "passkey", "register"], default: "password" },
  country: { type: String, maxlength: 80 },
  region: { type: String, maxlength: 80 },
  city: { type: String, maxlength: 80 },
  createdAt: { type: Date, default: Date.now },
});
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ---------- Finance ----------
// Auto-repeat (opt-in per entry): the daily job adds the next salary / rent / bill automatically.
// Older entries never had this switched on, so nothing is created for them unless the user enables it.
const RECURRENCE_FIELDS = {
  autoRepeat: { type: Boolean, default: false },
  recurrenceNext: { type: Date }, // next date the job should create
  recurringParentId: { type: ObjectId }, // set on entries the job created
};
const incomeSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ["salary", "extra"], default: "extra" },
    category: { type: String, required: true, maxlength: 40 },
    amount: { type: Number, required: true, min: 0 }, // minor units (paise)
    date: { type: Date, required: true },
    recurring: { type: String, enum: ["none", "weekly", "monthly", "yearly"], default: "none" },
    notes: { type: String, maxlength: 1000, default: "" },
    ...RECURRENCE_FIELDS,
  },
  { timestamps: true },
);
incomeSchema.index({ userId: 1, date: -1 });
incomeSchema.index({ userId: 1, category: 1 });
incomeSchema.index({ autoRepeat: 1, recurrenceNext: 1 }, { partialFilterExpression: { autoRepeat: true } });
incomeSchema.index({ recurringParentId: 1, date: 1 }, { unique: true, partialFilterExpression: { recurringParentId: { $exists: true } } });

const expenseSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, maxlength: 40 },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    recurring: { type: String, enum: ["none", "weekly", "monthly", "yearly"], default: "none" },
    notes: { type: String, maxlength: 1000, default: "" },
    debtId: { type: ObjectId, ref: "Debt" }, // set when created by "record EMI payment"
    ...RECURRENCE_FIELDS,
  },
  { timestamps: true },
);
expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ userId: 1, category: 1 });
expenseSchema.index({ autoRepeat: 1, recurrenceNext: 1 }, { partialFilterExpression: { autoRepeat: true } });
expenseSchema.index({ recurringParentId: 1, date: 1 }, { unique: true, partialFilterExpression: { recurringParentId: { $exists: true } } });

const debtSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    totalAmount: { type: Number, required: true, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    emiAmount: { type: Number, required: true, min: 0 },
    interestRate: { type: Number, min: 0, max: 100, default: 0 },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ["active", "paused", "closed"], default: "active" },
    notes: { type: String, maxlength: 1000, default: "" },
    lastReminderFor: { type: Date },
  },
  { timestamps: true },
);
debtSchema.index({ userId: 1, status: 1, dueDate: 1 });
debtSchema.index({ status: 1, dueDate: 1 });

const goalSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    targetAmount: { type: Number, required: true, min: 1 },
    currentAmount: { type: Number, default: 0, min: 0 },
    targetDate: { type: Date, required: true },
    status: { type: String, enum: ["active", "paused", "achieved", "cancelled"], default: "active" },
    notes: { type: String, maxlength: 1000, default: "" },
  },
  { timestamps: true },
);
goalSchema.index({ userId: 1, status: 1, targetDate: 1 });

// ---------- Notifications ----------
const notificationSchema = new Schema({
  userId: { type: ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["finance", "admin", "goal", "debt", "insight", "system"], default: "system" },
  title: { type: String, required: true, maxlength: 140 },
  message: { type: String, required: true, maxlength: 1000 },
  link: { type: String, maxlength: 200 },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

// ---------- Audit log ----------
const auditSchema = new Schema({
  actorId: { type: ObjectId, ref: "User" },
  actorEmail: { type: String, maxlength: 254 },
  actorRole: { type: String, maxlength: 10 },
  action: { type: String, required: true, maxlength: 60 },
  resource: { type: String, maxlength: 40 },
  resourceId: { type: String, maxlength: 64 },
  targetUserId: { type: ObjectId, ref: "User" },
  metadata: { type: Schema.Types.Mixed },
  ip: { type: String, maxlength: 64 },
  createdAt: { type: Date, default: Date.now },
});
auditSchema.index({ createdAt: -1 });
auditSchema.index({ actorId: 1, createdAt: -1 });
auditSchema.index({ targetUserId: 1, createdAt: -1 });
auditSchema.index({ action: 1, createdAt: -1 });

// ---------- Push subscriptions ----------
const pushSchema = new Schema({
  userId: { type: ObjectId, ref: "User", required: true, index: true },
  endpoint: { type: String, required: true, unique: true, maxlength: 1000 },
  keys: {
    p256dh: { type: String, required: true, maxlength: 200 },
    auth: { type: String, required: true, maxlength: 100 },
  },
  userAgent: { type: String, maxlength: 300 },
  createdAt: { type: Date, default: Date.now },
});

// ---------- Realtime event outbox (powers SSE on Vercel; auto-expires) ----------
const realtimeSchema = new Schema({
  channel: { type: String, required: true },
  event: { type: String, required: true },
  payload: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});
realtimeSchema.index({ channel: 1, createdAt: 1 });
realtimeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ---------- Passkeys (WebAuthn device login: fingerprint / face / device PIN) ----------
const passkeySchema = new Schema({
  userId: { type: ObjectId, ref: "User", required: true, index: true },
  credentialId: { type: String, required: true, unique: true, maxlength: 1024 }, // base64url
  publicKey: { type: String, required: true, maxlength: 4096 }, // base64url COSE key (public — not a secret)
  counter: { type: Number, default: 0 },
  transports: { type: [String], default: [] },
  deviceName: { type: String, maxlength: 80, default: "This device" },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date },
});

// ---------- Short-lived WebAuthn challenges (5 min, single use) ----------
const challengeSchema = new Schema({
  key: { type: String, required: true, unique: true },
  challenge: { type: String, required: true },
  type: { type: String, enum: ["register", "login"], required: true },
  userId: { type: ObjectId, ref: "User" },
  expiresAt: { type: Date, required: true },
});
challengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ---------- Rate limit buckets (serverless-safe, shared across instances) ----------
const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ---------- Angel AI (assistant chat history — owned by the user, deletable per chat / per message) ----------
const angelConversationSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    lang: { type: String, maxlength: 4, default: "en" },
    context: { type: Schema.Types.Mixed, default: {} }, // follow-up memory (last period, last user, pending action)
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
    preview: { type: String, maxlength: 160, default: "" },
  },
  { timestamps: true, minimize: false },
);
angelConversationSchema.index({ userId: 1, lastMessageAt: -1 });

const angelMessageSchema = new Schema({
  conversationId: { type: ObjectId, ref: "AngelConversation", required: true },
  userId: { type: ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["user", "angel"], required: true },
  text: { type: String, required: true, maxlength: 4000 },
  lang: { type: String, maxlength: 4, default: "en" },
  source: { type: String, enum: ["voice", "text", "system"], default: "text" },
  cards: { type: Schema.Types.Mixed },
  action: { type: Schema.Types.Mixed }, // { kind, status, summary, payload, undo } — undo data never leaves the server
  suggestions: { type: [String], default: undefined },
  createdAt: { type: Date, default: Date.now },
});
angelMessageSchema.index({ conversationId: 1, createdAt: 1 });
angelMessageSchema.index({ userId: 1, createdAt: -1 });


// ---------- Budgets (monthly limit per expense category; "__total__" = whole month) ----------
const budgetSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true },
    category: { type: String, required: true, maxlength: 40 },
    amount: { type: Number, required: true, min: 1 }, // minor units per month
    alertPct: { type: Number, default: 80, min: 50, max: 100 },
    /** "2026-10:80" — which alert was already sent, so each threshold notifies once per month */
    lastAlert: { type: String, maxlength: 20 },
  },
  { timestamps: true },
);
budgetSchema.index({ userId: 1, category: 1 }, { unique: true });

// ---------- Goal ledger: every contribution / withdrawal with its date (history + real pace) ----------
const goalContributionSchema = new Schema({
  userId: { type: ObjectId, ref: "User", required: true },
  goalId: { type: ObjectId, ref: "Goal", required: true },
  amount: { type: Number, required: true }, // minor units; negative = withdrawal
  date: { type: Date, required: true },
  note: { type: String, maxlength: 200, default: "" },
  source: { type: String, enum: ["app", "angel", "admin", "initial", "edit"], default: "app" },
  createdAt: { type: Date, default: Date.now },
});
goalContributionSchema.index({ goalId: 1, date: -1 });
goalContributionSchema.index({ userId: 1, date: -1 });

// ---------- Website visits (admin → Visitors). IP-based approximate location from the hosting edge. ----------
const visitSchema = new Schema({
  visitorId: { type: String, required: true, maxlength: 40 },
  userId: { type: ObjectId, ref: "User" },
  path: { type: String, maxlength: 300 },
  referrer: { type: String, maxlength: 300 },
  ip: { type: String, maxlength: 64 },
  country: { type: String, maxlength: 80 },
  countryCode: { type: String, maxlength: 4 },
  region: { type: String, maxlength: 80 },
  city: { type: String, maxlength: 80 },
  lat: { type: Number },
  lon: { type: Number },
  timezone: { type: String, maxlength: 60 },
  device: { type: String, maxlength: 20 },
  browser: { type: String, maxlength: 40 },
  os: { type: String, maxlength: 40 },
  createdAt: { type: Date, default: Date.now },
});
visitSchema.index({ createdAt: -1 });
visitSchema.index({ visitorId: 1, createdAt: -1 });
visitSchema.index({ userId: 1, createdAt: -1 });
visitSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

// ---------- App settings (admin-editable, e.g. the email sender) ----------
const appSettingSchema = new Schema({
  key: { type: String, required: true, unique: true, maxlength: 60 },
  value: { type: Schema.Types.Mixed },
  updatedBy: { type: ObjectId, ref: "User" },
  updatedAt: { type: Date, default: Date.now },
});

// ---------- Email OTPs (sign-up verification + password reset). Only a hash of the code is stored. ----------
const emailOtpSchema = new Schema({
  email: { type: String, required: true, lowercase: true, maxlength: 254 },
  purpose: { type: String, enum: ["signup", "reset"], required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  sendCount: { type: Number, default: 1 },
  lastSentAt: { type: Date, default: Date.now },
  payload: { type: Schema.Types.Mixed }, // sign-up: { name, passwordHash }
  expiresAt: { type: Date, required: true },
});
emailOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });
emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Models are typed loosely (Model<any>) on purpose: every write goes through zod validation
// in lib/validation.ts first, and loose typing keeps hot-reload + serverless re-registration simple.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getModel(name: string, schema: Schema<any>, collection: string): Model<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (models[name] as Model<any>) || model(name, schema, collection);
}

export const User = getModel("User", userSchema, "users");
export const Session = getModel("Session", sessionSchema, "sessions");
export const Income = getModel("Income", incomeSchema, "incomes");
export const Expense = getModel("Expense", expenseSchema, "expenses");
export const Debt = getModel("Debt", debtSchema, "debts");
export const Goal = getModel("Goal", goalSchema, "goals");
export const Notification = getModel("Notification", notificationSchema, "notifications");
export const AuditLog = getModel("AuditLog", auditSchema, "auditlogs");
export const PushSubscription = getModel("PushSubscription", pushSchema, "pushsubscriptions");
export const RealtimeEvent = getModel("RealtimeEvent", realtimeSchema, "realtimeevents");
export const RateLimit = getModel("RateLimit", rateLimitSchema, "ratelimits");
export const Passkey = getModel("Passkey", passkeySchema, "passkeys");
export const WebAuthnChallenge = getModel("WebAuthnChallenge", challengeSchema, "webauthnchallenges");
export const AngelConversation = getModel("AngelConversation", angelConversationSchema, "angelconversations");
export const AngelMessage = getModel("AngelMessage", angelMessageSchema, "angelmessages");
export const Budget = getModel("Budget", budgetSchema, "budgets");
export const GoalContribution = getModel("GoalContribution", goalContributionSchema, "goalcontributions");
export const Visit = getModel("Visit", visitSchema, "visits");
export const AppSetting = getModel("AppSetting", appSettingSchema, "appsettings");
export const EmailOtp = getModel("EmailOtp", emailOtpSchema, "emailotps");

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  name: string;
  role: "user" | "admin";
  permissions: string[];
  plan: "free" | "plus" | "pro" | "unlimited";
  status: "active" | "disabled";
  currency: string;
  theme: string;
  replyLanguage?: "auto" | "en" | "hi" | "gu" | "hn";
  emailVerified?: boolean;
  lastSeenAt?: Date;
  lastLocation?: { country?: string; region?: string; city?: string };
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const COLLECTIONS = {
  users: User,
  sessions: Session,
  incomes: Income,
  expenses: Expense,
  debts: Debt,
  goals: Goal,
  notifications: Notification,
  auditlogs: AuditLog,
  pushsubscriptions: PushSubscription,
  realtimeevents: RealtimeEvent,
  ratelimits: RateLimit,
  passkeys: Passkey,
  webauthnchallenges: WebAuthnChallenge,
  angelconversations: AngelConversation,
  angelmessages: AngelMessage,
  budgets: Budget,
  goalcontributions: GoalContribution,
  visits: Visit,
  emailotps: EmailOtp,
  appsettings: AppSetting,
} as const;

/** Every model (for index creation). */
export const ALL_MODELS = { User, Session, Income, Expense, Debt, Goal, Notification, AuditLog, PushSubscription, RealtimeEvent, RateLimit, Passkey, WebAuthnChallenge, AngelConversation, AngelMessage, Budget, GoalContribution, Visit, AppSetting, EmailOtp };

export function isObjectId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id) && mongoose.isValidObjectId(id);
}

export function oid(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === "string" ? new Types.ObjectId(id) : id;
}
