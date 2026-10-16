// Angel AI — the "thinking" part: saving plans and affordability, computed from the user's real numbers.
// Pure functions (no database) so the logic is testable and explainable.
import type { Lang } from "./parse";
import { L, catLabel, dateLabel, money, pctStr, type Who } from "./i18n";
import { addMonths, monthsBetween } from "./dates";

export interface AdvisorInput {
  lang: Lang;
  currency: string;
  who: Who;
  today: string; // YYYY-MM-DD
  balance: number; // lifetime income − expense (major units)
  avgIncome: number; // monthly average
  avgExpense: number;
  monthsOfData: number;
  categoryAvg: { category: string; avg: number }[]; // monthly average per expense category
  emiMonthly: number;
  debts: { title: string; remaining: number; interestRate: number; emi: number }[];
}

export interface SaveTarget {
  amount: number | null;
  months: number | null;
  deadline: string | null;
  perMonth: boolean;
}

export interface AdviceResult {
  text: string;
  speak: string;
  cuts: { category: string; from: number; to: number; save: number }[];
  suggestGoal: { name: string; target: number; targetDate: string } | null;
  monthlyNeeded: number | null;
}

/** How much of each category is realistically trimmable (share of the monthly average). */
const CUTTABLE: Record<string, number> = {
  "Food & Dining": 0.3,
  Shopping: 0.4,
  Entertainment: 0.4,
  Travel: 0.3,
  Subscriptions: 0.5,
  Other: 0.25,
  Transport: 0.15,
  Fuel: 0.1,
  Groceries: 0.1,
  Utilities: 0.1,
  Family: 0.1,
};

const round100 = (n: number) => Math.round(n / 100) * 100;

export function planSavings(inp: AdvisorInput, t: SaveTarget): AdviceResult {
  const { lang, currency: cur, who } = inp;
  const m = (n: number) => money(Math.round(n), cur);
  const signed = (n: number) => `${n < 0 ? "−" : ""}${m(Math.abs(n))}`;
  const surplus = inp.avgIncome - inp.avgExpense;
  const lines: string[] = [];

  if (inp.avgIncome <= 0 && inp.avgExpense <= 0) {
    const text = L(lang, {
      en: "I don't have enough income and expense history yet to build a reliable plan. Add a month of income and expenses (you can just tell me, e.g. “add 500 petrol”) and I'll make a personalised saving plan.",
      hi: "अभी मेरे पास इतना डेटा नहीं है कि सही प्लान बना सकूं। एक महीने की आमदनी और खर्च जोड़ दीजिए (बस बोलिए, जैसे “500 का पेट्रोल जोड़ो”), फिर मैं आपके लिए पक्का सेविंग प्लान बना दूंगी।",
      gu: "હજી મારી પાસે પૂરતો ડેટા નથી કે સાચો પ્લાન બનાવી શકું. એક મહિનાની આવક અને ખર્ચ ઉમેરો (બસ બોલો, જેમ કે “500 નું પેટ્રોલ ઉમેરો”), પછી હું તમારા માટે પાક્કો બચત પ્લાન બનાવી દઈશ.",
      hn: "Abhi mere paas itna data nahi hai ki sahi plan bana sakun. Ek mahine ki income aur kharcha add kar dijiye (bas boliye, jaise “500 ka petrol add karo”), phir main aapke liye pakka saving plan bana dungi.",
    });
    return { text, speak: text, cuts: [], suggestGoal: null, monthlyNeeded: null };
  }

  // ---------- target per month ----------
  let months = t.months;
  if (!months && t.deadline) months = monthsBetween(inp.today, t.deadline);
  let monthlyNeeded: number | null = null;
  let generic = false;
  if (t.amount && t.perMonth) monthlyNeeded = t.amount;
  else if (t.amount && months) monthlyNeeded = Math.ceil(t.amount / months);
  else if (!t.amount) {
    monthlyNeeded = round100(Math.max(inp.avgIncome * 0.2, 0));
    generic = true;
  }

  // ---------- where the money can come from ----------
  const potentials = inp.categoryAvg
    .filter((c) => CUTTABLE[c.category] && c.avg > 0)
    .map((c) => ({ category: c.category, from: c.avg, save: round100(c.avg * CUTTABLE[c.category]) }))
    .filter((c) => c.save >= 100)
    .sort((a, b) => b.save - a.save);
  const maxExtra = potentials.reduce((s, c) => s + c.save, 0);
  const gap = monthlyNeeded !== null ? monthlyNeeded - Math.max(0, surplus) : t.amount ? 0 : 0;
  const cuts: AdviceResult["cuts"] = [];
  let covered = 0;
  for (const p of potentials) {
    if ((gap > 0 && covered >= gap) || (gap <= 0 && cuts.length >= 3)) break;
    cuts.push({ category: p.category, from: p.from, to: p.from - p.save, save: p.save });
    covered += p.save;
  }

  // ---------- headline ----------
  lines.push(
    L(lang, {
      en: `${who.self ? "Here's what I see" : `Looking at ${who.name}'s data`}: average income ${m(inp.avgIncome)}/month, average spending ${m(inp.avgExpense)}/month, so about ${m(Math.max(0, surplus))} is left each month${surplus < 0 ? ` (spending is higher than income by ${m(-surplus)})` : ""}.`,
      hi: `${who.self ? "आपका हिसाब देखा" : `${who.name} का हिसाब देखा`}: औसत आमदनी ${m(inp.avgIncome)}/महीना, औसत खर्च ${m(inp.avgExpense)}/महीना — यानी हर महीने लगभग ${m(Math.max(0, surplus))} बचते हैं${surplus < 0 ? ` (खर्च आमदनी से ${m(-surplus)} ज़्यादा है)` : ""}।`,
      gu: `${who.self ? "તમારો હિસાબ જોયો" : `${who.name}નો હિસાબ જોયો`}: સરેરાશ આવક ${m(inp.avgIncome)}/મહિનો, સરેરાશ ખર્ચ ${m(inp.avgExpense)}/મહિનો — એટલે દર મહિને આશરે ${m(Math.max(0, surplus))} બચે છે${surplus < 0 ? ` (ખર્ચ આવક કરતાં ${m(-surplus)} વધારે છે)` : ""}.`,
      hn: `${who.self ? "Aapka hisaab dekha" : `${who.name} ka hisaab dekha`}: average income ${m(inp.avgIncome)}/mahina, average kharcha ${m(inp.avgExpense)}/mahina — yaani har mahine lagbhag ${m(Math.max(0, surplus))} bachte hain${surplus < 0 ? ` (kharcha income se ${m(-surplus)} zyada hai)` : ""}.`,
    }),
  );

  // ---------- verdict ----------
  let suggestGoal: AdviceResult["suggestGoal"] = null;
  if (t.amount && !t.perMonth && !months) {
    // "I want to save 1 lakh" — how long will it take?
    const atCurrent = surplus > 0 ? Math.ceil(t.amount / surplus) : null;
    const withCuts = surplus + maxExtra > 0 ? Math.ceil(t.amount / (Math.max(0, surplus) + maxExtra)) : null;
    lines.push(
      atCurrent
        ? L(lang, {
            en: `At this pace, ${m(t.amount)} will take about ${atCurrent} month${atCurrent > 1 ? "s" : ""}${withCuts && withCuts < atCurrent ? `; with the small cuts below, about ${withCuts} months` : ""}.`,
            hi: `इसी रफ़्तार से ${m(t.amount)} जुड़ने में लगभग ${atCurrent} महीने लगेंगे${withCuts && withCuts < atCurrent ? `; नीचे दिए छोटे बदलावों से सिर्फ़ ${withCuts} महीने` : ""}।`,
            gu: `આ ઝડપે ${m(t.amount)} ભેગા થતાં આશરે ${atCurrent} મહિના લાગશે${withCuts && withCuts < atCurrent ? `; નીચેના નાના ફેરફારોથી માત્ર ${withCuts} મહિના` : ""}.`,
            hn: `Isi raftaar se ${m(t.amount)} jodne mein lagbhag ${atCurrent} mahine lagenge${withCuts && withCuts < atCurrent ? `; neeche diye chhote badlavon se sirf ${withCuts} mahine` : ""}.`,
          })
        : L(lang, {
            en: `Right now nothing is left over at month-end, so we first need to free up money — here's where:`,
            hi: `अभी महीने के अंत में कुछ नहीं बचता, इसलिए पहले खर्च में जगह बनानी होगी — यहां से:`,
            gu: `હાલમાં મહિનાના અંતે કંઈ બચતું નથી, એટલે પહેલા ખર્ચમાં જગ્યા બનાવવી પડશે — અહીંથી:`,
            hn: `Abhi mahine ke end mein kuch nahi bachta, isliye pehle kharche mein jagah banani hogi — yahan se:`,
          }),
    );
    const mo = withCuts ?? atCurrent ?? 12;
    suggestGoal = { name: "Savings goal", target: t.amount, targetDate: addMonths(inp.today, Math.max(1, mo)) };
    monthlyNeeded = Math.ceil(t.amount / Math.max(1, mo));
  } else if (monthlyNeeded !== null) {
    const need = m(monthlyNeeded);
    if (generic) {
      lines.push(
        L(lang, {
          en: `A healthy target is saving 20% of income — about ${need} a month.${surplus >= monthlyNeeded ? " You're already there 👏 — let's protect it." : ""}`,
          hi: `अच्छा लक्ष्य है आमदनी का 20% बचाना — यानी लगभग ${need} हर महीने।${surplus >= monthlyNeeded ? " आप पहले से ही वहां हैं 👏 — बस इसे बनाए रखें।" : ""}`,
          gu: `સારું લક્ષ્ય છે આવકના 20% બચાવવા — એટલે આશરે ${need} દર મહિને.${surplus >= monthlyNeeded ? " તમે પહેલેથી ત્યાં છો 👏 — બસ જાળવી રાખો." : ""}`,
          hn: `Achha target hai income ka 20% bachana — yaani lagbhag ${need} har mahine.${surplus >= monthlyNeeded ? " Aap pehle se wahan hain 👏 — bas ise bana ke rakhiye." : ""}`,
        }),
      );
    } else if (surplus >= monthlyNeeded) {
      lines.push(
        L(lang, {
          en: `Good news — you need ${need}/month${months ? ` for ${months} months` : ""}, and you already save more than that. Just move ${need} aside as soon as income arrives.`,
          hi: `अच्छी खबर — आपको ${need}/महीना चाहिए${months ? ` (${months} महीने तक)` : ""}, और आप पहले से इससे ज़्यादा बचा रहे हैं। बस आमदनी आते ही ${need} अलग रख दीजिए।`,
          gu: `સારા સમાચાર — તમારે ${need}/મહિનો જોઈએ${months ? ` (${months} મહિના સુધી)` : ""}, અને તમે પહેલેથી એનાથી વધુ બચાવો છો. બસ આવક આવતાં જ ${need} અલગ મૂકી દો.`,
          hn: `Achhi khabar — aapko ${need}/mahina chahiye${months ? ` (${months} mahine tak)` : ""}, aur aap pehle se isse zyada bacha rahe hain. Bas income aate hi ${need} alag rakh dijiye.`,
        }),
      );
    } else {
      const short = monthlyNeeded - Math.max(0, surplus);
      const reachable = covered >= short;
      lines.push(
        L(lang, {
          en: `You need ${need}/month${months ? ` for ${months} months` : ""} — that's ${m(short)} more than you save today. ${reachable ? "It's doable with these changes:" : "Even with cuts this is tight; here's the most you can free up:"}`,
          hi: `आपको ${need}/महीना चाहिए${months ? ` (${months} महीने तक)` : ""} — यानी अभी से ${m(short)} ज़्यादा। ${reachable ? "इन बदलावों से ये हो जाएगा:" : "कटौती के बाद भी थोड़ा मुश्किल है; ज़्यादा से ज़्यादा इतना बचा सकते हैं:"}`,
          gu: `તમારે ${need}/મહિનો જોઈએ${months ? ` (${months} મહિના સુધી)` : ""} — એટલે અત્યારથી ${m(short)} વધારે. ${reachable ? "આ ફેરફારોથી થઈ જશે:" : "કાપ પછી પણ થોડું અઘરું છે; વધુમાં વધુ આટલું બચાવી શકાય:"}`,
          hn: `Aapko ${need}/mahina chahiye${months ? ` (${months} mahine tak)` : ""} — yaani abhi se ${m(short)} zyada. ${reachable ? "In badlavon se ye ho jayega:" : "Katauti ke baad bhi thoda mushkil hai; zyada se zyada itna bacha sakte hain:"}`,
        }),
      );
      if (!reachable && t.amount && !t.perMonth && Math.max(0, surplus) + maxExtra > 0) {
        const realistic = Math.ceil(t.amount / (Math.max(0, surplus) + maxExtra));
        lines.push(
          L(lang, {
            en: `A realistic timeline is about ${realistic} months — or add a side income of ${m(short - covered)}/month.`,
            hi: `सही समय-सीमा लगभग ${realistic} महीने होगी — या हर महीने ${m(short - covered)} की extra आमदनी जोड़िए।`,
            gu: `વાસ્તવિક સમય આશરે ${realistic} મહિના રહેશે — અથવા દર મહિને ${m(short - covered)} ની વધારાની આવક ઉમેરો.`,
            hn: `Sahi timeline lagbhag ${realistic} mahine hogi — ya har mahine ${m(short - covered)} ki extra income jodiye.`,
          }),
        );
      }
    }
    if (t.amount && !t.perMonth) {
      const mo = months ?? 12;
      suggestGoal = { name: "Savings goal", target: t.amount, targetDate: t.deadline ?? addMonths(inp.today, mo) };
    }
  }

  // ---------- concrete cuts ----------
  if (cuts.length && gap <= 0) {
    lines.push(L(lang, { en: "To save even more:", hi: "और ज़्यादा बचाना हो तो:", gu: "હજી વધુ બચાવવું હોય તો:", hn: "Aur zyada bachana ho to:" }));
  }
  for (const c of cuts) {
    lines.push(
      `• ${catLabel(lang, c.category)}: ${m(c.from)} → ${m(c.to)} ` +
        L(lang, { en: `(saves ${m(c.save)})`, hi: `(${m(c.save)} बचत)`, gu: `(${m(c.save)} બચત)`, hn: `(${m(c.save)} bachat)` }),
    );
  }

  // ---------- extra smart tips ----------
  // EMIs that are tracked as loans but never recorded as expenses would make savings look bigger than they are.
  if (inp.emiMonthly > 0 && !inp.categoryAvg.some((c) => c.category === "EMI / Debt")) {
    const real = surplus - inp.emiMonthly;
    lines.push(
      L(lang, {
        en: `⚠️ Your EMIs (${m(inp.emiMonthly)}/month) aren't recorded as expenses. If you pay them, you really save about ${signed(real)} a month — use “EMI paid” so I can count them.`,
        hi: `⚠️ आपकी EMI (${m(inp.emiMonthly)}/महीना) खर्च में दर्ज नहीं है। अगर आप इन्हें भरते हैं, तो असल बचत लगभग ${signed(real)}/महीना है — “EMI भर दी” बोलिए ताकि मैं इन्हें गिन सकूं।`,
        gu: `⚠️ તમારી EMI (${m(inp.emiMonthly)}/મહિનો) ખર્ચમાં નોંધાયેલ નથી. જો તમે ભરો છો, તો ખરી બચત આશરે ${signed(real)}/મહિનો છે — “EMI ભરી દીધી” બોલો જેથી હું ગણી શકું.`,
        hn: `⚠️ Aapki EMI (${m(inp.emiMonthly)}/mahina) expense mein record nahi hai. Agar aap inhe bharte hain, to asli bachat lagbhag ${signed(real)}/mahina hai — “EMI bhar di” boliye taaki main inhe gin sakun.`,
      }),
    );
  }
  const highDebt = [...inp.debts].filter((d) => d.interestRate >= 12 && d.remaining > 0).sort((a, b) => b.interestRate - a.interestRate)[0];
  if (highDebt) {
    lines.push(
      L(lang, {
        en: `💡 "${highDebt.title}" charges ${highDebt.interestRate}% interest — prepaying it is a guaranteed ${highDebt.interestRate}% return, better than most savings.`,
        hi: `💡 "${highDebt.title}" पर ${highDebt.interestRate}% ब्याज है — इसे जल्दी चुकाना ${highDebt.interestRate}% की पक्की कमाई जैसा है।`,
        gu: `💡 "${highDebt.title}" પર ${highDebt.interestRate}% વ્યાજ છે — એને વહેલું ચૂકવવું ${highDebt.interestRate}% ની પાક્કી કમાણી જેવું છે.`,
        hn: `💡 "${highDebt.title}" par ${highDebt.interestRate}% byaj hai — ise jaldi chukana ${highDebt.interestRate}% ki pakki kamai jaisa hai.`,
      }),
    );
  }
  const emergency = inp.avgExpense * 3;
  if (inp.avgExpense > 0 && inp.balance < emergency) {
    lines.push(
      L(lang, {
        en: `💡 Keep an emergency fund of about ${m(emergency)} (3 months of spending) before investing aggressively.`,
        hi: `💡 पहले लगभग ${m(emergency)} (3 महीने के खर्च जितना) इमरजेंसी फंड बना लीजिए।`,
        gu: `💡 પહેલાં આશરે ${m(emergency)} (3 મહિનાના ખર્ચ જેટલું) ઇમરજન્સી ફંડ બનાવી લો.`,
        hn: `💡 Pehle lagbhag ${m(emergency)} (3 mahine ke kharche jitna) emergency fund bana lijiye.`,
      }),
    );
  }
  if (inp.avgIncome > 0 && inp.emiMonthly / inp.avgIncome > 0.4) {
    const ratio = pctStr((inp.emiMonthly / inp.avgIncome) * 100);
    lines.push(
      L(lang, {
        en: `⚠️ EMIs take ${ratio} of income — avoid any new loan until this is under 40%.`,
        hi: `⚠️ EMI आमदनी का ${ratio} ले रही है — 40% से नीचे आने तक नया लोन मत लीजिए।`,
        gu: `⚠️ EMI આવકના ${ratio} લઈ રહી છે — 40% થી નીચે ન આવે ત્યાં સુધી નવી લોન ન લેશો.`,
        hn: `⚠️ EMI income ka ${ratio} le rahi hai — 40% se neeche aane tak naya loan mat lijiye.`,
      }),
    );
  }
  if (suggestGoal) {
    lines.push(
      L(lang, {
        en: `Shall I create a savings goal of ${m(suggestGoal.target)} by ${dateLabel(lang, suggestGoal.targetDate)} so you can track it? Say “yes”.`,
        hi: `क्या मैं ${dateLabel(lang, suggestGoal.targetDate)} तक ${m(suggestGoal.target)} का सेविंग गोल बना दूं, ताकि आप ट्रैक कर सकें? बस “हाँ” बोलिए।`,
        gu: `શું હું ${dateLabel(lang, suggestGoal.targetDate)} સુધી ${m(suggestGoal.target)} નો બચત ગોલ બનાવી દઉં, જેથી તમે ટ્રેક કરી શકો? બસ “હા” બોલો.`,
        hn: `Kya main ${dateLabel(lang, suggestGoal.targetDate)} tak ${m(suggestGoal.target)} ka saving goal bana dun, taaki aap track kar sakein? Bas “haan” boliye.`,
      }),
    );
  }

  const text = lines.join("\n");
  const speak = lines.slice(0, 2).join(" ") + (cuts.length ? " " + L(lang, { en: "I've listed where to cut on screen.", hi: "कहां कटौती करनी है, वो स्क्रीन पर लिख दिया है।", gu: "ક્યાં કાપ મૂકવો તે સ્ક્રીન પર લખી દીધું છે.", hn: "Kahan katauti karni hai, wo screen par likh diya hai." }) : "");
  return { text, speak, cuts, suggestGoal: who.self ? suggestGoal : null, monthlyNeeded };
}

export function checkAfford(inp: AdvisorInput, price: number): { text: string; speak: string } {
  const { lang, currency: cur } = inp;
  const m = (n: number) => money(Math.round(n), cur);
  const surplus = Math.max(0, inp.avgIncome - inp.avgExpense);
  const buffer = inp.avgExpense * 3;
  const after = inp.balance - price;
  let text: string;
  if (after >= buffer) {
    text = L(lang, {
      en: `Yes, you can afford ${m(price)}. Your balance is ${m(inp.balance)}; after buying, ${m(after)} remains — still above a 3-month safety cushion of ${m(buffer)}.`,
      hi: `हाँ, आप ${m(price)} का खर्च उठा सकते हैं। बैलेंस ${m(inp.balance)} है; खरीदने के बाद ${m(after)} बचेंगे — जो 3 महीने के सेफ्टी फंड (${m(buffer)}) से ज़्यादा है।`,
      gu: `હા, તમે ${m(price)} નો ખર્ચ કરી શકો. બેલેન્સ ${m(inp.balance)} છે; ખરીદ્યા પછી ${m(after)} બચશે — જે 3 મહિનાના સેફ્ટી ફંડ (${m(buffer)}) કરતાં વધુ છે.`,
      hn: `Haan, aap ${m(price)} afford kar sakte hain. Balance ${m(inp.balance)} hai; kharidne ke baad ${m(after)} bachenge — jo 3 mahine ke safety fund (${m(buffer)}) se zyada hai.`,
    });
  } else if (after >= 0) {
    const wait = surplus > 0 ? Math.ceil((buffer - after) / surplus) : null;
    text = L(lang, {
      en: `You can pay ${m(price)} from your balance (${m(inp.balance)}), but only ${m(after)} would remain — below a safe cushion of ${m(buffer)}.${wait ? ` Waiting about ${wait} month${wait > 1 ? "s" : ""} would make it comfortable.` : ""}`,
      hi: `${m(price)} आपके बैलेंस (${m(inp.balance)}) से हो जाएगा, पर सिर्फ़ ${m(after)} बचेंगे — जो सुरक्षित रकम (${m(buffer)}) से कम है।${wait ? ` लगभग ${wait} महीने रुकें तो आराम से हो जाएगा।` : ""}`,
      gu: `${m(price)} તમારા બેલેન્સ (${m(inp.balance)}) માંથી થઈ જશે, પણ માત્ર ${m(after)} બચશે — જે સુરક્ષિત રકમ (${m(buffer)}) કરતાં ઓછું છે.${wait ? ` આશરે ${wait} મહિના રાહ જુઓ તો આરામથી થઈ જશે.` : ""}`,
      hn: `${m(price)} aapke balance (${m(inp.balance)}) se ho jayega, par sirf ${m(after)} bachenge — jo safe amount (${m(buffer)}) se kam hai.${wait ? ` Lagbhag ${wait} mahine rukein to aaram se ho jayega.` : ""}`,
    });
  } else {
    const months = surplus > 0 ? Math.ceil((price - inp.balance) / surplus) : null;
    text = L(lang, {
      en: `Not yet — you're ${m(price - inp.balance)} short (balance ${m(inp.balance)}).${months ? ` Saving ${m(surplus)}/month, you'll have it in about ${months} month${months > 1 ? "s" : ""}.` : " First we need to create a monthly surplus."}`,
      hi: `अभी नहीं — ${m(price - inp.balance)} कम हैं (बैलेंस ${m(inp.balance)})।${months ? ` हर महीने ${m(surplus)} बचाकर लगभग ${months} महीने में हो जाएगा।` : " पहले हर महीने कुछ बचत शुरू करनी होगी।"}`,
      gu: `હમણાં નહીં — ${m(price - inp.balance)} ઓછા છે (બેલેન્સ ${m(inp.balance)}).${months ? ` દર મહિને ${m(surplus)} બચાવીને આશરે ${months} મહિનામાં થઈ જશે.` : " પહેલાં દર મહિને થોડી બચત શરૂ કરવી પડશે."}`,
      hn: `Abhi nahi — ${m(price - inp.balance)} kam hain (balance ${m(inp.balance)}).${months ? ` Har mahine ${m(surplus)} bachakar lagbhag ${months} mahine mein ho jayega.` : " Pehle har mahine kuch bachat shuru karni hogi."}`,
    });
  }
  return { text, speak: text };
}
