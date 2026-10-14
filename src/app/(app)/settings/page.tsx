"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { BellRing, Check, Fingerprint, KeyRound, Palette, ShieldAlert, Smartphone, Trash2, User as UserIcon } from "lucide-react";
import { useSession } from "@/components/session";
import { useTheme } from "@/components/providers";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, ConfirmDialog, Field, Input, PageHeader, Select, cn } from "@/components/ui";
import { api, ApiClientError, fmtDate, timeAgo } from "@/lib/client";
import { deviceLoginSupported, enableDeviceLogin, forgetDevice, getRememberedDevice, rememberDevice } from "@/lib/device-login";
import { THEMES } from "@/lib/themes";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function ProfileCard() {
  const { user, refresh, can } = useSession();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [currency, setCurrency] = useState(user.currency);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== user.name || currency !== user.currency;

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const r = await api("/api/auth/me", { method: "PATCH", body: { name: name.trim(), currency } });
      toast.success(r.message || "Profile updated successfully.");
      refresh();
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      toast.error("Could not update profile", err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><UserIcon className="h-4 w-4 text-muted" /> Profile</span>} subtitle={`Member since ${fmtDate(String(user.createdAt))}`} />
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !saving) void save();
        }}
      >
        <Field label="Full name" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} invalid={Boolean(errors.name)} disabled={!can("settings.write")} />
        </Field>
        <Field label="Email" hint="Contact an admin to change your email.">
          <Input value={user.email} disabled />
        </Field>
        <Field label="Currency" error={errors.currency}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!can("settings.write")}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Plan & role">
          <div className="flex h-10 items-center gap-2">
            <Badge tone="primary">{user.plan.toUpperCase()}</Badge>
            <Badge tone={user.role === "admin" ? "warning" : "default"}>{user.role}</Badge>
          </div>
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={saving} disabled={!dirty || !can("settings.write")}>
            Save profile
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const { can } = useSession();
  const toast = useToast();
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Palette className="h-4 w-4 text-muted" /> Appearance</span>} subtitle="Your theme syncs across devices." />
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={async () => {
              setTheme(t.id);
              if (can("settings.write")) {
                try {
                  await api("/api/auth/me", { method: "PATCH", body: { theme: t.id } });
                  toast.success(`${t.name} theme applied.`);
                } catch {
                  /* theme still applied locally */
                }
              }
            }}
            className={cn("group rounded-xl border p-2 text-left transition-colors", theme === t.id ? "border-primary ring-1 ring-primary/40" : "border-border hover:border-muted")}
          >
            <div className="h-14 rounded-lg p-2" style={{ background: t.swatch[0] }}>
              <div className="h-2 w-10 rounded" style={{ background: t.swatch[1] }} />
              <div className="mt-1.5 h-1.5 w-14 rounded bg-white/20" />
              <div className="mt-1 h-1.5 w-8 rounded bg-white/10" />
            </div>
            <div className="mt-2 flex items-center justify-between px-0.5 text-xs">
              <span className="font-medium">{t.name}</span>
              {theme === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!cur) errs.currentPassword = "Current password is required.";
    if (next.length < 8) errs.newPassword = "Password must be at least 8 characters.";
    if (next !== confirm) errs.confirm = "Passwords do not match.";
    if (Object.keys(errs).length) return setErrors(errs);
    setSaving(true);
    setErrors({});
    try {
      const r = await api("/api/auth/password", { method: "POST", body: { currentPassword: cur, newPassword: next } });
      toast.success(r.message || "Password changed successfully.");
      setCur("");
      setNext("");
      setConfirm("");
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      toast.error("Could not change password", err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-muted" /> Change password</span>} subtitle="Other devices are signed out after a change." />
      <form
        className="grid gap-4 p-5 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving) void save();
        }}
      >
        <Field label="Current password" error={errors.currentPassword}>
          <Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} invalid={Boolean(errors.currentPassword)} />
        </Field>
        <Field label="New password" error={errors.newPassword} hint="8+ chars, a letter and a number">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} invalid={Boolean(errors.newPassword)} />
        </Field>
        <Field label="Confirm new password" error={errors.confirm}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={Boolean(errors.confirm)} />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" loading={saving}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DevicesCard() {
  const { user } = useSession();
  const toast = useToast();
  const { data, mutate } = useSWR<{ items: { id: string; deviceName: string; createdAt: string; lastUsedAt: string | null }[] }>("/api/auth/passkeys");
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<{ id: string; deviceName: string } | null>(null);
  const [thisDeviceEnabled, setThisDeviceEnabled] = useState(false);

  useEffect(() => {
    void deviceLoginSupported().then(setSupported);
    const d = getRememberedDevice();
    setThisDeviceEnabled(Boolean(d?.passkey && d.email === user.email));
  }, [user.email]);

  const enable = async () => {
    setBusy("enable");
    try {
      await enableDeviceLogin();
      rememberDevice({ email: user.email, name: user.name, passkey: true });
      setThisDeviceEnabled(true);
      toast.success("Auto login enabled on this device.");
      void mutate();
    } catch (e) {
      toast.error("Could not enable auto login", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!toRemove) return;
    setBusy(toRemove.id);
    try {
      const r = await api(`/api/auth/passkeys/${toRemove.id}`, { method: "DELETE" });
      toast.success(r.message || "Device removed.");
      const left = (data?.items.length ?? 1) - 1;
      if (left <= 0) {
        const d = getRememberedDevice();
        if (d) rememberDevice({ ...d, passkey: false });
        setThisDeviceEnabled(false);
      }
      setToRemove(null);
      void mutate();
    } catch (e) {
      toast.error("Could not remove device", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><Fingerprint className="h-4 w-4 text-muted" /> Devices & auto login</span>}
        subtitle="Sign in with fingerprint, face or device PIN. Only a public key is stored on our server."
      />
      <div className="space-y-3 p-5">
        {!data?.items.length ? (
          <p className="text-sm text-muted">No devices set up yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {data.items.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <Smartphone className="h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.deviceName}</p>
                  <p className="text-xs text-muted">Added {timeAgo(d.createdAt)} · {d.lastUsedAt ? `last used ${timeAgo(d.lastUsedAt)}` : "never used"}</p>
                </div>
                <Button size="icon" variant="ghost" className="hover:text-danger" aria-label={`Remove ${d.deviceName}`} onClick={() => setToRemove(d)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {supported ? (
          !thisDeviceEnabled && (
            <Button onClick={enable} loading={busy === "enable"}>
              <Fingerprint className="h-4 w-4" /> Set up auto login on this device
            </Button>
          )
        ) : (
          <p className="text-xs text-muted">This browser/device has no built-in fingerprint, face or PIN authenticator.</p>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(toRemove)}
        onClose={() => setToRemove(null)}
        onConfirm={remove}
        loading={Boolean(toRemove && busy === toRemove.id)}
        title="Remove this device?"
        message={`Auto login will stop working on “${toRemove?.deviceName ?? ""}”. You can still sign in with your password.`}
        confirmLabel="Remove device"
      />
    </Card>
  );
}

function PushCard() {
  const toast = useToast();
  const { can } = useSession();
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return setPerm("unsupported");
    setPerm(Notification.permission);
    void navigator.serviceWorker.getRegistration("/").then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    });
  }, []);

  const enable = async () => {
    if (!vapid) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setPerm(permission);
      if (permission !== "granted") throw new Error("Notification permission was not granted in your browser.");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) }));
      const json = sub.toJSON();
      const r = await api("/api/push/subscribe", { method: "POST", body: { endpoint: json.endpoint, keys: json.keys } });
      setSubscribed(true);
      toast.success(r.message || "Push notifications enabled.");
    } catch (e) {
      toast.error("Could not enable push", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api("/api/push/subscribe", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Push notifications disabled on this device.");
    } catch (e) {
      toast.error("Could not disable push", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const r = await api("/api/push/test", { method: "POST" });
      toast.success(r.message || "Test sent.");
    } catch (e) {
      toast.error("Test failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-muted" /> Push notifications</span>} subtitle="Get EMI reminders and admin messages on this device." />
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {!vapid
            ? "Push is not configured on this server (VAPID keys missing)."
            : supported === false
              ? "This browser does not support web push. On iPhone, add Budget Pro to your Home Screen first."
              : perm === "denied"
                ? "Notifications are blocked in your browser settings for this site."
                : subscribed
                  ? "Enabled on this device."
                  : "Disabled on this device."}
        </p>
        {vapid && supported && can("notifications.read") && (
          <div className="flex gap-2">
            {subscribed ? (
              <>
                <Button variant="secondary" onClick={test} loading={busy}>
                  Send test
                </Button>
                <Button variant="outline" onClick={disable} disabled={busy}>
                  Disable
                </Button>
              </>
            ) : (
              <Button onClick={enable} loading={busy} disabled={perm === "denied"}>
                Enable push
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function DangerCard() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card className="border-danger/30">
      <CardHeader title={<span className="flex items-center gap-2 text-danger"><ShieldAlert className="h-4 w-4" /> Delete account</span>} subtitle="Permanently deletes your account, income, expenses, debts, goals, notifications and devices." />
      <div className="p-5">
        <Button
          variant="danger"
          onClick={() => {
            setErr(null);
            setOpen(true);
          }}
        >
          Delete my account
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        loading={busy}
        error={err}
        title="Delete your account?"
        message="This permanently removes all your data. It cannot be undone."
        typeToConfirm="DELETE"
        requirePassword
        confirmLabel="Delete account"
        onConfirm={async ({ password, confirm }) => {
          setBusy(true);
          setErr(null);
          try {
            await api("/api/auth/account", { method: "DELETE", body: { password, confirm } });
            forgetDevice();
            toast.success("Account deleted. Goodbye 👋");
            window.location.href = "/";
          } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Profile, appearance, security and notifications." />
      <div className="space-y-4">
        <ProfileCard />
        <AppearanceCard />
        <PasswordCard />
        <DevicesCard />
        <PushCard />
        <DangerCard />
      </div>
    </>
  );
}
