import { Budget, Debt, Expense, Goal, Income, oid } from "./models";
import { formatMoney, fromMinor, pct } from "./money";
import { currentMonthKey, lastMonths, monthLabel, monthRange, shiftMonth, todayUTC } from "./analytics";
import { goalInsight } from "./goals";
import { needsWantsOf } from "./finance-rules";
import type { Lang } from "./angel/parse";

// Angel AI suggestions — computed in TypeScript from the user's REAL data (no third-party AI) and written in
// the user's language (English, हिंदी, ગુજરાતી or Hinglish). Shown on the Insights page and the dashboard,
// and spoken by Angel when you ask "suggestions do".

export type Severity = "positive" | "info" | "warning" | "critical";

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  advanced: boolean;
  metric?: string;
  /** a follow-up question the user can ask Angel about this insight */
  ask?: string;
  /** where to act on it in the app */
  href?: string;
}

interface MonthAgg {
  income: number;
  expense: number;
  cats: Map<string, number>;
}

type T4 = Record<Lang, string>;
const t = (en: string, hi: string, gu: string, hn: string): T4 => ({ en, hi, gu, hn });

export async function generateInsights(ownerId: string, opts: { advanced: boolean; currency: string; lang?: Lang }) {
  const lang: Lang = opts.lang ?? "en";
  const L = (x: T4) => x[lang] ?? x.en;
  const userId = oid(ownerId);
  const cur = currentMonthKey();
  const keys = lastMonths(cur, 4); // [m-3, m-2, m-1, current]
  const from = monthRange(keys[0]).start;
  const to = monthRange(cur).end;
  const fmt = (minor: number) => formatMoney(fromMinor(minor), opts.currency);
  const today = todayUTC();
  const dim = new Date(to.getTime() - 86400000).getUTCDate();
  const dayOfMonth = Math.min(dim, today.getUTCDate());

  const [incRows, expRows, debts, goals, largest, budgets, lifeInc, lifeExp, recurringExp] = await Promise.all([
    Income.aggregate([
      { $match: { userId, date: { $gte: from, $lt: to } } },
      { $group: { _id: { y: { $year: "$date" }, m: { $month: "$date" } }, total: { $sum: "$amount" } } },
    ]),
    Expense.aggregate([
      { $match: { userId, date: { $gte: from, $lt: to } } },
      { $group: { _id: { y: { $year: "$date" }, m: { $month: "$date" }, c: "$category" }, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Debt.find({ userId, status: "active" }).lean(),
    Goal.find({ userId, status: "active" }).lean(),
    Expense.find({ userId, date: { $gte: monthRange(cur).start, $lt: to } }).sort({ amount: -1 }).limit(1).lean(),
    Budget.find({ userId }).lean(),
    Income.aggregate([{ $match: { userId } }, { $group: { _id: null, t: { $sum: "$amount" } } }]),
    Expense.aggregate([{ $match: { userId } }, { $group: { _id: null, t: { $sum: "$amount" } } }]),
    Expense.aggregate([
      { $match: { userId, date: { $gte: monthRange(shiftMonth(cur, -2)).start, $lt: to }, $or: [{ recurring: { $in: ["monthly", "weekly", "yearly"] } }, { category: "Subscriptions" }] } },
      { $sort: { date: 1 } },
      { $group: { _id: { t: { $toLower: "$title" } }, amount: { $last: "$amount" }, recurring: { $last: "$recurring" }, n: { $sum: 1 } } },
    ]),
  ]);

  const months = new Map<string, MonthAgg>(keys.map((k) => [k, { income: 0, expense: 0, cats: new Map() }]));
  const k = (id: { y: number; m: number }) => `${id.y}-${String(id.m).padStart(2, "0")}`;
  for (const r of incRows as { _id: { y: number; m: number }; total: number }[]) {
    const m = months.get(k(r._id));
    if (m) m.income += r.total;
  }
  let curExpenseCount = 0;
  for (const r of expRows as { _id: { y: number; m: number; c: string }; total: number; count: number }[]) {
    const key = k(r._id);
    const m = months.get(key);
    if (!m) continue;
    m.expense += r.total;
    m.cats.set(r._id.c, (m.cats.get(r._id.c) ?? 0) + r.total);
    if (key === cur) curExpenseCount += r.count;
  }

  const now = months.get(cur)!;
  const prev = months.get(shiftMonth(cur, -1))!;
  const history = keys.slice(0, 3).map((x) => months.get(x)!);
  const histWithData = history.filter((m) => m.income || m.expense);
  const avgExpense = histWithData.length ? Math.round(histWithData.reduce((s, m) => s + m.expense, 0) / histWithData.length) : now.expense;
  const avgIncomeHist = histWithData.length ? Math.round(histWithData.reduce((s, m) => s + m.income, 0) / histWithData.length) : 0;
  const balance = (lifeInc[0]?.t ?? 0) - (lifeExp[0]?.t ?? 0);
  const insights: Insight[] = [];
  const hasAnyData = [...months.values()].some((m) => m.income || m.expense) || debts.length || goals.length;
  const mLabel = monthLabel(cur);

  if (!hasAnyData) {
    return {
      insights: [
        {
          id: "getting-started",
          severity: "info" as Severity,
          title: L(t("Add your first transactions", "पहली एंट्री जोड़िए", "પહેલી એન્ટ્રી ઉમેરો", "Pehli entries add kijiye")),
          message: L(
            t(
              "Record your salary, a few expenses and any EMIs. Angel's suggestions appear automatically once there is data to analyse — or just tell Angel “salary 50000 received”.",
              "अपनी सैलरी, कुछ खर्च और EMI दर्ज कीजिए। डेटा आते ही Angel के सुझाव अपने-आप दिखेंगे — या Angel को बोलिए “50000 सैलरी आई”।",
              "તમારો પગાર, થોડા ખર્ચ અને EMI નોંધો. ડેટા આવતાં જ Angel નાં સૂચનો આપમેળે દેખાશે — અથવા Angel ને કહો “પગાર 50000 આવ્યો”.",
              "Apni salary, kuch kharche aur EMI record kijiye. Data aate hi Angel ke suggestions apne-aap dikhenge — ya Angel ko boliye “50000 salary aayi”.",
            ),
          ),
          advanced: false,
          href: "/income",
        },
      ],
      lockedCount: 0,
      generatedAt: new Date().toISOString(),
      lang,
    };
  }

  // ======================= BASIC (all plans) =======================
  if (now.income > 0) {
    const rate = pct(now.income - now.expense, now.income);
    if (rate < 0) {
      insights.push({ id: "overspending", severity: "critical", advanced: false, metric: `${rate}%`, href: "/expenses", ask: L(t("Where can I cut spending?", "खर्च कहां कम करूं?", "ખર્ચ ક્યાં ઓછો કરું?", "Kharcha kahan kam karun?")),
        title: L(t("Spending exceeds income this month", "इस महीने खर्च आमदनी से ज़्यादा है", "આ મહિને ખર્ચ આવક કરતાં વધારે છે", "Is mahine kharcha income se zyada hai")),
        message: L(t(`You have spent ${fmt(now.expense - now.income)} more than you earned in ${mLabel}. Pause non-essential spending (eating out, shopping) for the rest of the month.`, `${mLabel} में आपने कमाई से ${fmt(now.expense - now.income)} ज़्यादा खर्च किया है। बाकी महीने गैर-ज़रूरी खर्च (बाहर खाना, शॉपिंग) रोक दीजिए।`, `${mLabel} માં તમે કમાણી કરતાં ${fmt(now.expense - now.income)} વધુ ખર્ચ્યા છે. બાકીના મહિને બિનજરૂરી ખર્ચ (બહાર જમવું, શોપિંગ) રોકી દો.`, `${mLabel} mein aapne kamai se ${fmt(now.expense - now.income)} zyada kharch kiya hai. Baaki mahine gair-zaroori kharcha (bahar khana, shopping) rok dijiye.`)) });
    } else if (rate >= 30) {
      insights.push({ id: "great-savings", severity: "positive", advanced: false, metric: `${rate}%`, href: "/goals",
        title: L(t("Excellent savings rate", "बहुत बढ़िया बचत दर", "ઉત્તમ બચત દર", "Bahut badhiya savings rate")),
        message: L(t(`You are saving ${rate}% of your income this month (${fmt(now.income - now.expense)}). Move the surplus into a goal or investment before it gets spent.`, `इस महीने आप आमदनी का ${rate}% बचा रहे हैं (${fmt(now.income - now.expense)})। खर्च होने से पहले ये रकम किसी गोल या निवेश में डाल दीजिए।`, `આ મહિને તમે આવકના ${rate}% બચાવો છો (${fmt(now.income - now.expense)}). ખર્ચાઈ જાય તે પહેલાં આ રકમ ગોલ કે રોકાણમાં મૂકી દો.`, `Is mahine aap income ka ${rate}% bacha rahe hain (${fmt(now.income - now.expense)}). Kharch hone se pehle ye amount kisi goal ya investment mein daal dijiye.`)) });
    } else if (rate < 10) {
      insights.push({ id: "low-savings", severity: "warning", advanced: false, metric: `${rate}%`, ask: L(t("How can I save more?", "ज़्यादा बचत कैसे करूं?", "વધુ બચત કેવી રીતે કરું?", "Zyada bachat kaise karun?")),
        title: L(t("Low savings rate", "बचत दर कम है", "બચત દર ઓછો છે", "Savings rate kam hai")),
        message: L(t(`Only ${rate}% of this month's income is left after expenses. Aim for 20% — set category budgets so you know your limits.`, `खर्च के बाद इस महीने की आमदनी का सिर्फ़ ${rate}% बचा है। 20% का लक्ष्य रखिए — कैटेगरी बजट बनाइए ताकि लिमिट पता रहे।`, `ખર્ચ પછી આ મહિનાની આવકના માત્ર ${rate}% બચ્યા છે. 20% નું લક્ષ્ય રાખો — કેટેગરી બજેટ બનાવો જેથી લિમિટ ખબર રહે.`, `Kharche ke baad is mahine ki income ka sirf ${rate}% bacha hai. 20% ka target rakhiye — category budgets banaiye taaki limit pata rahe.`)), href: "/budgets" });
    } else {
      insights.push({ id: "savings-rate", severity: "info", advanced: false, metric: `${rate}%`,
        title: L(t("Savings on track", "बचत सही चल रही है", "બચત બરાબર ચાલે છે", "Bachat sahi chal rahi hai")),
        message: L(t(`You are saving ${rate}% of your income this month. Pushing it to 20% would add ${fmt(Math.max(0, Math.round(now.income * 0.2) - (now.income - now.expense)))} a month.`, `इस महीने आप आमदनी का ${rate}% बचा रहे हैं। इसे 20% करने से हर महीने ${fmt(Math.max(0, Math.round(now.income * 0.2) - (now.income - now.expense)))} और जुड़ेंगे।`, `આ મહિને તમે આવકના ${rate}% બચાવો છો. તેને 20% કરવાથી દર મહિને ${fmt(Math.max(0, Math.round(now.income * 0.2) - (now.income - now.expense)))} વધુ ઉમેરાશે.`, `Is mahine aap income ka ${rate}% bacha rahe hain. Ise 20% karne se har mahine ${fmt(Math.max(0, Math.round(now.income * 0.2) - (now.income - now.expense)))} aur judenge.`)) });
    }
  } else if (now.expense > 0) {
    insights.push({ id: "no-income", severity: "warning", advanced: false, href: "/income",
      title: L(t("No income recorded this month", "इस महीने कोई आमदनी दर्ज नहीं", "આ મહિને કોઈ આવક નોંધાઈ નથી", "Is mahine koi income record nahi")),
      message: L(t(`You have ${fmt(now.expense)} of expenses in ${mLabel} but no income entries yet. Add your salary so your numbers are accurate (tick “Auto-repeat” so it adds itself every month).`, `${mLabel} में ${fmt(now.expense)} का खर्च है पर कोई आमदनी नहीं। सही हिसाब के लिए सैलरी जोड़िए (“Auto-repeat” चुनें ताकि हर महीने अपने-आप जुड़े)।`, `${mLabel} માં ${fmt(now.expense)} નો ખર્ચ છે પણ કોઈ આવક નથી. સાચા હિસાબ માટે પગાર ઉમેરો (“Auto-repeat” પસંદ કરો જેથી દર મહિને આપમેળે ઉમેરાય).`, `${mLabel} mein ${fmt(now.expense)} ka kharcha hai par koi income nahi. Sahi hisaab ke liye salary add kijiye (“Auto-repeat” chuniye taaki har mahine apne-aap jude).`)) });
  }

  // Pace this month vs usual (only meaningful after the first few days)
  if (avgExpense > 0 && now.expense > 0 && dayOfMonth >= 5 && dayOfMonth < dim) {
    const projected = Math.round((now.expense / dayOfMonth) * dim);
    const change = pct(projected - avgExpense, avgExpense);
    if (change >= 15) {
      insights.push({ id: "pace-high", severity: "warning", advanced: false, metric: `+${change}%`, ask: L(t("Why did my spending go up?", "खर्च क्यों बढ़ा?", "ખર્ચ કેમ વધ્યો?", "Kharcha kyu badha?")),
        title: L(t("On course to overspend", "इस रफ़्तार से खर्च ज़्यादा होगा", "આ ઝડપે ખર્ચ વધી જશે", "Is raftaar se kharcha zyada hoga")),
        message: L(t(`At this pace you'll spend about ${fmt(projected)} this month — ${change}% above your usual ${fmt(avgExpense)}. Keeping daily spending under ${fmt(Math.max(0, Math.round((avgExpense - now.expense) / Math.max(1, dim - dayOfMonth))))} brings it back to normal.`, `इसी रफ़्तार से इस महीने लगभग ${fmt(projected)} खर्च होगा — आपके सामान्य ${fmt(avgExpense)} से ${change}% ज़्यादा। रोज़ का खर्च ${fmt(Math.max(0, Math.round((avgExpense - now.expense) / Math.max(1, dim - dayOfMonth))))} से कम रखें तो सामान्य हो जाएगा।`, `આ ઝડપે આ મહિને આશરે ${fmt(projected)} ખર્ચ થશે — તમારા સામાન્ય ${fmt(avgExpense)} કરતાં ${change}% વધુ. રોજનો ખર્ચ ${fmt(Math.max(0, Math.round((avgExpense - now.expense) / Math.max(1, dim - dayOfMonth))))} થી ઓછો રાખો તો સામાન્ય થઈ જશે.`, `Isi raftaar se is mahine lagbhag ${fmt(projected)} kharcha hoga — aapke normal ${fmt(avgExpense)} se ${change}% zyada. Roz ka kharcha ${fmt(Math.max(0, Math.round((avgExpense - now.expense) / Math.max(1, dim - dayOfMonth))))} se kam rakhiye to normal ho jayega.`)) });
    } else if (change <= -15) {
      insights.push({ id: "pace-low", severity: "positive", advanced: false, metric: `${change}%`,
        title: L(t("Spending less than usual", "सामान्य से कम खर्च", "સામાન્ય કરતાં ઓછો ખર્ચ", "Normal se kam kharcha")),
        message: L(t(`You're on course to spend ${fmt(projected)}, ${Math.abs(change)}% below your usual. Nice discipline — consider moving the difference to a goal.`, `आप लगभग ${fmt(projected)} खर्च करने की राह पर हैं, सामान्य से ${Math.abs(change)}% कम। बढ़िया — बचा फर्क किसी गोल में डाल दीजिए।`, `તમે આશરે ${fmt(projected)} ખર્ચ કરવાના માર્ગ પર છો, સામાન્ય કરતાં ${Math.abs(change)}% ઓછો. સરસ — બચેલો ફરક કોઈ ગોલમાં મૂકી દો.`, `Aap lagbhag ${fmt(projected)} kharch karne ki raah par hain, normal se ${Math.abs(change)}% kam. Badhiya — bacha farak kisi goal mein daal dijiye.`)) });
    }
  } else if (prev.expense > 0 && now.expense > 0) {
    const change = pct(now.expense - prev.expense, prev.expense);
    if (change >= 15) {
      insights.push({ id: "spend-up", severity: "warning", advanced: false, metric: `+${change}%`,
        title: L(t("Spending increased vs last month", "पिछले महीने से खर्च बढ़ा", "ગયા મહિના કરતાં ખર્ચ વધ્યો", "Pichle mahine se kharcha badha")),
        message: L(t(`Expenses so far are ${change}% higher than all of ${monthLabel(shiftMonth(cur, -1))} (${fmt(now.expense)} vs ${fmt(prev.expense)}).`, `अब तक का खर्च पूरे ${monthLabel(shiftMonth(cur, -1))} से ${change}% ज़्यादा है (${fmt(now.expense)} बनाम ${fmt(prev.expense)})।`, `અત્યાર સુધીનો ખર્ચ આખા ${monthLabel(shiftMonth(cur, -1))} કરતાં ${change}% વધુ છે (${fmt(now.expense)} સામે ${fmt(prev.expense)}).`, `Ab tak ka kharcha poore ${monthLabel(shiftMonth(cur, -1))} se ${change}% zyada hai (${fmt(now.expense)} vs ${fmt(prev.expense)}).`)) });
    }
  }

  // Budgets
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const budgetRows = (budgets as any[]).map((b) => {
    const spent = b.category === "__total__" ? now.expense : now.cats.get(b.category) ?? 0;
    return { cat: b.category === "__total__" ? L(t("Monthly total", "महीने का कुल", "મહિનાનું કુલ", "Monthly total")) : b.category, spent, limit: b.amount, p: pct(spent, b.amount) };
  });
  const over = budgetRows.filter((b) => b.p >= 100).sort((a, b) => b.p - a.p);
  const near = budgetRows.filter((b) => b.p >= 80 && b.p < 100);
  if (over.length) {
    const b = over[0];
    insights.push({ id: "budget-over", severity: "critical", advanced: false, metric: `${Math.round(b.p)}%`, href: "/budgets",
      title: L(t(`${b.cat} budget exceeded`, `${b.cat} का बजट पार`, `${b.cat} નું બજેટ પાર`, `${b.cat} ka budget cross`)),
      message: L(t(`${fmt(b.spent)} spent against a ${fmt(b.limit)} limit (${fmt(b.spent - b.limit)} over)${over.length > 1 ? ` — and ${over.length - 1} more budget(s) are over too` : ""}.`, `${fmt(b.limit)} की लिमिट पर ${fmt(b.spent)} खर्च (${fmt(b.spent - b.limit)} ज़्यादा)${over.length > 1 ? ` — और ${over.length - 1} बजट भी पार हैं` : ""}।`, `${fmt(b.limit)} ની લિમિટ સામે ${fmt(b.spent)} ખર્ચ (${fmt(b.spent - b.limit)} વધુ)${over.length > 1 ? ` — અને ${over.length - 1} બજેટ પણ પાર છે` : ""}.`, `${fmt(b.limit)} ki limit pe ${fmt(b.spent)} kharcha (${fmt(b.spent - b.limit)} zyada)${over.length > 1 ? ` — aur ${over.length - 1} budget bhi cross hain` : ""}.`)) });
  } else if (near.length) {
    const b = near[0];
    insights.push({ id: "budget-near", severity: "warning", advanced: false, metric: `${Math.round(b.p)}%`, href: "/budgets",
      title: L(t(`${b.cat} budget almost used`, `${b.cat} का बजट लगभग खत्म`, `${b.cat} નું બજેટ લગભગ પૂરું`, `${b.cat} ka budget lagbhag khatam`)),
      message: L(t(`${fmt(b.limit - b.spent)} left of ${fmt(b.limit)} with ${dim - dayOfMonth + 1} days to go — about ${fmt(Math.round((b.limit - b.spent) / Math.max(1, dim - dayOfMonth + 1)))} a day.`, `${fmt(b.limit)} में से ${fmt(b.limit - b.spent)} बचे और ${dim - dayOfMonth + 1} दिन बाकी — यानी लगभग ${fmt(Math.round((b.limit - b.spent) / Math.max(1, dim - dayOfMonth + 1)))} रोज़।`, `${fmt(b.limit)} માંથી ${fmt(b.limit - b.spent)} બાકી અને ${dim - dayOfMonth + 1} દિવસ બાકી — એટલે આશરે ${fmt(Math.round((b.limit - b.spent) / Math.max(1, dim - dayOfMonth + 1)))} રોજ.`, `${fmt(b.limit)} mein se ${fmt(b.limit - b.spent)} bache aur ${dim - dayOfMonth + 1} din baaki — yaani lagbhag ${fmt(Math.round((b.limit - b.spent) / Math.max(1, dim - dayOfMonth + 1)))} roz.`)) });
  } else if (!budgets.length && avgExpense > 0) {
    insights.push({ id: "budget-none", severity: "info", advanced: false, href: "/budgets",
      title: L(t("Set your first budget", "पहला बजट बनाइए", "પહેલું બજેટ બનાવો", "Pehla budget banaiye")),
      message: L(t("People who set category limits save noticeably more. Open Budgets — Angel suggests limits from your last 3 months — or say “food budget 5000”.", "जो लोग कैटेगरी लिमिट रखते हैं वो काफ़ी ज़्यादा बचाते हैं। Budgets खोलिए — Angel पिछले 3 महीनों से लिमिट सुझाती है — या बोलिए “खाने का बजट 5000”।", "જે લોકો કેટેગરી લિમિટ રાખે છે તે ઘણું વધુ બચાવે છે. Budgets ખોલો — Angel છેલ્લા 3 મહિનાથી લિમિટ સૂચવે છે — અથવા કહો “ખાવાનું બજેટ 5000”.", "Jo log category limit rakhte hain wo kaafi zyada bachate hain. Budgets kholiye — Angel pichle 3 mahine se limit suggest karti hai — ya boliye “food budget 5000”.")) });
  }

  // EMI burden
  const emiTotal = debts.reduce((s, d) => s + (d.emiAmount || 0), 0);
  const avgIncome = Math.max(now.income, avgIncomeHist);
  if (emiTotal > 0 && avgIncome > 0) {
    const ratio = pct(emiTotal, avgIncome);
    if (ratio > 50) insights.push({ id: "emi-critical", severity: "critical", advanced: false, metric: `${ratio}%`, href: "/debts", ask: L(t("Which loan should I repay first?", "पहले कौन सा लोन चुकाऊं?", "કઈ લોન પહેલાં ચૂકવું?", "Pehle kaunsa loan chukaun?")),
      title: L(t("EMI burden is very high", "EMI का बोझ बहुत ज़्यादा है", "EMI નો બોજ ઘણો વધારે છે", "EMI ka bojh bahut zyada hai")),
      message: L(t(`EMIs take ${ratio}% of your monthly income (${fmt(emiTotal)}). Above 40–50% leaves little room for emergencies — prepay the highest-interest loan first and avoid new loans.`, `EMI आपकी महीने की आमदनी का ${ratio}% ले रही है (${fmt(emiTotal)})। 40–50% से ऊपर इमरजेंसी के लिए जगह नहीं बचती — सबसे महंगा लोन पहले चुकाइए और नया लोन मत लीजिए।`, `EMI તમારી મહિનાની આવકના ${ratio}% લે છે (${fmt(emiTotal)}). 40–50% થી ઉપર ઇમરજન્સી માટે જગ્યા રહેતી નથી — સૌથી મોંઘી લોન પહેલાં ચૂકવો અને નવી લોન ન લો.`, `EMI aapki monthly income ka ${ratio}% le rahi hai (${fmt(emiTotal)}). 40–50% se upar emergency ke liye jagah nahi bachti — sabse mehenga loan pehle chukaiye aur naya loan mat lijiye.`)) });
    else if (ratio > 35) insights.push({ id: "emi-high", severity: "warning", advanced: false, metric: `${ratio}%`, href: "/debts",
      title: L(t("EMI burden is high", "EMI का बोझ ज़्यादा है", "EMI નો બોજ વધારે છે", "EMI ka bojh zyada hai")),
      message: L(t(`EMIs take ${ratio}% of your monthly income. Keep it under 35% before taking any new loan.`, `EMI आमदनी का ${ratio}% है। नया लोन लेने से पहले इसे 35% से नीचे लाइए।`, `EMI આવકના ${ratio}% છે. નવી લોન લેતાં પહેલાં તેને 35% થી નીચે લાવો.`, `EMI income ka ${ratio}% hai. Naya loan lene se pehle ise 35% se neeche laiye.`)) });
    else insights.push({ id: "emi-ok", severity: "positive", advanced: false, metric: `${ratio}%`,
      title: L(t("EMI burden is manageable", "EMI का बोझ ठीक है", "EMI નો બોજ સંભાળી શકાય એવો છે", "EMI ka bojh theek hai")),
      message: L(t(`EMIs are ${ratio}% of your monthly income — within a healthy range.`, `EMI आमदनी का ${ratio}% है — सही दायरे में।`, `EMI આવકના ${ratio}% છે — યોગ્ય મર્યાદામાં.`, `EMI income ka ${ratio}% hai — sahi range mein.`)) });
  }

  // Emergency fund
  if (avgExpense > 0) {
    const monthsCovered = Math.max(0, balance) / avgExpense;
    if (monthsCovered < 3) {
      insights.push({ id: "emergency", severity: monthsCovered < 1 ? "warning" : "info", advanced: false, metric: `${Math.round(monthsCovered * 10) / 10} mo`, ask: L(t("How much emergency fund do I need?", "मुझे कितना इमरजेंसी फंड चाहिए?", "મારે કેટલું ઇમરજન્સી ફંડ જોઈએ?", "Mujhe kitna emergency fund chahiye?")),
        title: L(t("Build your emergency fund", "इमरजेंसी फंड बनाइए", "ઇમરજન્સી ફંડ બનાવો", "Emergency fund banaiye")),
        message: L(t(`Your balance covers about ${Math.round(monthsCovered * 10) / 10} months of spending. Aim for 3–6 months (${fmt(avgExpense * 3)}–${fmt(avgExpense * 6)}) before investing aggressively.`, `आपका बैलेंस लगभग ${Math.round(monthsCovered * 10) / 10} महीने का खर्च चला सकता है। आक्रामक निवेश से पहले 3–6 महीने (${fmt(avgExpense * 3)}–${fmt(avgExpense * 6)}) का फंड बनाइए।`, `તમારું બેલેન્સ આશરે ${Math.round(monthsCovered * 10) / 10} મહિનાનો ખર્ચ ચલાવી શકે. આક્રમક રોકાણ પહેલાં 3–6 મહિના (${fmt(avgExpense * 3)}–${fmt(avgExpense * 6)}) નું ફંડ બનાવો.`, `Aapka balance lagbhag ${Math.round(monthsCovered * 10) / 10} mahine ka kharcha chala sakta hai. Aggressive investment se pehle 3–6 mahine (${fmt(avgExpense * 3)}–${fmt(avgExpense * 6)}) ka fund banaiye.`)) });
    }
  }

  // Goals: status vs where they should be by today
  for (const g of goals) {
    const gi = goalInsight(g);
    const p = pct(g.currentAmount, g.targetAmount);
    if (p >= 90 && p < 100) {
      insights.push({ id: `goal-close-${g._id}`, severity: "positive", advanced: false, metric: `${p}%`, href: "/goals",
        title: L(t(`Almost there: ${g.name}`, `लगभग पूरा: ${g.name}`, `લગભગ પૂરું: ${g.name}`, `Lagbhag poora: ${g.name}`)),
        message: L(t(`You have reached ${p}% of "${g.name}". Only ${fmt(g.targetAmount - g.currentAmount)} to go!`, `"${g.name}" का ${p}% पूरा। बस ${fmt(g.targetAmount - g.currentAmount)} और!`, `"${g.name}" ના ${p}% પૂરા. બસ ${fmt(g.targetAmount - g.currentAmount)} બાકી!`, `"${g.name}" ka ${p}% poora. Bas ${fmt(g.targetAmount - g.currentAmount)} aur!`)) });
    } else if (gi.status === "behind" || gi.status === "not_started") {
      insights.push({ id: `goal-behind-${g._id}`, severity: "warning", advanced: false, metric: `${p}% / ${gi.expectedProgress}%`, href: "/goals",
        title: L(t(`"${g.name}" is behind schedule`, `"${g.name}" समय से पीछे है`, `"${g.name}" સમય કરતાં પાછળ છે`, `"${g.name}" time se peeche hai`)),
        message: L(t(`You're at ${p}% but should be near ${gi.expectedProgress}% by now. Save ${formatMoney(gi.requiredMonthly, opts.currency)}/month to finish by ${new Date(g.targetDate).toISOString().slice(0, 10)}.`, `आप ${p}% पर हैं, जबकि अब तक लगभग ${gi.expectedProgress}% होना चाहिए था। ${new Date(g.targetDate).toISOString().slice(0, 10)} तक पूरा करने के लिए हर महीने ${formatMoney(gi.requiredMonthly, opts.currency)} बचाइए।`, `તમે ${p}% પર છો, જ્યારે અત્યાર સુધીમાં આશરે ${gi.expectedProgress}% હોવું જોઈએ. ${new Date(g.targetDate).toISOString().slice(0, 10)} સુધી પૂરું કરવા દર મહિને ${formatMoney(gi.requiredMonthly, opts.currency)} બચાવો.`, `Aap ${p}% par hain, jabki ab tak lagbhag ${gi.expectedProgress}% hona chahiye tha. ${new Date(g.targetDate).toISOString().slice(0, 10)} tak poora karne ke liye har mahine ${formatMoney(gi.requiredMonthly, opts.currency)} bachaiye.`)) });
    } else if (gi.status === "overdue") {
      insights.push({ id: `goal-overdue-${g._id}`, severity: "warning", advanced: false, href: "/goals",
        title: L(t(`"${g.name}" deadline passed`, `"${g.name}" की तारीख निकल गई`, `"${g.name}" ની તારીખ વીતી ગઈ`, `"${g.name}" ki date nikal gayi`)),
        message: L(t(`${fmt(g.targetAmount - g.currentAmount)} is still left. Extend the date or raise contributions.`, `अभी ${fmt(g.targetAmount - g.currentAmount)} बाकी है। तारीख आगे बढ़ाइए या योगदान बढ़ाइए।`, `હજી ${fmt(g.targetAmount - g.currentAmount)} બાકી છે. તારીખ લંબાવો અથવા યોગદાન વધારો.`, `Abhi ${fmt(g.targetAmount - g.currentAmount)} baaki hai. Date aage badhaiye ya contribution badhaiye.`)) });
    }
  }

  // ======================= ADVANCED (Plus / Pro / Unlimited) =======================
  const advanced: Insight[] = [];

  // 50/30/20 split for the current month (needs / wants / savings)
  if (now.income > 0 && now.expense > 0) {
    const nw = needsWantsOf(now.cats);
    const needs = pct(nw.needs, now.income);
    const wants = pct(nw.wants, now.income);
    const saved = Math.round((100 - needs - wants) * 10) / 10;
    const ok = needs <= 55 && wants <= 35 && saved >= 15;
    advanced.push({ id: "503020", severity: ok ? "positive" : "info", advanced: true, metric: `${Math.round(needs)}/${Math.round(wants)}/${Math.round(saved)}`, ask: L(t("Show my 50/30/20 split", "मेरा 50/30/20 दिखाओ", "મારો 50/30/20 બતાવો", "Mera 50/30/20 dikhao")),
      title: L(t("Your 50/30/20 split", "आपका 50/30/20 हिसाब", "તમારો 50/30/20 હિસાબ", "Aapka 50/30/20 split")),
      message: L(t(`Needs ${needs}% · Wants ${wants}% · Savings ${saved}% of income (ideal 50/30/20). ${wants > 30 ? `Trimming wants to 30% frees ${fmt(Math.round(nw.wants - now.income * 0.3))} a month.` : ok ? "Well balanced." : "Try to keep needs near 50%."}`, `ज़रूरतें ${needs}% · शौक ${wants}% · बचत ${saved}% (आदर्श 50/30/20)। ${wants > 30 ? `शौक 30% तक लाने से हर महीने ${fmt(Math.round(nw.wants - now.income * 0.3))} बचेंगे।` : ok ? "संतुलन अच्छा है।" : "ज़रूरतें 50% के आसपास रखने की कोशिश कीजिए।"}`, `જરૂરિયાત ${needs}% · શોખ ${wants}% · બચત ${saved}% (આદર્શ 50/30/20). ${wants > 30 ? `શોખ 30% સુધી લાવવાથી દર મહિને ${fmt(Math.round(nw.wants - now.income * 0.3))} બચશે.` : ok ? "સંતુલન સારું છે." : "જરૂરિયાત 50% આસપાસ રાખવાનો પ્રયાસ કરો."}`, `Zaroorat ${needs}% · Shauk ${wants}% · Bachat ${saved}% (ideal 50/30/20). ${wants > 30 ? `Shauk 30% tak laane se har mahine ${fmt(Math.round(nw.wants - now.income * 0.3))} bachenge.` : ok ? "Balance achha hai." : "Zaroorat 50% ke aas-paas rakhne ki koshish kijiye."}`)) });
  }

  // Category spikes vs 3-month average
  for (const [cat, amount] of now.cats) {
    const avg = history.reduce((s, m) => s + (m.cats.get(cat) ?? 0), 0) / 3;
    if (avg > 0 && amount > avg * 1.5 && amount - avg > 100_000) {
      const change = pct(amount - avg, avg);
      advanced.push({ id: `cat-spike-${cat}`, severity: "warning", advanced: true, metric: `+${change}%`, href: "/expenses",
        title: L(t(`Unusually high spending on ${cat}`, `${cat} पर असामान्य रूप से ज़्यादा खर्च`, `${cat} પર અસામાન્ય રીતે વધુ ખર્ચ`, `${cat} pe unusually zyada kharcha`)),
        message: L(t(`${cat} is at ${fmt(amount)} this month — ${change}% above your 3-month average of ${fmt(Math.round(avg))}.`, `इस महीने ${cat} ${fmt(amount)} पर है — 3 महीने के औसत ${fmt(Math.round(avg))} से ${change}% ज़्यादा।`, `આ મહિને ${cat} ${fmt(amount)} પર છે — 3 મહિનાની સરેરાશ ${fmt(Math.round(avg))} કરતાં ${change}% વધુ.`, `Is mahine ${cat} ${fmt(amount)} par hai — 3 mahine ke average ${fmt(Math.round(avg))} se ${change}% zyada.`)) });
    }
  }

  // Dominant category
  if (now.expense > 0) {
    const top = [...now.cats.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const share = pct(top[1], now.expense);
      if (share >= 40 && top[0] !== "Rent" && top[0] !== "EMI / Debt") {
        advanced.push({ id: "top-category", severity: "info", advanced: true, metric: `${share}%`, href: "/budgets",
          title: L(t(`${top[0]} dominates your spending`, `खर्च में ${top[0]} सबसे आगे`, `ખર્ચમાં ${top[0]} સૌથી આગળ`, `Kharche mein ${top[0]} sabse aage`)),
          message: L(t(`${share}% of this month's expenses went to ${top[0]}. A monthly limit here would have the biggest impact.`, `इस महीने के ${share}% खर्च ${top[0]} पर गए। यहां महीने की लिमिट रखने से सबसे ज़्यादा फर्क पड़ेगा।`, `આ મહિનાના ${share}% ખર્ચ ${top[0]} પર ગયા. અહીં મહિનાની લિમિટ રાખવાથી સૌથી વધુ ફરક પડશે.`, `Is mahine ke ${share}% kharche ${top[0]} pe gaye. Yahan monthly limit rakhne se sabse zyada farak padega.`)) });
      }
    }
  }

  // Recurring payments / subscriptions
  const subs = (recurringExp as { _id: { t: string }; amount: number; recurring?: string; n: number }[]).filter((r) => r.amount > 0);
  if (subs.length >= 2) {
    // per-month equivalent: weekly × 4.33, yearly ÷ 12
    const monthly = Math.round(subs.reduce((s, r) => s + (r.recurring === "weekly" ? r.amount * 4.33 : r.recurring === "yearly" ? r.amount / 12 : r.amount), 0));
    advanced.push({ id: "subscriptions", severity: "info", advanced: true, metric: fmt(monthly), ask: L(t("Show my recurring payments", "मेरे फिक्स खर्च दिखाओ", "મારા ફિક્સ ખર્ચ બતાવો", "Mere fixed kharche dikhao")),
      title: L(t("Review recurring payments", "हर महीने के फिक्स खर्च जांचिए", "દર મહિનાના ફિક્સ ખર્ચ તપાસો", "Har mahine ke fixed kharche check kijiye")),
      message: L(t(`${subs.length} repeating payments add up to about ${fmt(monthly)} a month. Cancel anything you haven't used in the last month.`, `${subs.length} बार-बार होने वाले भुगतान हर महीने लगभग ${fmt(monthly)} हैं। जो पिछले महीने इस्तेमाल नहीं हुआ, उसे बंद कीजिए।`, `${subs.length} વારંવાર થતી ચુકવણી દર મહિને આશરે ${fmt(monthly)} છે. જે ગયા મહિને વપરાયું નથી તે બંધ કરો.`, `${subs.length} baar-baar hone wale payments har mahine lagbhag ${fmt(monthly)} hain. Jo pichle mahine use nahi hua, use band kijiye.`)) });
  }

  // Consistent saver
  const positiveMonths = history.filter((m) => m.income > 0 && m.income > m.expense).length;
  if (positiveMonths === 3) {
    const avgSave = Math.round(history.reduce((s, m) => s + (m.income - m.expense), 0) / 3);
    advanced.push({ id: "consistent-saver", severity: "positive", advanced: true,
      title: L(t("You save consistently", "आप लगातार बचत कर रहे हैं", "તમે સતત બચત કરો છો", "Aap lagaataar bachat kar rahe hain")),
      message: L(t(`You saved money in each of the last 3 months — about ${fmt(avgSave)} per month. Automate a fixed transfer of that amount on salary day.`, `पिछले 3 महीनों में हर महीने बचत हुई — औसतन ${fmt(avgSave)}। सैलरी वाले दिन इतनी रकम अपने-आप अलग करने की आदत डालिए।`, `છેલ્લા 3 મહિનામાં દર મહિને બચત થઈ — સરેરાશ ${fmt(avgSave)}. પગારના દિવસે આટલી રકમ આપમેળે અલગ કરવાની ટેવ પાડો.`, `Pichle 3 mahino mein har mahine bachat hui — average ${fmt(avgSave)}. Salary wale din itni amount apne-aap alag karne ki aadat daaliye.`)) });
  } else if (history.filter((m) => m.income > 0).length >= 2 && positiveMonths === 0) {
    advanced.push({ id: "negative-streak", severity: "critical", advanced: true, href: "/budgets",
      title: L(t("Expenses exceeded income recently", "हाल में खर्च आमदनी से ज़्यादा रहा", "તાજેતરમાં ખર્ચ આવક કરતાં વધુ રહ્યો", "Haal mein kharcha income se zyada raha")),
      message: L(t("Your expenses were higher than income in recent months. Set a budget per category to stop the drain.", "हाल के महीनों में खर्च आमदनी से ज़्यादा रहा। हर कैटेगरी का बजट बनाकर ये रिसाव रोकिए।", "તાજેતરના મહિનાઓમાં ખર્ચ આવક કરતાં વધુ રહ્યો. દરેક કેટેગરીનું બજેટ બનાવી આ લીકેજ રોકો.", "Haal ke mahino mein kharcha income se zyada raha. Har category ka budget banakar ye leakage rokiye.")) });
  }

  // Debt payoff projection + highest interest
  if (debts.length) {
    const highest = [...debts].sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0))[0];
    if (highest.interestRate >= 12) {
      advanced.push({ id: "high-interest", severity: "warning", advanced: true, href: "/debts",
        title: L(t(`Prioritise "${highest.title}"`, `"${highest.title}" को पहले चुकाइए`, `"${highest.title}" પહેલાં ચૂકવો`, `"${highest.title}" ko pehle chukaiye`)),
        message: L(t(`At ${highest.interestRate}% p.a. it is your costliest debt. Prepaying it first (avalanche method) saves the most interest.`, `${highest.interestRate}% सालाना ब्याज के साथ ये आपका सबसे महंगा कर्ज़ है। इसे पहले चुकाने (avalanche तरीका) से सबसे ज़्यादा ब्याज बचेगा।`, `${highest.interestRate}% વાર્ષિક વ્યાજ સાથે આ તમારું સૌથી મોંઘું દેવું છે. તેને પહેલાં ચૂકવવાથી (avalanche રીત) સૌથી વધુ વ્યાજ બચશે.`, `${highest.interestRate}% saalana byaj ke saath ye aapka sabse mehenga karz hai. Ise pehle chukane (avalanche method) se sabse zyada byaj bachega.`)) });
    }
    const maxMonths = Math.max(...debts.map((d) => (d.emiAmount ? Math.ceil(d.remainingAmount / d.emiAmount) : 0)));
    if (maxMonths > 0) {
      advanced.push({ id: "debt-free", severity: "info", advanced: true,
        title: L(t("Debt-free projection", "कर्ज़-मुक्त होने का अनुमान", "દેવામુક્ત થવાનો અંદાજ", "Debt-free hone ka andaaz")),
        message: L(t(`At current EMIs you will be debt-free in about ${maxMonths} month${maxMonths === 1 ? "" : "s"} (${monthLabel(shiftMonth(cur, maxMonths))}).`, `मौजूदा EMI से आप लगभग ${maxMonths} महीने में (${monthLabel(shiftMonth(cur, maxMonths))}) कर्ज़-मुक्त होंगे।`, `હાલની EMI થી તમે આશરે ${maxMonths} મહિનામાં (${monthLabel(shiftMonth(cur, maxMonths))}) દેવામુક્ત થશો.`, `Current EMI se aap lagbhag ${maxMonths} mahine mein (${monthLabel(shiftMonth(cur, maxMonths))}) debt-free honge.`)) });
    }
  }

  // Large single transaction
  const big = largest[0] as unknown as { title: string; amount: number; category: string } | undefined;
  if (big && curExpenseCount >= 3 && now.expense > 0 && big.amount >= now.expense * 0.35) {
    advanced.push({ id: "large-txn", severity: "info", advanced: true,
      title: L(t("One large expense this month", "इस महीने एक बड़ा खर्च", "આ મહિને એક મોટો ખર્ચ", "Is mahine ek bada kharcha")),
      message: L(t(`"${big.title}" (${fmt(big.amount)}, ${big.category}) is ${pct(big.amount, now.expense)}% of this month's spending.`, `"${big.title}" (${fmt(big.amount)}, ${big.category}) इस महीने के खर्च का ${pct(big.amount, now.expense)}% है।`, `"${big.title}" (${fmt(big.amount)}, ${big.category}) આ મહિનાના ખર્ચના ${pct(big.amount, now.expense)}% છે.`, `"${big.title}" (${fmt(big.amount)}, ${big.category}) is mahine ke kharche ka ${pct(big.amount, now.expense)}% hai.`)) });
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
  const sorted = (list: Insight[]) => list.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    insights: sorted(opts.advanced ? [...insights, ...advanced] : insights),
    lockedCount: opts.advanced ? 0 : advanced.length,
    generatedAt: new Date().toISOString(),
    lang,
  };
}
