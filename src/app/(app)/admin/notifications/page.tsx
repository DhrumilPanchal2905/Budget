"use client";

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { useToast } from "@/components/toast";
import { Button, Card, ConfirmDialog, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";

function Inner() {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("all");
  const [push, setPush] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setErrors({});
    try {
      const r = await api("/api/admin/notifications", { method: "POST", body: { title, message, audience, push } });
      toast.success(r.message || "Broadcast sent.");
      setTitle("");
      setMessage("");
      setConfirm(false);
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      toast.error("Broadcast failed", err.message);
    } finally {
      setBusy(false);
    }
  };

  const audienceLabel = ({ all: "all active users", free: "Free plan users", plus: "Plus plan users", pro: "Pro plan users", unlimited: "Unlimited plan users", admins: "administrators" } as Record<string, string>)[audience];

  return (
    <Card className="max-w-2xl">
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && message.trim()) setConfirm(true);
        }}
      >
        <Field label="Audience">
          <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">All active users</option>
            <option value="free">Free plan</option>
            <option value="plus">Plus plan</option>
            <option value="pro">Pro plan</option>
            <option value="unlimited">Unlimited plan</option>
            <option value="admins">Admins only</option>
          </Select>
        </Field>
        <Field label="Title" error={errors.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Scheduled maintenance tonight" />
        </Field>
        <Field label="Message" error={errors.message}>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={5} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
          Also send as push notification (to users who enabled push)
        </label>
        <Button type="submit" disabled={!title.trim() || !message.trim()}>
          <Megaphone className="h-4 w-4" /> Send broadcast
        </Button>
      </form>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={send}
        loading={busy}
        danger={false}
        confirmLabel="Send now"
        title="Send broadcast?"
        message={`“${title}” will be delivered to ${audienceLabel} immediately.`}
      />
    </Card>
  );
}

export default function BroadcastPage() {
  return (
    <RequirePerm admin perm="admin.notifications.send">
      <PageHeader title="Broadcast" subtitle="Send an in-app (and optional push) notification to many users." />
      <Inner />
    </RequirePerm>
  );
}
