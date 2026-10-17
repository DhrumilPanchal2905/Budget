"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { emi, sipFutureValue } from "@/lib/finance-rules";
import { CURRENCIES, currencyLocale } from "@/lib/currencies";

const fmtFor = (cur: string) => (n: number) => {
  try {
    return new Intl.NumberFormat(currencyLocale(cur), { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(Math.round(n));
  } catch {
    return `${cur} ${Math.round(n)}`;
  }
};

function Num({ label, value, onChange, suffix, step = 1, min = 0, max }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-border bg-surface-2 px-3 focus-within:ring-2 focus-within:ring-primary/50">
        <input
          type="number"
          inputMode="decimal"
          className="h-10 w-full bg-transparent text-sm outline-none"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        />
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </div>
    </label>
  );
}

function CurrencyPick({ cur, setCur }: { cur: string; setCur: (c: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">Currency</span>
      <select value={cur} onChange={(e) => setCur(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm">
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Result({ items }: { items: [string, string, boolean?][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(([k, v, strong]) => (
        <div key={k} className={`rounded-xl border p-4 ${strong ? "border-primary/40 bg-primary/10" : "border-border bg-surface"}`}>
          <p className="text-xs text-muted">{k}</p>
          <p className="tabular mt-1 text-xl font-semibold">{v}</p>
        </div>
      ))}
    </div>
  );
}

const Cta = () => (
  <p className="mt-6 rounded-xl border border-border bg-surface p-4 text-sm text-muted">
    Want this tracked automatically every month — with reminders and an AI that explains it in Hindi or Gujarati?{" "}
    <Link href="/register" className="font-medium text-primary hover:underline">
      Create a free Budget Pro account →
    </Link>
  </p>
);

export function EmiCalculator() {
  const [cur, setCur] = useState("INR");
  const [p, setP] = useState(500000);
  const [r, setR] = useState(10);
  const [years, setYears] = useState(5);
  const f = fmtFor(cur);
  const n = Math.round(years * 12);
  const m = emi(p, r, n);
  const total = m * n;
  const schedule = useMemo(() => {
    const out: { year: number; principal: number; interest: number; balance: number }[] = [];
    let bal = p;
    const mr = r / 12 / 100;
    for (let y = 1; y <= Math.ceil(n / 12); y++) {
      let pi = 0;
      let ii = 0;
      for (let k = 0; k < 12 && bal > 0.5; k++) {
        const int = bal * mr;
        const prin = Math.min(bal, m - int);
        ii += int;
        pi += prin;
        bal -= prin;
      }
      out.push({ year: y, principal: pi, interest: ii, balance: Math.max(0, bal) });
    }
    return out;
  }, [p, r, n, m]);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Num label="Loan amount" value={p} onChange={setP} step={10000} />
        <Num label="Interest rate (yearly)" value={r} onChange={setR} suffix="%" step={0.1} max={60} />
        <Num label="Tenure" value={years} onChange={setYears} suffix="years" step={0.5} max={40} />
        <CurrencyPick cur={cur} setCur={setCur} />
      </div>
      <Result items={[["Monthly EMI", f(m), true], ["Total interest", f(total - p)], ["Total payment", f(total)]]} />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2">Year</th>
              <th className="px-4 py-2 text-right">Principal paid</th>
              <th className="px-4 py-2 text-right">Interest paid</th>
              <th className="px-4 py-2 text-right">Balance left</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {schedule.map((s) => (
              <tr key={s.year}>
                <td className="px-4 py-2">{s.year}</td>
                <td className="tabular px-4 py-2 text-right">{f(s.principal)}</td>
                <td className="tabular px-4 py-2 text-right">{f(s.interest)}</td>
                <td className="tabular px-4 py-2 text-right">{f(s.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Cta />
    </div>
  );
}

export function BudgetPlanner() {
  const [cur, setCur] = useState("INR");
  const [income, setIncome] = useState(60000);
  const [needsPct, setNeeds] = useState(50);
  const [wantsPct, setWants] = useState(30);
  const savePct = Math.max(0, 100 - needsPct - wantsPct);
  const f = fmtFor(cur);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Num label="Monthly take-home income" value={income} onChange={setIncome} step={1000} />
        <Num label="Needs" value={needsPct} onChange={(v) => setNeeds(Math.min(100, v))} suffix="%" max={100} />
        <Num label="Wants" value={wantsPct} onChange={(v) => setWants(Math.min(100 - needsPct, v))} suffix="%" max={100} />
        <CurrencyPick cur={cur} setCur={setCur} />
      </div>
      <Result items={[[`Needs (${needsPct}%)`, f((income * needsPct) / 100)], [`Wants (${wantsPct}%)`, f((income * wantsPct) / 100)], [`Savings (${savePct}%)`, f((income * savePct) / 100), true]]} />
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
        <div style={{ width: `${needsPct}%`, background: "var(--series-1)" }} />
        <div style={{ width: `${wantsPct}%`, background: "var(--series-2)" }} />
        <div style={{ width: `${savePct}%`, background: "var(--series-3)" }} />
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <p className="text-muted"><b className="text-fg">Needs:</b> rent, groceries, bills, EMIs, insurance, transport, school fees.</p>
        <p className="text-muted"><b className="text-fg">Wants:</b> eating out, shopping, entertainment, travel, subscriptions.</p>
        <p className="text-muted"><b className="text-fg">Savings:</b> emergency fund first, then SIPs, goals and loan prepayment.</p>
      </div>
      <Cta />
    </div>
  );
}

export function SavingsGoalCalculator() {
  const [cur, setCur] = useState("INR");
  const [target, setTarget] = useState(200000);
  const [saved, setSaved] = useState(20000);
  const [months, setMonths] = useState(18);
  const [rate, setRate] = useState(6);
  const f = fmtFor(cur);
  const r = rate / 12 / 100;
  const grownSaved = saved * Math.pow(1 + r, months);
  const remaining = Math.max(0, target - grownSaved);
  const monthly = remaining <= 0 ? 0 : r === 0 ? remaining / Math.max(1, months) : (remaining * r) / ((Math.pow(1 + r, months) - 1) * (1 + r));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-5">
        <Num label="Goal amount" value={target} onChange={setTarget} step={5000} />
        <Num label="Already saved" value={saved} onChange={setSaved} step={1000} />
        <Num label="Months to goal" value={months} onChange={(v) => setMonths(Math.max(1, Math.round(v)))} max={600} />
        <Num label="Expected return" value={rate} onChange={setRate} suffix="%/yr" step={0.5} max={30} />
        <CurrencyPick cur={cur} setCur={setCur} />
      </div>
      <Result items={[["Save every month", f(monthly), true], ["Your savings grow to", f(grownSaved)], ["Total you'll put in", f(saved + monthly * months)]]} />
      <Cta />
    </div>
  );
}

export function SipCalculator() {
  const [cur, setCur] = useState("INR");
  const [monthly, setMonthly] = useState(5000);
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(10);
  const f = fmtFor(cur);
  const fv = sipFutureValue(monthly, rate, years * 12);
  const invested = monthly * years * 12;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Num label="Monthly SIP" value={monthly} onChange={setMonthly} step={500} />
        <Num label="Expected return" value={rate} onChange={setRate} suffix="%/yr" step={0.5} max={30} />
        <Num label="Years" value={years} onChange={setYears} max={50} />
        <CurrencyPick cur={cur} setCur={setCur} />
      </div>
      <Result items={[["Estimated value", f(fv), true], ["You invest", f(invested)], ["Estimated gains", f(fv - invested)]]} />
      <p className="text-xs text-muted">Illustration only — market returns are not guaranteed. Not investment advice.</p>
      <Cta />
    </div>
  );
}
