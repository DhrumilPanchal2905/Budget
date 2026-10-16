// Angel AI language-understanding tests (no database needed).
// Run:  npx tsx scripts/test-angel.ts
import { parse, type Intent, type Lang } from "../src/lib/angel/parse";
import { isWakePhrase, isSleepPhrase } from "../src/lib/angel/wake";

const TODAY = "2026-10-16";

interface Case {
  q: string;
  intent: Intent;
  amount?: number | null;
  cat?: string | null;
  inc?: string | null;
  period?: string | null;
  date?: string | null;
  lang?: Lang;
  months?: number | null;
}

const cases: Case[] = [
  // ---- balance ----
  { q: "mera current balance kitna hai", intent: "balance", lang: "hn" },
  { q: "What's my balance?", intent: "balance", lang: "en" },
  { q: "मेरा बैलेंस कितना है", intent: "balance", lang: "hi" },
  { q: "મારું બેલેન્સ કેટલું છે", intent: "balance", lang: "gu" },
  { q: "maru balance ketlu che", intent: "balance", lang: "gu" },
  { q: "mere paas kitne paise bache hain", intent: "balance" },
  { q: "how much money do I have", intent: "balance" },
  { q: "balence", intent: "balance" },
  // ---- expense queries ----
  { q: "is mahine kitna kharcha hua", intent: "expense", period: "month", lang: "hn" },
  { q: "how much did I spend last month", intent: "expense", period: "lastMonth", lang: "en" },
  { q: "पिछले महीने कितना खर्च हुआ", intent: "expense", period: "lastMonth", lang: "hi" },
  { q: "ગયા મહિને કેટલો ખર્ચ થયો", intent: "expense", period: "lastMonth", lang: "gu" },
  { q: "petrol pe is mahine kitna gaya", intent: "expense", cat: "Fuel", period: "month" },
  { q: "food pe kitna kharcha kiya october mein", intent: "expense", cat: "Food & Dining", period: "namedMonth" },
  { q: "aaj ka kharcha", intent: "expense", period: "today" },
  { q: "kal kitna kharch hua", intent: "expense", period: "yesterday" },
  { q: "pichle 3 mahine ka kharcha batao", intent: "expense", period: "lastNMonths" },
  { q: "total expense ab tak", intent: "expense", period: "all" },
  { q: "is saal ka kharcha", intent: "expense", period: "year" },
  { q: "આ અઠવાડિયે કેટલો ખર્ચ", intent: "expense", period: "week" },
  // ---- income ----
  { q: "is mahine ki income kitni hai", intent: "income", period: "month" },
  { q: "इस महीने कितनी कमाई हुई", intent: "income", period: "month" },
  { q: "આ મહિને આવક કેટલી", intent: "income", period: "month" },
  { q: "how much salary did I get this year", intent: "income", period: "year" },
  // ---- other queries ----
  { q: "is mahine kitni bachat hui", intent: "savings", period: "month" },
  { q: "sabse zyada kharcha kahan hua", intent: "top_categories" },
  { q: "where did my money go this month", intent: "top_categories" },
  { q: "sabse bada kharcha kaunsa tha", intent: "largest" },
  { q: "pichle mahine se compare karo", intent: "compare" },
  { q: "last transactions dikhao", intent: "recent" },
  { q: "meri financial health kaisi hai", intent: "health" },
  { q: "mera loan kitna baki hai", intent: "debts" },
  { q: "next emi kab hai", intent: "debts" },
  { q: "mere goals ka status", intent: "goals" },
  { q: "mahine ke end tak kitna bachega", intent: "forecast" },
  { q: "roz ka average kharcha kitna hai", intent: "average" },
  { q: "insights batao", intent: "insights" },
  // ---- advice ----
  { q: "mujhe 1 lakh bachana hai 6 mahine mein to kya karna chahiye", intent: "advice", amount: 100000, months: 6 },
  { q: "ab muje itni saving karna hai to kya karna chiaye", intent: "advice" },
  { q: "how can I save more money", intent: "advice" },
  { q: "मुझे हर महीने 10000 बचाने हैं कैसे करूं", intent: "advice", amount: 10000 },
  { q: "મારે 50000 બચાવવા છે શું કરું", intent: "advice", amount: 50000 },
  { q: "kya main 50000 ka phone le sakta hu", intent: "afford", amount: 50000 },
  { q: "can I afford a 2 lakh bike", intent: "afford", amount: 200000 },
  // ---- actions ----
  { q: "aaj 500 ka petrol add karo", intent: "add_expense", amount: 500, cat: "Fuel", date: "2026-10-16" },
  { q: "500 ka petrol add kar do", intent: "add_expense", amount: 500, cat: "Fuel" },
  { q: "petrol 500", intent: "add_expense", amount: 500, cat: "Fuel" },
  { q: "kal 1200 grocery pe kharch kiye", intent: "add_expense", amount: 1200, cat: "Groceries", date: "2026-10-15" },
  { q: "maine 2.5k shopping pe kharch kiye", intent: "add_expense", amount: 2500, cat: "Shopping" },
  { q: "add expense 350 for lunch", intent: "add_expense", amount: 350, cat: "Food & Dining" },
  { q: "आज 300 रुपये सब्जी में खर्च किए", intent: "add_expense", amount: 300, cat: "Groceries" },
  { q: "આજે 800 નું પેટ્રોલ ઉમેરો", intent: "add_expense", amount: 800, cat: "Fuel" },
  { q: "do hazaar paanch sau ka bijli bill bhara", intent: "add_expense", amount: 2500, cat: "Utilities" },
  { q: "dedh lakh ka laptop kharida", intent: "add_expense", amount: 150000 },
  { q: "salary aayi 50000", intent: "add_income", amount: 50000, inc: "Salary" },
  { q: "50000 salary add karo", intent: "add_income", amount: 50000, inc: "Salary" },
  { q: "आज 45000 सैलरी मिली", intent: "add_income", amount: 45000, inc: "Salary" },
  { q: "પગાર 60000 આવ્યો", intent: "add_income", amount: 60000, inc: "Salary" },
  { q: "5000 ka bonus mila", intent: "add_income", amount: 5000, inc: "Bonus" },
  { q: "emergency fund goal mein 5000 daalo", intent: "goal_contribute", amount: 5000 },
  { q: "emi bhar di", intent: "pay_emi" },
  { q: "home loan ki emi 12000 pay kar di", intent: "pay_emi", amount: 12000 },
  { q: "car ke liye 5 lakh ka goal banao december tak", intent: "create_goal", amount: 500000 },
  { q: "naya loan add karo 5 lakh emi 12000", intent: "create_debt", amount: 500000 },
  { q: "last expense delete karo", intent: "delete_last" },
  { q: "undo karo", intent: "undo" },
  { q: "galti ho gayi wapas lo", intent: "undo" },
  // ---- admin ----
  { q: "kitne users hain", intent: "platform_summary" },
  { q: "sabka total kharcha kitna hai", intent: "expense" }, // answered for all users (platform scope)
  { q: "how many users signed up this month", intent: "platform_summary", period: "month" },
  { q: "users ki list dikhao", intent: "list_users" },
  { q: "ravi ka balance kitna hai", intent: "balance" },
  { q: "naya user banao ravi sharma ravi@gmail.com", intent: "create_user" },
  { q: "create user priya at the rate gmail dot com", intent: "create_user" },
  { q: "ravi ka plan unlimited kar do", intent: "change_plan" },
  // ---- small talk ----
  { q: "tum kaun ho", intent: "identity" },
  { q: "who made you", intent: "identity" },
  { q: "તમે કોણ છો", intent: "identity" },
  { q: "hello angel", intent: "greet" },
  { q: "namaste", intent: "greet" },
  { q: "thank you", intent: "thanks" },
  { q: "dhanyavad", intent: "thanks" },
  { q: "haan", intent: "yes" },
  { q: "nahi rehne do", intent: "no" },
  { q: "ok kar do", intent: "yes" },
  { q: "bye angel", intent: "stop" },
  { q: "help", intent: "help" },
  // ---- overview / profile / admin knows everything ----
  { q: "mera hisaab batao", intent: "overview" },
  { q: "मेरा हिसाब बताओ", intent: "overview" },
  { q: "મારો હિસાબ બતાવો", intent: "overview" },
  { q: "kaisa chal raha hai mera budget", intent: "overview" },
  { q: "how am i doing", intent: "overview" },
  { q: "give me a summary", intent: "overview" },
  { q: "mera plan kya hai", intent: "profile" },
  { q: "mera naam kya hai", intent: "profile" },
  { q: "ravi ke baare mein batao", intent: "profile" },
  { q: "ravi ka email kya hai", intent: "profile" },
  { q: "ravi ne last login kab kiya", intent: "profile" },
  { q: "details of ravi", intent: "profile" },
  { q: "sabse zyada kharcha kis user ne kiya", intent: "top_users" },
  { q: "who spent the most this month", intent: "top_users" },
  { q: "free users kitne hain", intent: "users_query" },
  { q: "aaj kitne users ne login kiya", intent: "users_query", period: "today" },
  { q: "admin kaun hai", intent: "users_query" },
  { q: "disabled users", intent: "users_query" },
  { q: "paise kahan ja rahe hain", intent: "top_categories" },
  { q: "how much do i owe", intent: "debts" },
  { q: "kya haal hai", intent: "greet" },
  { q: "achha", intent: "ack" },
  { q: "budget kaise control karu", intent: "advice" },
];

let pass = 0;
const fails: string[] = [];
for (const c of cases) {
  const r = parse(c.q, TODAY);
  const problems: string[] = [];
  if (r.intent !== c.intent) problems.push(`intent=${r.intent} (want ${c.intent})`);
  if (c.amount !== undefined && r.amount !== c.amount) problems.push(`amount=${r.amount} (want ${c.amount})`);
  if (c.cat !== undefined && r.expenseCategory !== c.cat) problems.push(`cat=${r.expenseCategory} (want ${c.cat})`);
  if (c.inc !== undefined && r.incomeCategory !== c.inc) problems.push(`inc=${r.incomeCategory} (want ${c.inc})`);
  if (c.period !== undefined && (r.period?.kind ?? null) !== c.period) problems.push(`period=${r.period?.kind ?? null} (want ${c.period})`);
  if (c.date !== undefined && r.dates.date !== c.date) problems.push(`date=${r.dates.date} (want ${c.date})`);
  if (c.lang !== undefined && r.lang !== c.lang) problems.push(`lang=${r.lang} (want ${c.lang})`);
  if (c.months !== undefined && r.dates.months !== c.months) problems.push(`months=${r.dates.months} (want ${c.months})`);
  if (problems.length) fails.push(`✗ "${c.q}" → ${problems.join(", ")}`);
  else pass++;
}

// ---- wake word ----
const wakeYes = ["and gel active", "एंजेल एक्टिवेट", "એન્જલ શરૂ", "angels active", "angel active", "Angel activate", "hey angel", "एंजल एक्टिव", "एंजेल एक्टिव", "angle active", "એન્જલ એક્ટિવ", "ok angel", "एंजल चालू", "angel chalu karo", "hi angel", "ઍન્જલ ચાલુ", "enjal active"];
const wakeNo = ["angel", "active", "mera balance kitna hai", "the angel movie was good", "angels are", "petrol 500"];
for (const w of wakeYes) (isWakePhrase(w) ? pass++ : fails.push(`✗ wake should fire: "${w}"`));
for (const w of wakeNo) (!isWakePhrase(w) ? pass++ : fails.push(`✗ wake should NOT fire: "${w}"`));
for (const w of ["angel band karo", "bye angel", "एंजल बंद करो", "angel stop", "angel deactivate", "એન્જલ બંધ કરો"]) (isSleepPhrase(w) ? pass++ : fails.push(`✗ sleep should fire: "${w}"`));

for (const w of ["loan band karo", "haan bas", "petrol 500 bas itna", "so how much did i spend"]) (!isSleepPhrase(w) ? pass++ : fails.push(`✗ sleep should NOT fire: "${w}"`));
const total = cases.length + wakeYes.length + wakeNo.length + 6 + 4;

console.log(fails.join("\n"));
console.log(`\n${pass}/${total} passed`);
if (fails.length) process.exit(1);
