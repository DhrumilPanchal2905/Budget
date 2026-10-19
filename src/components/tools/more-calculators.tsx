"use client";

// More free calculators (no sign-up). Everything runs in the browser except the currency converter, which reads
// live rates from our own /api/tools/fx endpoint.
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { CURRENCIES } from "@/lib/currencies";
import { incomeTax, type AgeGroup, type Regime } from "@/lib/tax-india";
import { emi } from "@/lib/finance-rules";
import { Cta, CurrencyPick, Num, Result, fmtFor } from "./calculators";

const fdMaturity = (p: number, rate: number, months: number, perYear = 4) => p * Math.pow(1 + rate / (100 * perYear), (perYear * months) / 12);

function Seg<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { v: T; l: string }[]; label: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1 flex h-10 rounded-lg border border-border bg-surface-2 p-1">
        {items.map((it) => (
          <button key={it.v} type="button" onClick={() => onChange(it.v)} className={`flex-1 rounded-md text-xs font-medium transition-colors ${value === it.v ? "bg-primary text-primary-fg" : "text-muted hover:text-fg"}`}>
            {it.l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- FD ----------------
export function FdCalculator() {
  const [cur, setCur] = useState("INR");
  const [p, setP] = useState(100000);
  const [rate, setRate] = useState(7);
  const [years, setYears] = useState(3);
  const [comp, setComp] = useState<"4" | "12" | "1">("4");
  const f = fmtFor(cur);
  const mat = fdMaturity(p, rate, years * 12, Number(comp));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-5">
        <Num label="Deposit amount" value={p} onChange={setP} step={10000} />
        <Num label="Interest rate" value={rate} onChange={setRate} suffix="%/yr" step={0.05} max={20} />
        <Num label="Tenure" value={years} onChange={setYears} suffix="years" step={0.25} max={20} />
        <Seg label="Compounding" value={comp} onChange={setComp} items={[{ v: "4", l: "Quarterly" }, { v: "12", l: "Monthly" }, { v: "1", l: "Yearly" }]} />
        <CurrencyPick cur={cur} setCur={setCur} />
      </div>
      <Result items={[["Maturity value", f(mat), true], ["Interest earned", f(mat - p)], ["Effective yearly yield", `${((Math.pow(mat / p, 1 / Math.max(0.01, years)) - 1) * 100).toFixed(2)}%`]]} />
      <p className="text-xs text-muted">Indian banks usually compound FDs quarterly. FD interest is added to your income and taxed at your slab; banks deduct TDS above the yearly limit (submit Form 15G/15H if eligible).</p>
      <Cta />
    </div>
  );
}

// ---------------- RD ----------------
export function RdCalculator() {
  const [cur, setCur] = useState("INR");
  const [m, setM] = useState(5000);
  const [rate, setRate] = useState(6.8);
  const [months, setMonths] = useState(24);
  const f = fmtFor(cur);
  const q = Math.pow(1 + rate / 400, 1 / 3);
  const mat = q === 1 ? m * months : (m * q * (Math.pow(q, months) - 1)) / (q - 1);
  const inv = m * months;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Num label="Monthly deposit" value={m} onChange={setM} step={500} />
        <Num label="Interest rate" value={rate} onChange={setRate} suffix="%/yr" step={0.05} max={20} />
        <Num label="Tenure" value={months} onChange={(v) => setMonths(Math.min(600, Math.max(1, Math.round(v))))} suffix="months" max={600} />
        <CurrencyPick cur={cur} setCur={setCur} />
      </div>
      <Result items={[["Maturity value", f(mat), true], ["You deposit", f(inv)], ["Interest earned", f(mat - inv)]]} />
      <p className="text-xs text-muted">Calculated the way Indian banks do: each instalment earns quarterly-compounded interest for the months it stays deposited.</p>
      <Cta />
    </div>
  );
}

// ---------------- PPF ----------------
export function PpfCalculator() {
  const [yearly, setYearly] = useState(150000);
  const [rate, setRate] = useState(7.1);
  const [years, setYears] = useState(15);
  const f = fmtFor("INR");
  const y = Math.min(60, Math.max(15, Math.round(years)));
  const amt = Math.min(150000, Math.max(500, yearly));
  let bal = 0;
  const rows: { year: number; balance: number; interest: number }[] = [];
  for (let i = 1; i <= y; i++) {
    const interest = (bal + amt) * (rate / 100); // deposit before 5 April → interest for the full year
    bal += amt + interest;
    rows.push({ year: i, balance: bal, interest });
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Num label="Yearly deposit (₹500 – ₹1.5 lakh)" value={yearly} onChange={setYearly} step={5000} max={150000} />
        <Num label="Interest rate (set by govt. every quarter)" value={rate} onChange={setRate} suffix="%/yr" step={0.05} max={15} />
        <Num label="Years (15, extend in blocks of 5)" value={years} onChange={setYears} min={15} max={50} step={5} />
      </div>
      <Result items={[["Maturity value (tax-free)", f(bal), true], ["Total deposited", f(amt * y)], ["Total interest", f(bal - amt * y)]]} />
      <details className="rounded-xl border border-border bg-surface p-3 text-sm">
        <summary className="cursor-pointer font-medium">Year-by-year balance</summary>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {rows.map((r) => (
            <span key={r.year} className="tabular flex justify-between text-muted">
              <span>Year {r.year}</span>
              <span className="text-fg">{f(r.balance)}</span>
            </span>
          ))}
        </div>
      </details>
      <p className="text-xs text-muted">PPF is EEE: deposits qualify for 80C (old regime), and interest and maturity are tax-free. Deposit before 5 April each year for interest on the full amount. Check the current rate on India Post / your bank.</p>
      <Cta />
    </div>
  );
}

// ---------------- Income tax ----------------
export function IncomeTaxCalculator() {
  const [salary, setSalary] = useState(1500000);
  const [other, setOther] = useState(0);
  const [ded, setDed] = useState(150000);
  const [age, setAge] = useState<AgeGroup>("below60");
  const f = fmtFor("INR");
  const nw = incomeTax({ regime: "new", salary, other, deductions: 0, age });
  const old = incomeTax({ regime: "old", salary, other, deductions: ded, age });
  const better: Regime = nw.total <= old.total ? "new" : "old";
  const Col = ({ r, title }: { r: typeof nw; title: string }) => (
    <div className={`rounded-xl border p-4 ${better === r.regime ? "border-primary/40 bg-primary/10" : "border-border bg-surface"}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        {better === r.regime && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-fg">Lower tax</span>}
      </div>
      <p className="tabular mt-2 text-2xl font-semibold">{f(r.total)}</p>
      <p className="text-xs text-muted">≈ {f(r.monthlyTds)}/month · effective {r.effectiveRate.toFixed(1)}%</p>
      <ul className="mt-3 space-y-1 text-xs">
        <li className="flex justify-between"><span className="text-muted">Gross income</span><span className="tabular">{f(r.gross)}</span></li>
        <li className="flex justify-between"><span className="text-muted">Standard deduction</span><span className="tabular">−{f(r.standardDeduction)}</span></li>
        {r.regime === "old" && <li className="flex justify-between"><span className="text-muted">Deductions (80C, 80D, HRA…)</span><span className="tabular">−{f(Math.max(0, ded))}</span></li>}
        <li className="flex justify-between font-medium"><span>Taxable income</span><span className="tabular">{f(r.taxable)}</span></li>
        <li className="flex justify-between"><span className="text-muted">Tax on slabs</span><span className="tabular">{f(r.slabTax)}</span></li>
        {r.rebate > 0 && <li className="flex justify-between text-success"><span>Rebate u/s 87A</span><span className="tabular">−{f(r.rebate)}</span></li>}
        {r.surcharge > 0 && <li className="flex justify-between"><span className="text-muted">Surcharge</span><span className="tabular">{f(r.surcharge)}</span></li>}
        <li className="flex justify-between"><span className="text-muted">Cess 4%</span><span className="tabular">{f(r.cess)}</span></li>
      </ul>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Num label="Annual salary / pension (gross)" value={salary} onChange={setSalary} step={50000} />
        <Num label="Other income (interest, rent, freelance)" value={other} onChange={setOther} step={10000} />
        <Num label="Old-regime deductions (80C, 80D, HRA, home loan)" value={ded} onChange={setDed} step={10000} />
        <label className="block">
          <span className="text-xs font-medium text-muted">Age</span>
          <select value={age} onChange={(e) => setAge(e.target.value as AgeGroup)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm">
            <option value="below60">Below 60</option>
            <option value="60to80">60 – 80</option>
            <option value="above80">Above 80</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Col r={nw} title="New regime (default)" />
        <Col r={old} title="Old regime" />
      </div>
      <p className="text-sm">
        {nw.total === old.total ? "Both regimes give the same tax." : <>You save <b>{f(Math.abs(nw.total - old.total))}</b> a year with the <b>{better} regime</b>.</>}
      </p>
      <p className="text-xs text-muted">FY 2026-27 (AY 2027-28) rates for resident individuals; Budget 2026 kept the slabs unchanged. Capital gains and other special-rate income are not included. For guidance only — not tax advice.</p>
      <Cta />
    </div>
  );
}

// ---------------- GST ----------------
export function GstCalculator() {
  const [amount, setAmount] = useState(10000);
  const [rate, setRate] = useState(18);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const f = (n: number) => fmtFor("INR")(n);
  const base = mode === "add" ? amount : (amount * 100) / (100 + rate);
  const tax = (base * rate) / 100;
  const total = base + tax;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Num label={mode === "add" ? "Price before GST" : "Price including GST"} value={amount} onChange={setAmount} step={100} />
        <label className="block">
          <span className="text-xs font-medium text-muted">GST rate</span>
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm">
            {[0, 0.25, 3, 5, 12, 18, 28, 40].map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </label>
        <Seg label="Mode" value={mode} onChange={setMode} items={[{ v: "add", l: "Add GST" }, { v: "remove", l: "Remove GST" }]} />
      </div>
      <Result items={[["Total price", f(total), true], ["Price before GST", f(base)], [`GST @ ${rate}%`, f(tax)]]} />
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <p className="rounded-xl border border-border bg-surface p-3 text-muted">Within your state: <b className="text-fg">CGST {f(tax / 2)}</b> + <b className="text-fg">SGST {f(tax / 2)}</b></p>
        <p className="rounded-xl border border-border bg-surface p-3 text-muted">To another state: <b className="text-fg">IGST {f(tax)}</b></p>
      </div>
      <p className="text-xs text-muted">Rates change with GST Council decisions — check the current rate for your item.</p>
      <Cta />
    </div>
  );
}

// ---------------- Inflation ----------------
export function InflationCalculator() {
  const [cur, setCur] = useState("INR");
  const [amount, setAmount] = useState(100000);
  const [rate, setRate] = useState(6);
  const [years, setYears] = useState(10);
  const f = fmtFor(cur);
  const future = amount * Math.pow(1 + rate / 100, years);
  const power = amount / Math.pow(1 + rate / 100, years);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Num label="Amount today" value={amount} onChange={setAmount} step={5000} />
        <Num label="Inflation" value={rate} onChange={setRate} suffix="%/yr" step={0.25} max={30} />
        <Num label="Years" value={years} onChange={setYears} max={60} />
        <CurrencyPick cur={cur} setCur={setCur} />
      </div>
      <Result items={[["Same things will cost", f(future), true], ["Today's money will be worth", f(power)], ["Value lost", `${(100 - (power / amount) * 100).toFixed(1)}%`]]} />
      <p className="text-xs text-muted">Money that earns less than inflation loses value. Keep long-term savings in options that beat inflation over time.</p>
      <Cta />
    </div>
  );
}

// ---------------- Loan prepayment ----------------
export function PrepaymentCalculator() {
  const [cur, setCur] = useState("INR");
  const [p, setP] = useState(3000000);
  const [rate, setRate] = useState(8.5);
  const [years, setYears] = useState(20);
  const [extra, setExtra] = useState(5000);
  const [lump, setLump] = useState(0);
  const f = fmtFor(cur);
  const res = useMemo(() => {
    const n = Math.round(years * 12);
    const m = emi(p, rate, n);
    const r = rate / 12 / 100;
    let bal = Math.max(0, p - lump);
    let months = 0;
    let interest = 0;
    while (bal > 0.5 && months < 1200 && m + extra > bal * r) {
      const int = bal * r;
      interest += int;
      bal = bal + int - (m + extra);
      months++;
    }
    const baseInterest = m * n - p;
    return { m, months, interest, baseInterest, n };
  }, [p, rate, years, extra, lump]);
  const saved = Math.max(0, res.baseInterest - res.interest);
  const cut = Math.max(0, res.n - res.months);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Num label="Loan outstanding" value={p} onChange={setP} step={50000} />
        <Num label="Interest rate" value={rate} onChange={setRate} suffix="%" step={0.05} max={30} />
        <Num label="Remaining tenure" value={years} onChange={setYears} suffix="yrs" step={0.5} max={40} />
        <Num label="Extra every month" value={extra} onChange={setExtra} step={1000} />
        <Num label="One-time prepayment now" value={lump} onChange={setLump} step={10000} />
        <CurrencyPick cur={cur} setCur={setCur} />
      </div>
      <Result items={[["Interest you save", f(saved), true], ["Loan ends earlier by", `${Math.floor(cut / 12)} yr ${cut % 12} mo`], ["Current EMI", f(res.m)]]} />
      <p className="text-xs text-muted">Banks can't charge prepayment penalties on floating-rate home loans for individuals in India. Early prepayments save the most interest.</p>
      <Cta />
    </div>
  );
}

// ---------------- Lump sum / compound interest ----------------
export function CompoundCalculator() {
  const [cur, setCur] = useState("INR");
  const [p, setP] = useState(100000);
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(10);
  const [freq, setFreq] = useState<"1" | "4" | "12">("1");
  const f = fmtFor(cur);
  const n = Number(freq);
  const fv = p * Math.pow(1 + rate / (100 * n), n * years);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-5">
        <Num label="Amount invested" value={p} onChange={setP} step={10000} />
        <Num label="Return / interest" value={rate} onChange={setRate} suffix="%/yr" step={0.25} max={50} />
        <Num label="Years" value={years} onChange={setYears} max={60} />
        <Seg label="Compounding" value={freq} onChange={setFreq} items={[{ v: "1", l: "Yearly" }, { v: "4", l: "Quarterly" }, { v: "12", l: "Monthly" }]} />
        <CurrencyPick cur={cur} setCur={setCur} />
      </div>
      <Result items={[["Future value", f(fv), true], ["Invested", f(p)], ["Growth", `${f(fv - p)} (${(fv / p).toFixed(2)}×)`]]} />
      <p className="text-xs text-muted">Rule of 72: money doubles in about {rate > 0 ? (72 / rate).toFixed(1) : "∞"} years at {rate}% a year.</p>
      <Cta />
    </div>
  );
}

// ---------------- Retirement ----------------
export function RetirementCalculator() {
  const [age, setAge] = useState(30);
  const [retire, setRetire] = useState(60);
  const [life, setLife] = useState(85);
  const [expense, setExpense] = useState(40000);
  const [infl, setInfl] = useState(6);
  const [pre, setPre] = useState(11);
  const [post, setPost] = useState(7);
  const [saved, setSaved] = useState(200000);
  const f = fmtFor("INR");
  const yrs = Math.max(0, retire - age);
  const retYears = Math.max(1, life - retire);
  const monthlyAtRetire = expense * Math.pow(1 + infl / 100, yrs);
  // corpus = present value of an inflation-growing pension over retirement years
  const real = (1 + post / 100) / (1 + infl / 100) - 1;
  const yearly = monthlyAtRetire * 12;
  const corpus = Math.abs(real) < 1e-9 ? yearly * retYears : yearly * ((1 - Math.pow(1 + real, -retYears)) / real) * (1 + real);
  const fvSaved = saved * Math.pow(1 + pre / 100, yrs);
  const gap = Math.max(0, corpus - fvSaved);
  const i = pre / 12 / 100;
  const n = yrs * 12;
  const sip = n === 0 ? gap : i === 0 ? gap / n : gap / (((Math.pow(1 + i, n) - 1) / i) * (1 + i));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Num label="Your age" value={age} onChange={setAge} max={80} />
        <Num label="Retire at" value={retire} onChange={setRetire} max={80} />
        <Num label="Plan till age" value={life} onChange={setLife} max={110} />
        <Num label="Monthly expenses today" value={expense} onChange={setExpense} step={1000} />
        <Num label="Inflation" value={infl} onChange={setInfl} suffix="%" step={0.5} max={20} />
        <Num label="Return before retiring" value={pre} onChange={setPre} suffix="%" step={0.5} max={25} />
        <Num label="Return after retiring" value={post} onChange={setPost} suffix="%" step={0.5} max={20} />
        <Num label="Already saved for retirement" value={saved} onChange={setSaved} step={10000} />
      </div>
      <Result items={[["Corpus needed at retirement", f(corpus), true], ["Monthly SIP needed now", f(sip)], ["Monthly expenses at retirement", f(monthlyAtRetire)]]} />
      <p className="text-xs text-muted">Assumes expenses keep rising with inflation after retirement. Illustration only — not investment advice.</p>
      <Cta />
    </div>
  );
}

// ---------------- Emergency fund ----------------
export function EmergencyFundCalculator() {
  const [cur, setCur] = useState("INR");
  const [expense, setExpense] = useState(35000);
  const [emis, setEmis] = useState(10000);
  const [months, setMonths] = useState(6);
  const [saved, setSaved] = useState(50000);
  const [perMonth, setPerMonth] = useState(10000);
  const f = fmtFor(cur);
  const target = (expense + emis) * months;
  const gap = Math.max(0, target - saved);
  const eta = perMonth > 0 ? Math.ceil(gap / perMonth) : Infinity;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Num label="Monthly essential expenses" value={expense} onChange={setExpense} step={1000} />
        <Num label="Monthly EMIs" value={emis} onChange={setEmis} step={1000} />
        <Num label="Months of cover" value={months} onChange={(v) => setMonths(Math.min(24, Math.max(1, Math.round(v))))} max={24} />
        <Num label="Already saved" value={saved} onChange={setSaved} step={5000} />
        <Num label="Can save per month" value={perMonth} onChange={setPerMonth} step={1000} />
        <CurrencyPick cur={cur} setCur={setCur} />
      </div>
      <Result items={[["Emergency fund target", f(target), true], ["Still needed", f(gap)], ["Ready in", gap === 0 ? "Done ✓" : Number.isFinite(eta) ? `${eta} months` : "—"]]} />
      <p className="text-xs text-muted">6 months is a good default; choose 9–12 if your income is irregular or you are the only earner. Keep it in a savings account, sweep-in FD or liquid fund.</p>
      <Cta />
    </div>
  );
}

// ---------------- Net worth ----------------
export function NetWorthCalculator() {
  const [cur, setCur] = useState("INR");
  const [a, setA] = useState({ cash: 50000, investments: 300000, retirement: 200000, property: 0, gold: 50000, other: 0 });
  const [l, setL] = useState({ home: 0, vehicle: 0, personal: 0, cards: 0, other: 0 });
  const f = fmtFor(cur);
  const assets = (Object.values(a) as number[]).reduce((x, y) => x + y, 0);
  const liab = (Object.values(l) as number[]).reduce((x, y) => x + y, 0);
  const nw = assets - liab;
  const A: [keyof typeof a, string][] = [["cash", "Bank & cash"], ["investments", "Stocks / mutual funds / FDs"], ["retirement", "PF / PPF / NPS"], ["property", "Property"], ["gold", "Gold"], ["other", "Other assets"]];
  const Lb: [keyof typeof l, string][] = [["home", "Home loan"], ["vehicle", "Vehicle loan"], ["personal", "Personal / education loan"], ["cards", "Credit card dues"], ["other", "Other debts"]];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold">What you own</p>
          {A.map(([k, label]) => (
            <Num key={k} label={label} value={a[k]} onChange={(v) => setA({ ...a, [k]: v })} step={10000} />
          ))}
        </div>
        <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold">What you owe</p>
          {Lb.map(([k, label]) => (
            <Num key={k} label={label} value={l[k]} onChange={(v) => setL({ ...l, [k]: v })} step={10000} />
          ))}
          <CurrencyPick cur={cur} setCur={setCur} />
        </div>
      </div>
      <Result items={[["Net worth", f(nw), true], ["Total assets", f(assets)], ["Total liabilities", f(liab)]]} />
      <p className="text-xs text-muted">{liab > 0 && assets > 0 ? `Debt-to-asset ratio: ${((liab / assets) * 100).toFixed(0)}% — under 50% is healthy.` : "Track it every few months — a rising net worth is the clearest sign of progress."}</p>
      <Cta />
    </div>
  );
}

// ---------------- Currency converter ----------------
export function CurrencyConverter() {
  const [amount, setAmount] = useState(100);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("INR");
  const [rates, setRates] = useState<{ base: string; rates: Record<string, number>; updated: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setErr(null);
    api<{ base: string; rates: Record<string, number>; updated: string }>(`/api/tools/fx?base=${from}`)
      .then((r) => alive && setRates(r.data))
      .catch((e) => alive && setErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, [from]);
  const rate = rates?.base === from ? rates.rates[to] : undefined;
  const out = rate ? amount * rate : null;
  const fmt = (n: number, c: string) => {
    try {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: c, maximumFractionDigits: n < 10 ? 4 : 2 }).format(n);
    } catch {
      return `${n.toFixed(2)} ${c}`;
    }
  };
  const pick = (v: string, set: (c: string) => void, label: string) => (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <select value={v} onChange={(e) => set(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm">
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_1fr] sm:items-end">
        <Num label="Amount" value={amount} onChange={setAmount} step={1} />
        {pick(from, setFrom, "From")}
        <button type="button" onClick={() => { setFrom(to); setTo(from); }} className="h-10 rounded-lg border border-border px-3 text-sm hover:bg-surface-2" aria-label="Swap currencies">
          ⇄
        </button>
        {pick(to, setTo, "To")}
      </div>
      {err ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">{err}</p>
      ) : (
        <Result items={[[`${fmt(amount, from)} =`, out === null ? "…" : fmt(out, to), true], [`1 ${from}`, rate ? fmt(rate, to) : "…"], [`1 ${to}`, rate ? fmt(1 / rate, from) : "…"]]} />
      )}
      <p className="text-xs text-muted">Live mid-market rates{rates?.updated ? ` (updated ${new Date(rates.updated).toLocaleString("en-IN")})` : ""} by ExchangeRate-API. Banks and cards usually add a 1–3% markup.</p>
      <Cta />
    </div>
  );
}
