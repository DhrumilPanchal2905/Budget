# Budget Pro

Professional personal-finance SaaS — **Next.js 15 (App Router) + MongoDB**, frontend and backend in **one Vercel deployment**.
Production URL: **https://budget.dhrumilpanchal.in**

---

## ⚡ Quick start (local)

```bash
npm install
cp .env.example .env.local      # then put your MongoDB URL in MONGODB_URI
npm run dev                     # http://localhost:3000
```

1. Put your email in `ADMIN_EMAILS` and a strong password in `ADMIN_PASSWORD` inside `.env.local`.
2. Open http://localhost:3000/login and sign in with that email + password → the **admin** account is created automatically. (Registering with that email also makes you admin.)
3. Everything else (indexes, collections) is created automatically on first use.

> Already registered with another email? `npm run make-admin -- you@example.com`

No local MongoDB? Either use a free MongoDB Atlas cluster, or run `docker compose up -d` and set `MONGODB_URI="mongodb://localhost:27017"` (Docker is for local dev only).

---

## 1. What's inside

| Area | Implementation |
|---|---|
| Auth | Register / login / logout / current user / profile / change password / delete account. **Argon2id** hashing, server-side sessions in MongoDB (token stored only as SHA-256), **HttpOnly + Secure + SameSite=Lax** cookie (`__Host-` prefix in production), 7-day sliding idle expiry + 30-day absolute cap, logout deletes the session, password change signs out other devices. |
| Finance | Full CRUD for **income** (salary/extra, category, recurring, notes), **expenses**, **debts/EMIs** (total, remaining, EMI, interest, due date, status, *record EMI payment* → creates an "EMI / Debt" expense and advances the due date), **savings goals** (target, saved, date, status, *add contribution*). Search, filters, month filter, sorting, pagination, server-side totals, CSV export. |
| Money accuracy | All amounts stored as **integer paise** and summed in MongoDB aggregation — no floating-point drift. |
| Dashboard | Month income/expenses/balance, lifetime savings, goal savings, total debt, EMI obligations, health score (savings rate, EMI-to-income, expense ratio, goal progress), 6-month trend, category donut, goals, upcoming EMIs, recent transactions, insights, notifications. |
| Analytics | **Monthly** (daily bars, running balance, categories, month-over-month comparison, income sources) and **Overall** (long-term income vs expense, cumulative savings trend, income/expense trends, categories, debt & goal progress). |
| Insights | Rule engine in TypeScript (no Python service needed): overspending, savings rate, spend vs last month, EMI burden, near-complete goals; **advanced** (Plus/Pro): category spikes vs 3-month average, dominant category, consistent saving, goal feasibility, high-interest debt, debt-free projection, large single transactions. |
| Plans | Free (100 records, 3 goals), Plus (1,000 / 20, advanced insights), Pro (10,000 / 100), **Unlimited** (no limits, assigned by admin; every admin automatically has it). **Enforced on the server** on every create (incl. EMI payments and admin-created records). Ready for a payment webhook that updates `user.plan`; no fake payments. |
| Permissions | All 34 granular permissions from the spec, checked **server-side** on every route. Admin-only permissions only take effect for `role: "admin"`. Admins can only grant permissions they hold, cannot edit their own role/plan/status/permissions, cannot manage more-privileged admins, and the last active admin cannot be removed. |
| Admin | Overview stats (users by status/plan, collection counts, platform aggregates, sign-ups chart, live activity), user search/filter/create/edit/enable/disable/plan/role/password reset/permissions/delete, full user inspection (totals, 12-month chart, notifications, activity), **manage a user's income/expenses/debts/goals** (audited + user notified + realtime), database overview + protected purge (allow-listed collections, typed `DELETE <collection>`, password re-entry, audit), audit log viewer, broadcast notifications. |
| Notifications | List, unread count, mark one/all read, delete one/all — always scoped to the session user. Created for admin changes, goals achieved, debts repaid, EMI reminders (daily cron), password changes, broadcasts. |
| Realtime | Events `finance:changed`, `notification:new`, `admin:activity` (+ `profile:changed`, `session:revoked`). Works on Vercel out of the box via **Server-Sent Events** backed by a MongoDB outbox; switches automatically to **Pusher WebSockets** when Pusher keys are set. |
| Push | Web Push (VAPID) with service worker, per-user subscriptions bound to the session, test push, admin broadcast push, dead subscriptions cleaned up. |
| UI | Black professional design, **7 themes** (Midnight, Graphite, Ocean, Emerald, Royal, Sunset, Light) synced to the account, fully responsive (sidebar on desktop, drawer + bottom nav on mobile, tables → cards), skeletons, empty/error states, toasts, custom modals/confirm dialogs (no `alert/confirm/prompt`). |
| Security | CSRF origin check in middleware, strict security headers + CSP + HSTS, zod validation (primitive-only → NoSQL-injection safe), ObjectId validation, regex escaping, Mongo-backed rate limits (login, register, password, account delete, exports, push, DB purge, broadcast), safe error responses, audit metadata scrubbed of secrets, CSV formula-injection protection. |
| SEO | Metadata, Open Graph, favicon, manifest, `robots.txt`, `sitemap.xml`; private pages send `noindex`. |

## 2. Project structure

```
src/
  middleware.ts                 CSRF origin check, auth redirects, noindex (Edge, no DB)
  lib/                          server + shared logic
    db.ts models.ts             cached Mongoose connection, all schemas + indexes
    auth.ts env.ts              Argon2id, sessions, cookies
    api.ts errors.ts            route() wrapper: auth → role → permission → handler; safe errors
    validation.ts               zod schemas
    finance.ts finance-handlers.ts   CRUD, ownership, plan limits, EMI payment, contributions
    analytics.ts insights.ts    aggregations, dashboard, insights engine
    realtime.ts notify.ts push.ts audit.ts ratelimit.ts users.ts
    permissions.ts plans.ts finance-config.ts money.ts themes.ts client.ts
  app/
    page.tsx login/ register/   public pages
    (app)/...                   authenticated app (dashboard, income, expenses, debts, goals,
                                analytics, insights, notifications, plan, settings, admin/*)
    api/...                     all backend routes (serverless functions)
  components/                   UI kit, charts, shell, finance manager, providers
public/sw.js                    push service worker
scripts/                        generate-vapid.mjs, make-admin.mjs
vercel.json                     region + daily cron
docker-compose.yml              local MongoDB only
```

## 3. API overview

All responses: `{ "success": boolean, "message"?: string, "data"?: ..., "errors"?: {field: msg} }`.

| Method | Path | Permission |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | public (rate-limited) |
| POST/GET | `/api/auth/logout` | — |
| GET / PATCH | `/api/auth/me` | session / `settings.write` |
| POST | `/api/auth/password` | session |
| DELETE | `/api/auth/account` | session + password + "DELETE" |
| GET / POST | `/api/finance/{income\|expense\|debt\|goal}` | `finance.read`+`x.view` / `finance.write`+`x.create` |
| PATCH / DELETE | `/api/finance/{resource}/{id}` | `x.update` / `x.delete` (ownership in query) |
| POST | `/api/finance/debt/{id}/pay`, `/api/finance/goal/{id}/contribute` | `x.update` (+`expense.create` for pay) |
| GET | `/api/dashboard`, `/api/analytics?view=monthly&month=YYYY-MM\|overall`, `/api/insights`, `/api/plan` | `finance.read`, `reports.view`, `insights.view` |
| GET | `/api/reports/export?resource=expense&month=` | `reports.export` |
| GET/PATCH/DELETE | `/api/notifications`, `/api/notifications/{id}` | `notifications.read` / `.manage` |
| GET | `/api/realtime/stream` (SSE) · POST `/api/realtime/pusher-auth` | session |
| POST/DELETE | `/api/push/subscribe` · POST `/api/push/test` | session |
| GET | `/api/admin/stats` | admin + `users.view` |
| GET/POST | `/api/admin/users` | `users.view` / `users.create` |
| GET/PATCH/DELETE | `/api/admin/users/{id}` | `users.view` / `users.update` / `users.delete` |
| * | `/api/admin/users/{id}/finance/{resource}[/{recordId}[/{action}]]` | `users.finance.view` / `users.finance.manage` |
| GET/DELETE | `/api/admin/database` | `database.view` / `database.delete` |
| GET | `/api/admin/audit` | `audit.view` |
| POST | `/api/admin/notifications` | `admin.notifications.send` |
| GET | `/api/cron/reminders` | `Authorization: Bearer CRON_SECRET` |
| GET | `/api/health` | public |

## 4. Environment variables

| Variable | Required | Where | Purpose |
|---|---|---|---|
| `MONGODB_URI` | ✅ | server | MongoDB Atlas connection string |
| `MONGODB_DB` | – | server | DB name (default `budgetpro`) |
| `APP_URL` | ✅ prod | server | `https://budget.dhrumilpanchal.in` (origin check, secure cookies, sitemap) |
| `ADMIN_EMAILS` | ✅ | server | comma list; these emails are always admins (on register or login) |
| `ADMIN_PASSWORD` | – | server | first login with an `ADMIN_EMAILS` address + this password auto-creates the admin account |
| `CRON_SECRET` | ✅ prod | server | protects `/api/cron/reminders` (Vercel sends it automatically) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | push | public | Web Push public key (not secret) |
| `VAPID_PRIVATE_KEY` | push | server | Web Push private key |
| `VAPID_SUBJECT` | push | server | `mailto:` contact |
| `PUSHER_APP_ID`, `PUSHER_SECRET` | – | server | enable WebSocket realtime via Pusher |
| `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` | – | public | Pusher key/cluster (not secret) |
| `SESSION_DAYS` | – | server | idle session lifetime, default 7 |
| `APP_TIMEZONE` | – | server | default `Asia/Kolkata` (defines "current month") |

Use `.env.local` for development and Vercel's **Production** environment for production — different databases are recommended (e.g. `budgetpro_dev` vs `budgetpro`).

## 5. MongoDB Atlas setup

1. Create a free account at mongodb.com/atlas → **Build a database** → M0 (free) → provider AWS, region **Mumbai (ap-south-1)** (matches `bom1` in `vercel.json`).
2. **Database Access** → add user (password auth, role *Read and write to any database*). Use a long random password without `@ : / ?` (or URL-encode it).
3. **Network Access** → *Add IP Address* → `0.0.0.0/0` (Vercel uses dynamic IPs; access is still protected by the user/password and TLS).
4. **Connect → Drivers** → copy the `mongodb+srv://...` string → paste into `MONGODB_URI`. If the password contains `@ # : /` etc., URL-encode them (`@` → `%40`), otherwise you get `querySrv ENOTFOUND`.
5. Collections and indexes are created automatically: `users, sessions, incomes, expenses, debts, goals, notifications, auditlogs, pushsubscriptions, realtimeevents, ratelimits` (TTL indexes auto-clean sessions, realtime events and rate-limit buckets).

## 6. Deploy to Vercel

1. Push this folder to a GitHub repo (`git init && git add . && git commit -m "Budget Pro" && git push`).
2. vercel.com → **Add New → Project** → import the repo. Framework: **Next.js** (auto). Build: `next build`. No other settings needed.
3. **Settings → Environment Variables** (Production): add `MONGODB_URI`, `MONGODB_DB`, `APP_URL=https://budget.dhrumilpanchal.in`, `ADMIN_EMAILS`, `CRON_SECRET`, and optionally VAPID + Pusher keys.
4. **Deploy**. Then open `/api/health` → `{"db":"up"}` means MongoDB is connected.
5. Register with your admin email.
6. Cron: `vercel.json` schedules `/api/cron/reminders` daily at 09:00 IST (03:30 UTC) — works on the Hobby plan.

## 7. Custom domain: budget.dhrumilpanchal.in

1. Vercel project → **Settings → Domains** → add `budget.dhrumilpanchal.in`.
2. At your DNS provider for `dhrumilpanchal.in`, add:

   | Type | Name | Value |
   |---|---|---|
   | CNAME | `budget` | `cname.vercel-dns.com` |

   (If Vercel shows a different project-specific target, use that.)
3. Wait for Vercel to show **Valid Configuration** — HTTPS certificate is issued automatically.
4. Make sure `APP_URL` is exactly `https://budget.dhrumilpanchal.in` and redeploy. Cookies (`__Host-bp_session`), API calls, SSE realtime and push all use the same origin, so no CORS or localhost URLs are involved.

## 8. Realtime

- **Default (zero setup):** `/api/realtime/stream` streams events with Server-Sent Events. Each stream lives ~55 s (serverless limit) and the browser reconnects automatically, resuming from `Last-Event-ID` — no events lost. Events are written to the `realtimeevents` collection (auto-expire after 2 min).
- **WebSockets (recommended at scale):** create a free app at pusher.com (Channels), then set `PUSHER_APP_ID`, `PUSHER_SECRET`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` (e.g. `ap2` Mumbai) and redeploy. The client switches to Pusher private channels (`private-user-<id>`, `private-admin`) authorised by `/api/realtime/pusher-auth`. The header shows **Live** and the transport on hover.

## 9. Push notifications

1. `npm run vapid` → copy the three lines into `.env.local` and Vercel env vars → redeploy.
2. User: **Settings → Push notifications → Enable push** (HTTPS required; on iPhone, add the site to the Home Screen first — iOS 16.4+).
3. Pushes are sent for EMI reminders, admin changes, goal/debt milestones, password changes and broadcasts.

## 10. Production security checklist

- [ ] `APP_URL` is `https://budget.dhrumilpanchal.in` (enables `Secure` + `__Host-` cookie)
- [ ] Strong unique Atlas DB user password; DB user is not an Atlas admin
- [ ] `CRON_SECRET` set (random 32+ bytes)
- [ ] `ADMIN_EMAILS` contains only your email; remove it after creating the admin if you prefer
- [ ] Separate dev and prod databases
- [ ] No secrets in `NEXT_PUBLIC_*` variables
- [ ] Atlas backups enabled (paid tiers) or periodic `mongodump`
- [ ] Review the audit log regularly

## 11. Testing checklist

**Auth:** register → auto sign-in; logout → `/dashboard` redirects to login; login wrong password → error + rate limit after repeated tries; profile update; password change (other sessions signed out); delete account (all data removed).
**Finance:** create/edit/delete income, expense, debt, goal; record EMI payment (expense created, remaining reduced, due date advanced, closes at 0); add goal contribution (achieved notification at 100%).
**Security:** as user A, call `PATCH /api/finance/expense/<user B id>` → 404; send `role`/`plan`/`permissions` to `/api/auth/me` → ignored; non-admin calls `/api/admin/*` → 403; exceed Free limits → 402 with message; request without/with invalid cookie → 401; cross-site POST → 403.
**Admin:** list/search users, create, edit, disable (user is logged out instantly), change plan (user sees new limits + notification), assign/remove permissions, inspect user, add/edit/delete their records (user's dashboard updates live + notification), delete user, database counts + purge with confirmation, audit log, broadcast.
**Realtime:** open the app in two browsers as the same user → add an expense in one, the other updates; admin overview activity updates live.
**Deployment:** `npm run build` passes locally; `/api/health` OK on Vercel; domain shows valid HTTPS; cookie is `__Host-bp_session`, `HttpOnly`, `Secure`.

## 12. Remaining limitations

- Payments are not integrated (by design). Plan changes are made by an admin; plug a Razorpay/Stripe webhook into `user.plan` later.
- "Recurring" is stored and displayed but recurring entries are not auto-generated each period.
- SSE realtime polls MongoDB every 1.5 s per open tab; for many concurrent users switch to Pusher (env vars only).
- Plan-limit checks count then insert, so two simultaneous requests could exceed a limit by one record.
- The Inter font is downloaded by `next/font` at build time (Vercel builds have internet).
