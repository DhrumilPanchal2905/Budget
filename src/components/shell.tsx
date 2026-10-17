"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import useSWR from "swr";
import {
  Activity,
  BarChart3,
  Bell,
  Check,
  CreditCard,
  Database,
  Gauge,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Megaphone,
  Menu,
  Palette,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  X,
  MoreHorizontal,
  Wallet,
  Globe,
  SlidersHorizontal,
} from "lucide-react";
import { api, timeAgo } from "@/lib/client";
import { THEMES } from "@/lib/themes";
import type { Permission } from "@/lib/permissions";
import { useSession, useRealtime } from "./session";
import { useTheme } from "./providers";
import { useToast } from "./toast";
import { Badge, cn } from "./ui";
import { AngelProvider, useAngelOptional } from "./angel/angel-provider";
import { AngelOrb } from "./angel/orb";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm?: Permission;
}

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "finance.read" },
  { href: "/income", label: "Income", icon: TrendingUp, perm: "income.view" },
  { href: "/expenses", label: "Expenses", icon: TrendingDown, perm: "expense.view" },
  { href: "/budgets", label: "Budgets", icon: Wallet, perm: "expense.view" },
  { href: "/debts", label: "Debts & EMIs", icon: Landmark, perm: "debt.view" },
  { href: "/goals", label: "Savings goals", icon: Target, perm: "goal.view" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, perm: "reports.view" },
  { href: "/insights", label: "Angel suggestions", icon: Lightbulb, perm: "insights.view" },
  { href: "/notifications", label: "Notifications", icon: Bell, perm: "notifications.read" },
];
const ACCOUNT_NAV: NavItem[] = [
  { href: "/plan", label: "Plan & usage", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];
const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Admin overview", icon: Gauge, perm: "users.view" },
  { href: "/admin/users", label: "Users", icon: Users, perm: "users.view" },
  { href: "/admin/visitors", label: "Visitors (live)", icon: Globe, perm: "users.view" },
  { href: "/admin/database", label: "Database", icon: Database, perm: "database.view" },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, perm: "audit.view" },
  { href: "/admin/notifications", label: "Broadcast", icon: Megaphone, perm: "admin.notifications.send" },
  { href: "/admin/settings", label: "System settings", icon: SlidersHorizontal, perm: "database.view" },
];

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="h-8 w-8" />
      <span className="text-[15px] font-semibold tracking-tight">Budget Pro</span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can, isAdmin } = useSession();
  const { data } = useSWR<{ unread: number }>(can("notifications.read") ? "/api/notifications?limit=1" : null);
  const visible = (items: NavItem[]) => items.filter((i) => !i.perm || can(i.perm));
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  const render = (items: NavItem[]) =>
    visible(items).map((item) => {
      const Icon = item.icon;
      const active = isActive(item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            active ? "bg-primary/12 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
          )}
        >
          <Icon className={cn("h-4 w-4", active ? "text-primary" : "")} />
          <span className="flex-1">{item.label}</span>
          {item.href === "/notifications" && data?.unread ? (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-fg">{data.unread > 99 ? "99+" : data.unread}</span>
          ) : null}
        </Link>
      );
    });

  const adminItems = isAdmin ? visible(ADMIN_NAV) : [];
  return (
    <nav className="flex flex-col gap-0.5">
      <AngelNavItem onNavigate={onNavigate} />
      {render(MAIN_NAV)}
      <p className="mb-1 mt-5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted/70">Account</p>
      {render(ACCOUNT_NAV)}
      {adminItems.length > 0 && (
        <>
          <p className="mb-1 mt-5 flex items-center gap-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted/70">
            <ShieldCheck className="h-3 w-3" /> Admin
          </p>
          {render(ADMIN_NAV)}
        </>
      )}
    </nav>
  );
}

/** "Angel AI" entry at the top of the menu (Unlimited plan / admins only). */
function AngelNavItem({ onNavigate }: { onNavigate?: () => void }) {
  const angel = useAngelOptional();
  if (!angel?.eligible) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        angel.setOpen(true);
      }}
      className={cn("mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors", angel.open ? "bg-primary/12 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}
    >
      <AngelOrb size={18} state={angel.mode === "wake" ? "wake" : "idle"} halo={false} />
      <span className="flex-1">Angel AI</span>
      {angel.mode === "wake" && <span className="h-1.5 w-1.5 rounded-full bg-success" title="Listening for “Angel active”" />}
    </button>
  );
}

function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && onOutside();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [ref, onOutside, active]);
}

function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const { can } = useSession();
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Change theme">
        <Palette className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-48 animate-fade-in rounded-xl border border-border bg-surface p-1.5 shadow-2xl">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
                if (can("settings.write")) void api("/api/auth/me", { method: "PATCH", body: { theme: t.id } }).catch(() => {});
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2"
            >
              <span className="flex h-4 w-6 overflow-hidden rounded border border-border">
                <span className="flex-1" style={{ background: t.swatch[0] }} />
                <span className="flex-1" style={{ background: t.swatch[1] }} />
              </span>
              <span className="flex-1 text-left">{t.name}</span>
              {theme === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface NotifItem {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link: string | null;
}

function Bell_() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { can } = useSession();
  const { data, mutate } = useSWR<{ items: NotifItem[]; unread: number }>(can("notifications.read") ? "/api/notifications?limit=6" : null);
  useClickOutside(ref, () => setOpen(false), open);
  if (!can("notifications.read")) return null;
  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Notifications (${unread} unread)`}>
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-fade-in rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && can("notifications.manage") && (
              <button
                className="text-xs text-primary hover:underline"
                onClick={async () => {
                  await api("/api/notifications", { method: "PATCH" }).catch(() => {});
                  void mutate();
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!data?.items.length ? (
              <p className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</p>
            ) : (
              data.items.map((n) => (
                <Link
                  key={n.id}
                  href={n.link || "/notifications"}
                  onClick={() => {
                    setOpen(false);
                    if (!n.read && can("notifications.manage")) void api(`/api/notifications/${n.id}`, { method: "PATCH" }).then(() => mutate()).catch(() => {});
                  }}
                  className="flex gap-3 border-b border-border/60 px-4 py-3 last:border-0 hover:bg-surface-2"
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{n.title}</span>
                    <span className="line-clamp-2 block text-xs text-muted">{n.message}</span>
                    <span className="mt-1 block text-[11px] text-muted/70">{timeAgo(n.createdAt)}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-surface-2">
            View all
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useSession();
  const toast = useToast();
  useClickOutside(ref, () => setOpen(false), open);
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const logout = async () => {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      setBusy(false);
      toast.error("Could not sign out", "Please try again.");
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-surface-2" aria-label="Account menu">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{initials}</span>
        <span className="hidden max-w-[120px] truncate text-sm sm:block">{user.name.split(" ")[0]}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-60 animate-fade-in rounded-xl border border-border bg-surface p-1.5 shadow-2xl">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <div className="mt-2 flex gap-1.5">
              <Badge tone="primary">{user.plan.toUpperCase()}</Badge>
              {user.role === "admin" && <Badge tone="warning">ADMIN</Badge>}
            </div>
          </div>
          <div className="my-1 h-px bg-border" />
          <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
            <Settings className="h-4 w-4 text-muted" /> Settings
          </Link>
          <Link href="/plan" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
            <CreditCard className="h-4 w-4 text-muted" /> Plan & usage
          </Link>
          <button onClick={logout} disabled={busy} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10 disabled:opacity-60">
            <LogOut className="h-4 w-4" /> {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

function LiveIndicator() {
  const { mode, transport } = useRealtime();
  const label = mode === "live" ? "Live" : mode === "connecting" ? "Connecting" : "Offline";
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted sm:inline-flex" title={`Realtime via ${transport === "pusher" ? "WebSockets (Pusher)" : "Server-Sent Events"}`}>
      <span className={cn("h-1.5 w-1.5 rounded-full", mode === "live" ? "bg-success animate-pulse" : mode === "connecting" ? "bg-warning" : "bg-danger")} />
      {label}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const { can } = useSession();
  useEffect(() => setDrawer(false), [pathname]);

  const bottom = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard, perm: "finance.read" as Permission },
    { href: "/expenses", label: "Expenses", icon: TrendingDown, perm: "expense.view" as Permission },
    { href: "/income", label: "Income", icon: TrendingUp, perm: "income.view" as Permission },
    { href: "/analytics", label: "Analytics", icon: Activity, perm: "reports.view" as Permission },
  ].filter((b) => can(b.perm));

  return (
    <AngelProvider>
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface/60 px-3 py-5 backdrop-blur lg:flex">
        <Logo />
        <div className="mt-6 flex-1 overflow-y-auto pr-1">
          <NavLinks />
        </div>
        <p className="px-3 pt-4 text-[11px] text-muted/60">© {new Date().getFullYear()} Budget Pro</p>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs animate-slide-in flex-col border-r border-border bg-surface px-3 py-5">
            <div className="flex items-center justify-between">
              <Logo />
              <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setDrawer(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-muted hover:bg-surface-2 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Link href="/dashboard" className="text-sm font-semibold">
              Budget Pro
            </Link>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <LiveIndicator />
            <ThemeMenu />
            <Bell_ />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:pb-12">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {bottom.map((b) => {
            const Icon = b.icon;
            const active = pathname === b.href;
            return (
              <Link key={b.href} href={b.href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[10px]", active ? "text-primary" : "text-muted")}>
                <Icon className="h-5 w-5" />
                {b.label}
              </Link>
            );
          })}
          <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-1 py-2.5 text-[10px] text-muted">
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>
    </div>
    </AngelProvider>
  );
}
