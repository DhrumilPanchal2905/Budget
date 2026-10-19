"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, CreditCard, Database, Gauge, Lock, Mail, Send, ShieldCheck, XCircle } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Skeleton } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";

interface Settings {
  email: {
    active: { source: "admin" | "env" | "none"; fromName: string; fromEmail: string; user: string; host: string; port: number; ready: boolean };
    saved: { enabled: boolean; fromName: string; fromEmail: string; user: string; host: string; port: number; secure?: boolean; hasPassword: boolean } | null;
    envFallback: { user: string | null; hasPassword: boolean };
  };
  security: { encryptedApi: boolean; requireEncryption: boolean };
  payments?: { mode: "live" | "test" | "off"; webhook: boolean; webhookUrl: string };
  webSearch?: { provider: string | null };
}

/** Payments (Razorpay) and Angel's web search — what is set up. */
function IntegrationsCard({ data }: { data: Settings }) {
  const p = data.payments;
  const w = data.webSearch;
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-muted" /> Payments & web answers</span>} />
      <ul className="space-y-3 p-5 text-sm">
        <li className="flex items-start gap-2">
          {p?.mode === "off" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
          <span>
            <b>Razorpay:</b> {p?.mode === "live" ? "LIVE mode — real payments." : p?.mode === "test" ? "TEST mode — no real money (switch to rzp_live_ keys after KYC)." : "not set up. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel env, then redeploy."}
            {p && p.mode !== "off" && (
              <span className="block text-xs text-muted">
                Webhook {p.webhook ? "secret set ✓" : "secret missing ✗ (RAZORPAY_WEBHOOK_SECRET)"} · URL: <code className="select-all">{p.webhookUrl}</code> · events: payment.captured, payment.failed, order.paid, payment.refunded
              </span>
            )}
          </span>
        </li>
        <li className="flex items-start gap-2">
          {w?.provider ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
          <span>
            <b>Angel web answers:</b> {w?.provider ? `${w.provider} (Google-quality results).` : "free sources (Wikipedia + DuckDuckGo). For Google results add SERPER_API_KEY (serper.dev, 2,500 free searches)."}
          </span>
        </li>
      </ul>
    </Card>
  );
}

function EmailCard({ data, onSaved }: { data: Settings; onSaved: (d: Settings) => void }) {
  const toast = useToast();
  const { user } = useSession();
  const s = data.email.saved;
  const a = data.email.active;
  const [form, setForm] = useState({
    fromName: s?.fromName ?? a.fromName ?? "Budget Pro",
    fromEmail: s?.fromEmail ?? a.fromEmail,
    user: s?.user ?? a.user,
    password: "",
    host: s?.host ?? a.host ?? "smtp.gmail.com",
    port: String(s?.port ?? a.port ?? 465),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState(user.email);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    // keep "from" in sync with the login when they were the same
    setForm((f) => (f.fromEmail === "" ? { ...f, fromEmail: f.user } : f));
  }, []);

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const r = await api<Settings>("/api/admin/settings", {
        method: "PUT",
        body: { enabled: true, fromName: form.fromName, fromEmail: form.fromEmail || form.user, user: form.user, password: form.password || undefined, host: form.host, port: Number(form.port) || 465 },
      });
      onSaved(r.data);
      setForm((f) => ({ ...f, password: "" }));
      toast.success(r.message || "Email settings saved.");
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      toast.error("Could not save", err.message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api("/api/admin/settings/test-email", { method: "POST", body: { to: testTo } });
      toast.success(r.message || "Test email sent.");
    } catch (e) {
      toast.error("Test failed", (e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted" /> Email sender (OTP codes)</span>}
        subtitle="Used for sign-up verification codes and password resets. Change it any time — no redeploy needed."
        action={a.ready ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Working · {a.source === "admin" ? "saved here" : "from env"}</Badge> : <Badge tone="danger"><XCircle className="h-3 w-3" /> Not set up</Badge>}
      />
      <div className="space-y-4 p-5">
        {!a.ready && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            New users can&apos;t sign up until email works. For Gmail: turn on <b>2-Step Verification</b> for {form.user || "the account"}, then create an <b>App Password</b> (Google Account → Security → App passwords) and paste the 16-character code below.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gmail / SMTP login" error={errors.user} htmlFor="m-user">
            <Input id="m-user" type="email" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
          </Field>
          <Field label={s?.hasPassword ? "App Password (leave empty to keep the saved one)" : "App Password"} error={errors.password} htmlFor="m-pass">
            <Input id="m-pass" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={s?.hasPassword ? "•••• •••• •••• ••••" : "16-character app password"} />
          </Field>
          <Field label="Sender name" error={errors.fromName} htmlFor="m-name">
            <Input id="m-name" value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
          </Field>
          <Field label="Sender email (From)" error={errors.fromEmail} htmlFor="m-from" hint="Usually the same as the login.">
            <Input id="m-from" type="email" value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} />
          </Field>
          <Field label="SMTP host" htmlFor="m-host">
            <Input id="m-host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
          </Field>
          <Field label="Port" htmlFor="m-port" hint="465 (SSL) or 587 (STARTTLS)">
            <Input id="m-port" inputMode="numeric" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value.replace(/\D/g, "") })} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} loading={saving}>
            Save sender
          </Button>
          <span className="flex items-center gap-1 text-xs text-muted">
            <Lock className="h-3.5 w-3.5" /> The password is encrypted before it is stored and is never shown again.
          </span>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end">
          <Field label="Send a test email to" className="flex-1" htmlFor="m-test">
            <Input id="m-test" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={test} loading={testing}>
            <Send className="h-4 w-4" /> Send test
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SecurityCard({ data }: { data: Settings }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const optimise = async () => {
    setBusy(true);
    try {
      const r = await api("/api/admin/maintenance", { method: "POST" });
      toast.success(r.message || "Done.");
    } catch (e) {
      toast.error("Failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted" /> Security & performance</span>} />
      <ul className="space-y-3 p-5 text-sm">
        <li className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span>
            <b>End-to-end encrypted API.</b> Every request and response body is AES-256-GCM encrypted (ECDH key agreement) on top of HTTPS — the browser&apos;s Network tab only shows ciphertext.
            {data.security.requireEncryption ? " Unencrypted write requests are rejected." : " Tip: set REQUIRE_ENCRYPTED_API=true to reject any unencrypted write request."}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span>
            <b>Email-verified sign-ups.</b> Self-registered accounts are created only after the 6-digit email code is verified. Accounts you create as admin skip this.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span>
            <b>Argon2id passwords, HttpOnly sessions, CSRF checks, rate limits, audit log</b> — unchanged and active.
          </span>
        </li>
        <li className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted" /> Database indexes are created automatically after each deploy. Run it now if pages feel slow.
          </span>
          <Button size="sm" variant="secondary" onClick={optimise} loading={busy}>
            Optimise
          </Button>
        </li>
      </ul>
    </Card>
  );
}

/** Where the time goes: server region and one database round trip. */
function SpeedCard() {
  const [r, setR] = useState<{ region: string; connectMs: number; dbMs: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setR(await res.json());
    } catch {
      setR(null);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run();
  }, []);
  const slow = r ? r.dbMs > 25 : false;
  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-muted" /> Speed check</span>}
        subtitle="One database round trip from the server. Same-region setups answer in under 5 ms."
        action={<Button size="sm" variant="secondary" onClick={run} loading={busy}>Test again</Button>}
      />
      <div className="space-y-3 p-5 text-sm">
        {!r ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-surface-2/60 p-3"><p className="text-xs text-muted">Server region</p><p className="mt-1 font-semibold">{r.region}</p></div>
              <div className="rounded-xl border border-border bg-surface-2/60 p-3"><p className="text-xs text-muted">Database round trip</p><p className={`tabular mt-1 font-semibold ${slow ? "text-danger" : "text-success"}`}>{r.dbMs} ms</p></div>
              <div className="rounded-xl border border-border bg-surface-2/60 p-3"><p className="text-xs text-muted">Connect (cold start)</p><p className="tabular mt-1 font-semibold">{r.connectMs} ms</p></div>
            </div>
            {slow ? (
              <p className="rounded-lg border border-danger/40 bg-danger/10 p-3">
                <b>Database is far from the server.</b> Every page runs 10–25 queries, so each {r.dbMs} ms trip adds up to seconds. Fix: in MongoDB Atlas, create / move the cluster to <b>AWS Mumbai (ap-south-1)</b> — the server runs in <b>{r.region}</b> (vercel.json → regions). Or set vercel.json &quot;regions&quot; to the region closest to your Atlas cluster.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-success"><CheckCircle2 className="h-4 w-4" /> Server and database are close together — that&apos;s the fastest setup.</p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Inner() {
  const { data, error, isLoading, mutate } = useSWR<Settings>("/api/admin/settings");
  return (
    <>
      <PageHeader title="System settings" subtitle="Email sender, payments, web answers, speed, security and maintenance." />
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-4">
          <EmailCard data={data} onSaved={(d) => void mutate(d, { revalidate: false })} />
          <IntegrationsCard data={data} />
          <SpeedCard />
          <SecurityCard data={data} />
        </div>
      )}
    </>
  );
}

export default function AdminSettingsPage() {
  return (
    <RequirePerm admin perm="database.view">
      <Inner />
    </RequirePerm>
  );
}
