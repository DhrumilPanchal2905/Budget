// Angel AI — shared types (server + browser).
import type { Lang } from "./parse";

export type AngelLang = Lang;
export type AngelLangPref = Lang | "auto";

export type Card =
  | { type: "stats"; title?: string; items: { label: string; value: string; tone?: "pos" | "neg" | "neutral" }[] }
  | { type: "list"; title?: string; items: { title: string; subtitle?: string; value?: string; tone?: "pos" | "neg" | "neutral" }[] }
  | { type: "bars"; title?: string; items: { label: string; value: number; display: string }[] }
  | { type: "secret"; title: string; value: string; note: string }
  /** web sources (opened in a new tab) */
  | { type: "links"; title?: string; items: { title: string; url: string; snippet?: string; source?: string }[] }
  /** a call to action inside the app (sign in, upgrade …) — hrefs are internal paths */
  | { type: "cta"; title: string; text?: string; actions: { label: string; href: string; primary?: boolean }[] };

export type ActionKind =
  | "add_expense" | "add_income" | "goal_contribute" | "goal_withdraw" | "pay_emi" | "create_goal" | "create_debt" | "delete_record" | "edit_record" | "set_budget"
  | "create_user" | "change_plan" | "delete_user" | "set_user_status" | "reset_password";
export type ActionStatus = "pending" | "running" | "done" | "undoing" | "cancelled" | "undone" | "failed";

/** What the browser sees about an action (internals such as undo data stay on the server). */
export interface ActionView {
  kind: ActionKind;
  status: ActionStatus;
  summary: string;
  needsConfirm?: boolean;
  canUndo?: boolean;
}

export interface AngelMessageDTO {
  id: string;
  role: "user" | "angel";
  text: string;
  lang: Lang;
  source: "voice" | "text" | "system";
  cards?: Card[];
  action?: ActionView | null;
  suggestions?: string[];
  createdAt: string;
}

/** Angel credits left in the current window (null limit = unlimited). */
export interface AngelQuotaDTO {
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: string | null;
  windowHours: number;
  plan: string;
}

export interface ConversationDTO {
  id: string;
  title: string;
  lastMessageAt: string;
  messageCount: number;
  preview: string;
}
