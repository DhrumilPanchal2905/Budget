// Angel AI — general money know-how in English, हिंदी, ગુજરાતી and Hinglish.
// Written and maintained by hand (no third-party AI). The engine adds personal numbers where they help
// (e.g. your own 50/30/20 split, your costliest loan) right after these answers.
import type { T4 } from "../i18n";

export interface KbEntry {
  title: T4;
  answer: T4;
  /** follow-up questions shown as chips */
  next: T4[];
}

const q = (en: string, hi: string, gu: string, hn: string): T4 => ({ en, hi, gu, hn });

export const KB: Record<string, KbEntry> = {
  rule503020: {
    title: q("The 50/30/20 rule", "50/30/20 नियम", "50/30/20 નિયમ", "50/30/20 rule"),
    answer: q(
      "The 50/30/20 rule splits take-home income into three buckets: 50% for NEEDS (rent, groceries, bills, EMIs, insurance, transport), 30% for WANTS (eating out, shopping, entertainment, travel) and 20% for SAVINGS & investments (emergency fund, SIPs, goals, loan prepayment). It's a simple guide-rail, not a law — if your EMIs are high, cut wants first, never savings.",
      "50/30/20 नियम आमदनी को तीन हिस्सों में बांटता है: 50% ज़रूरतें (किराया, राशन, बिल, EMI, बीमा, आना-जाना), 30% शौक (बाहर खाना, शॉपिंग, मनोरंजन, घूमना) और 20% बचत व निवेश (इमरजेंसी फंड, SIP, गोल, लोन का प्रीपेमेंट)। ये एक आसान गाइड है — अगर EMI ज़्यादा हैं तो पहले शौक का खर्च घटाइए, बचत नहीं।",
      "50/30/20 નિયમ આવકને ત્રણ ભાગમાં વહેંચે છે: 50% જરૂરિયાતો (ભાડું, કરિયાણું, બિલ, EMI, વીમો, આવન-જાવન), 30% શોખ (બહાર જમવું, શોપિંગ, મનોરંજન, ફરવું) અને 20% બચત અને રોકાણ (ઇમરજન્સી ફંડ, SIP, ગોલ, લોન પ્રીપેમેન્ટ). આ એક સરળ માર્ગદર્શિકા છે — EMI વધારે હોય તો પહેલાં શોખનો ખર્ચ ઘટાડો, બચત નહીં.",
      "50/30/20 rule income ko teen hisson mein baantta hai: 50% zaroorat (rent, ration, bills, EMI, insurance, aana-jaana), 30% shauk (bahar khana, shopping, entertainment, ghoomna) aur 20% bachat aur investment (emergency fund, SIP, goals, loan prepayment). Ye ek simple guide hai — EMI zyada ho to pehle shauk ka kharcha ghataiye, bachat nahi.",
    ),
    next: [q("Show my 50/30/20 split", "मेरा 50/30/20 दिखाओ", "મારો 50/30/20 બતાવો", "Mera 50/30/20 dikhao")],
  },
  budgeting: {
    title: q("How to make a budget", "बजट कैसे बनाएं", "બજેટ કેવી રીતે બનાવવું", "Budget kaise banaye"),
    answer: q(
      "A budget that works in 4 steps: 1) Write down your monthly take-home income. 2) List fixed costs first — rent, EMIs, bills, insurance, SIPs. 3) Give every other category a monthly limit (food, fuel, shopping…) based on your last 3 months, trimmed by 10–20%. 4) Pay yourself first: move your savings amount out on salary day. Review weekly. In Budget Pro you can set a limit per category on the Budgets page (or tell me “food budget 5000”) and I'll warn you at 80% and 100%.",
      "4 कदमों में काम करने वाला बजट: 1) महीने की हाथ में आने वाली आमदनी लिखिए। 2) पहले फिक्स खर्च — किराया, EMI, बिल, बीमा, SIP। 3) बाकी हर कैटेगरी (खाना, पेट्रोल, शॉपिंग…) की महीने की लिमिट तय कीजिए — पिछले 3 महीनों के औसत से 10–20% कम। 4) पहले खुद को पैसे दीजिए: सैलरी आते ही बचत अलग कर दीजिए। हर हफ्ते देखिए। Budget Pro में Budgets पेज पर हर कैटेगरी की लिमिट रखिए (या मुझे बोलिए “खाने का बजट 5000”) — 80% और 100% पर मैं बता दूंगी।",
      "4 પગલાંમાં કામ કરે એવું બજેટ: 1) મહિનાની હાથમાં આવતી આવક લખો. 2) પહેલાં ફિક્સ ખર્ચ — ભાડું, EMI, બિલ, વીમો, SIP. 3) બાકીની દરેક કેટેગરી (ખાવાનું, પેટ્રોલ, શોપિંગ…) ની મહિનાની લિમિટ નક્કી કરો — છેલ્લા 3 મહિનાની સરેરાશથી 10–20% ઓછી. 4) પહેલાં પોતાને ચૂકવો: પગાર આવતાં જ બચત અલગ કરો. દર અઠવાડિયે જુઓ. Budget Pro માં Budgets પેજ પર દરેક કેટેગરીની લિમિટ રાખો (અથવા મને કહો “ખાવાનું બજેટ 5000”) — 80% અને 100% પર હું જણાવીશ.",
      "4 steps mein kaam karne wala budget: 1) Mahine ki haath mein aane wali income likhiye. 2) Pehle fixed kharche — rent, EMI, bills, insurance, SIP. 3) Baaki har category (food, petrol, shopping…) ki monthly limit rakhiye — pichle 3 mahine ke average se 10–20% kam. 4) Pay yourself first: salary aate hi bachat alag kar dijiye. Har hafte dekhiye. Budget Pro mein Budgets page pe har category ki limit rakhiye (ya mujhe boliye “food budget 5000”) — 80% aur 100% pe main bata dungi.",
    ),
    next: [q("Am I over budget?", "क्या बजट पार हुआ?", "બજેટ પાર થયું?", "Budget cross hua kya?"), q("Show my 50/30/20 split", "मेरा 50/30/20 दिखाओ", "મારો 50/30/20 બતાવો", "Mera 50/30/20 dikhao")],
  },
  sip: {
    title: q("SIP & mutual funds", "SIP और म्यूचुअल फंड", "SIP અને મ્યુચ્યુઅલ ફંડ", "SIP aur mutual fund"),
    answer: q(
      "A SIP (Systematic Investment Plan) invests a fixed amount in a mutual fund every month, automatically. You buy more units when prices are low and fewer when high (rupee-cost averaging), and returns compound over time. Example: ₹5,000/month for 10 years at an assumed 12% a year grows to about ₹11.6 lakh (you put in ₹6 lakh). Equity funds can fall in the short term, so use them for goals 5+ years away, keep an emergency fund first, and check the fund's expense ratio. This is general information, not investment advice.",
      "SIP (सिस्टमैटिक इन्वेस्टमेंट प्लान) में हर महीने एक तय रकम अपने-आप म्यूचुअल फंड में लगती है। भाव कम हो तो ज़्यादा यूनिट, ज़्यादा हो तो कम यूनिट मिलती हैं (रुपी-कॉस्ट एवरेजिंग), और रिटर्न पर रिटर्न मिलता है। उदाहरण: ₹5,000/महीना 10 साल तक, मान लीजिए 12% सालाना, तो लगभग ₹11.6 लाख (आपने ₹6 लाख लगाए)। इक्विटी फंड थोड़े समय में गिर भी सकते हैं, इसलिए इन्हें 5+ साल के गोल के लिए रखें, पहले इमरजेंसी फंड बनाएं और फंड का expense ratio देखें। ये सामान्य जानकारी है, निवेश सलाह नहीं।",
      "SIP (સિસ્ટમેટિક ઇન્વેસ્ટમેન્ટ પ્લાન) માં દર મહિને નક્કી રકમ આપમેળે મ્યુચ્યુઅલ ફંડમાં રોકાય છે. ભાવ ઓછા હોય ત્યારે વધુ યુનિટ, વધારે હોય ત્યારે ઓછા યુનિટ મળે છે (રૂપી-કોસ્ટ એવરેજિંગ), અને વળતર પર વળતર મળે છે. ઉદાહરણ: ₹5,000/મહિનો 10 વર્ષ સુધી, ધારો કે 12% વાર્ષિક, તો આશરે ₹11.6 લાખ (તમે ₹6 લાખ રોક્યા). ઇક્વિટી ફંડ ટૂંકા ગાળામાં ઘટી પણ શકે, એટલે 5+ વર્ષના ગોલ માટે રાખો, પહેલાં ઇમરજન્સી ફંડ બનાવો અને ફંડનો expense ratio જુઓ. આ સામાન્ય માહિતી છે, રોકાણ સલાહ નથી.",
      "SIP (Systematic Investment Plan) mein har mahine ek fixed amount apne-aap mutual fund mein lagti hai. Bhaav kam ho to zyada units, zyada ho to kam units milti hain (rupee-cost averaging), aur returns compound hote hain. Example: ₹5,000/mahina 10 saal tak, maan lijiye 12% saalana, to lagbhag ₹11.6 lakh (aapne ₹6 lakh lagaye). Equity funds short term mein gir bhi sakte hain, isliye inhe 5+ saal ke goals ke liye rakhiye, pehle emergency fund banaiye aur fund ka expense ratio dekhiye. Ye general jaankari hai, investment advice nahi.",
    ),
    next: [q("How much can I invest monthly?", "मैं हर महीने कितना निवेश कर सकता हूं?", "હું દર મહિને કેટલું રોકી શકું?", "Main har mahine kitna invest kar sakta hu?")],
  },
  compound: {
    title: q("Compound interest", "चक्रवृद्धि ब्याज", "ચક્રવૃદ્ધિ વ્યાજ", "Compound interest"),
    answer: q(
      "Compound interest means you earn interest on your interest. ₹1 lakh at 10% a year becomes ₹1.1 lakh after year 1, ₹1.21 lakh after year 2, and about ₹2.59 lakh after 10 years — versus ₹2 lakh with simple interest. Time matters most: starting 5 years earlier often beats investing double later. The same maths works AGAINST you on credit-card debt and high-interest loans.",
      "चक्रवृद्धि ब्याज यानी ब्याज पर भी ब्याज। ₹1 लाख 10% सालाना पर 1 साल बाद ₹1.1 लाख, 2 साल बाद ₹1.21 लाख और 10 साल बाद लगभग ₹2.59 लाख हो जाता है — साधारण ब्याज में सिर्फ़ ₹2 लाख। सबसे ज़रूरी है समय: 5 साल पहले शुरू करना, बाद में दोगुना लगाने से अक्सर बेहतर है। यही गणित क्रेडिट कार्ड और महंगे लोन पर आपके ख़िलाफ़ काम करता है।",
      "ચક્રવૃદ્ધિ વ્યાજ એટલે વ્યાજ પર પણ વ્યાજ. ₹1 લાખ 10% વાર્ષિક પર 1 વર્ષ પછી ₹1.1 લાખ, 2 વર્ષ પછી ₹1.21 લાખ અને 10 વર્ષ પછી આશરે ₹2.59 લાખ થાય — સાદા વ્યાજમાં માત્ર ₹2 લાખ. સૌથી મહત્વનો છે સમય: 5 વર્ષ વહેલું શરૂ કરવું, પછી બમણું રોકવા કરતાં ઘણી વાર સારું છે. આ જ ગણિત ક્રેડિટ કાર્ડ અને મોંઘી લોન પર તમારી વિરુદ્ધ કામ કરે છે.",
      "Compound interest yaani byaj par bhi byaj. ₹1 lakh 10% saalana par 1 saal baad ₹1.1 lakh, 2 saal baad ₹1.21 lakh aur 10 saal baad lagbhag ₹2.59 lakh — simple interest mein sirf ₹2 lakh. Sabse zaroori hai time: 5 saal pehle shuru karna, baad mein double lagane se aksar behtar hai. Yahi maths credit card aur mehnge loan par aapke khilaaf kaam karta hai.",
    ),
    next: [q("What is a SIP?", "SIP क्या है?", "SIP શું છે?", "SIP kya hai?")],
  },
  credit_score: {
    title: q("Credit score (CIBIL)", "क्रेडिट स्कोर (CIBIL)", "ક્રેડિટ સ્કોર (CIBIL)", "Credit score (CIBIL)"),
    answer: q(
      "A credit score (300–900 in India; 750+ is good) shows lenders how reliably you repay. To improve it: pay every EMI and card bill on time (the biggest factor), keep credit-card usage under 30% of the limit, don't apply for many loans at once, keep old cards open, and check your report once a year for mistakes. Improvement shows in 3–6 months of clean history.",
      "क्रेडिट स्कोर (भारत में 300–900; 750+ अच्छा) बताता है कि आप कितनी ईमानदारी से कर्ज़ चुकाते हैं। बढ़ाने के लिए: हर EMI और कार्ड बिल समय पर भरें (सबसे बड़ा कारण), कार्ड की लिमिट का 30% से कम इस्तेमाल करें, एक साथ कई लोन के लिए अप्लाई न करें, पुराने कार्ड बंद न करें और साल में एक बार रिपोर्ट में गलतियां जांचें। 3–6 महीने के साफ़ रिकॉर्ड से फर्क दिखने लगता है।",
      "ક્રેડિટ સ્કોર (ભારતમાં 300–900; 750+ સારો) બતાવે છે કે તમે કેટલી નિયમિતતાથી દેવું ચૂકવો છો. વધારવા માટે: દરેક EMI અને કાર્ડ બિલ સમયસર ભરો (સૌથી મોટું કારણ), કાર્ડની લિમિટનો 30% થી ઓછો ઉપયોગ કરો, એકસાથે ઘણી લોન માટે અરજી ન કરો, જૂના કાર્ડ બંધ ન કરો અને વર્ષમાં એક વાર રિપોર્ટમાં ભૂલો તપાસો. 3–6 મહિનાના સ્વચ્છ રેકોર્ડથી ફરક દેખાય છે.",
      "Credit score (India mein 300–900; 750+ achha) batata hai ki aap kitni imaandari se karz chukate hain. Badhane ke liye: har EMI aur card bill time pe bhariye (sabse bada factor), card limit ka 30% se kam use kijiye, ek saath kai loans ke liye apply mat kijiye, purane cards band mat kijiye aur saal mein ek baar report mein galtiyan check kijiye. 3–6 mahine ke saaf record se farak dikhne lagta hai.",
    ),
    next: [q("When is my next EMI?", "अगली EMI कब है?", "આગલી EMI ક્યારે છે?", "Agli EMI kab hai?")],
  },
  debt_strategy: {
    title: q("Which loan to repay first", "पहले कौन सा लोन चुकाएं", "કઈ લોન પહેલાં ચૂકવવી", "Pehle kaunsa loan chukayein"),
    answer: q(
      "Two proven methods: AVALANCHE — pay minimums on all loans and put every extra rupee on the HIGHEST-interest loan first; it saves the most interest. SNOWBALL — clear the SMALLEST balance first for quick wins that keep you motivated. Mathematically avalanche wins; if you struggle to stay consistent, snowball is fine. Always clear credit-card dues (36–42% a year) before anything else, and never skip an EMI.",
      "दो आज़माए हुए तरीके: AVALANCHE — सब लोन की न्यूनतम EMI भरें और हर अतिरिक्त रुपया सबसे ज़्यादा ब्याज वाले लोन पर लगाएं; इससे सबसे ज़्यादा ब्याज बचता है। SNOWBALL — सबसे छोटा लोन पहले खत्म करें, जल्दी जीत से हिम्मत बनी रहती है। गणित में avalanche बेहतर है; अनुशासन मुश्किल लगे तो snowball भी ठीक है। क्रेडिट कार्ड का बकाया (36–42% सालाना) सबसे पहले चुकाएं और कोई EMI न छोड़ें।",
      "બે અજમાવેલી રીતો: AVALANCHE — બધી લોનની ન્યૂનતમ EMI ભરો અને દરેક વધારાનો રૂપિયો સૌથી વધુ વ્યાજવાળી લોન પર લગાવો; આથી સૌથી વધુ વ્યાજ બચે છે. SNOWBALL — સૌથી નાની લોન પહેલાં પૂરી કરો, ઝડપી જીતથી હિંમત રહે છે. ગણિતમાં avalanche સારું છે; શિસ્ત અઘરી લાગે તો snowball પણ ઠીક છે. ક્રેડિટ કાર્ડનું બાકી (36–42% વાર્ષિક) સૌથી પહેલાં ચૂકવો અને કોઈ EMI ચૂકશો નહીં.",
      "Do aazmaaye hue tareeke: AVALANCHE — sab loans ki minimum EMI bhariye aur har extra rupaya sabse zyada byaj wale loan pe lagaiye; isse sabse zyada byaj bachta hai. SNOWBALL — sabse chhota loan pehle khatam kijiye, jaldi jeet se himmat bani rehti hai. Maths mein avalanche behtar hai; discipline mushkil lage to snowball bhi theek hai. Credit card ka bakaya (36–42% saalana) sabse pehle chukaiye aur koi EMI mat chhodiye.",
    ),
    next: [q("Show my loans", "मेरे लोन दिखाओ", "મારી લોન બતાવો", "Mere loans dikhao")],
  },
  inflation: {
    title: q("Inflation", "महंगाई", "મોંઘવારી", "Inflation (mehngai)"),
    answer: q(
      "Inflation is the rise in prices over time — at 6% a year, something that costs ₹1,000 today costs about ₹1,790 in 10 years. Money sitting idle loses buying power, so long-term savings should aim to earn more than inflation (after tax). When you set goals years ahead, add inflation to the target amount.",
      "महंगाई यानी समय के साथ दाम बढ़ना — 6% सालाना पर आज ₹1,000 की चीज़ 10 साल बाद लगभग ₹1,790 की होगी। बेकार पड़ा पैसा अपनी ख़रीदने की ताक़त खोता है, इसलिए लंबी बचत महंगाई से ज़्यादा (टैक्स के बाद) कमानी चाहिए। सालों बाद के गोल बनाते समय टारगेट में महंगाई जोड़ें।",
      "મોંઘવારી એટલે સમય સાથે ભાવ વધવા — 6% વાર્ષિક પર આજે ₹1,000 ની વસ્તુ 10 વર્ષ પછી આશરે ₹1,790 ની થશે. પડી રહેલા પૈસા ખરીદશક્તિ ગુમાવે છે, એટલે લાંબી બચત મોંઘવારી કરતાં વધુ (ટેક્સ પછી) કમાવી જોઈએ. વર્ષો પછીના ગોલ બનાવતી વખતે ટાર્ગેટમાં મોંઘવારી ઉમેરો.",
      "Inflation yaani time ke saath daam badhna — 6% saalana par aaj ₹1,000 ki cheez 10 saal baad lagbhag ₹1,790 ki hogi. Bekaar pada paisa apni kharidne ki taakat khota hai, isliye lambi bachat inflation se zyada (tax ke baad) kamani chahiye. Saalon baad ke goals banate waqt target mein inflation jodiye.",
    ),
    next: [q("What is compound interest?", "चक्रवृद्धि ब्याज क्या है?", "ચક્રવૃદ્ધિ વ્યાજ શું છે?", "Compound interest kya hai?")],
  },
  fd_vs_sip: {
    title: q("FD or SIP?", "FD या SIP?", "FD કે SIP?", "FD ya SIP?"),
    answer: q(
      "FD: fixed, guaranteed return (bank-insured up to ₹5 lakh), interest fully taxable — best for money needed within 1–3 years and the emergency fund. SIP in equity funds: no guarantee and can fall in the short term, but historically has beaten inflation over 5+ years — better for long goals. Many people use both: FD/liquid fund for safety, SIP for growth. General information, not investment advice.",
      "FD: तय और पक्का रिटर्न (₹5 लाख तक बैंक बीमा), ब्याज पर पूरा टैक्स — 1–3 साल में चाहिए पैसे और इमरजेंसी फंड के लिए सही। इक्विटी फंड में SIP: कोई गारंटी नहीं, थोड़े समय में गिर भी सकता है, पर 5+ साल में अक्सर महंगाई से आगे रहा है — लंबे गोल के लिए बेहतर। कई लोग दोनों रखते हैं: सुरक्षा के लिए FD, बढ़त के लिए SIP। ये सामान्य जानकारी है, निवेश सलाह नहीं।",
      "FD: નક્કી અને ખાતરીપૂર્વક વળતર (₹5 લાખ સુધી બેંક વીમો), વ્યાજ પર પૂરો ટેક્સ — 1–3 વર્ષમાં જોઈતા પૈસા અને ઇમરજન્સી ફંડ માટે યોગ્ય. ઇક્વિટી ફંડમાં SIP: કોઈ ગેરંટી નહીં, ટૂંકા ગાળે ઘટી પણ શકે, પણ 5+ વર્ષમાં ઘણી વાર મોંઘવારીથી આગળ રહ્યું છે — લાંબા ગોલ માટે સારું. ઘણા લોકો બંને રાખે છે: સુરક્ષા માટે FD, વૃદ્ધિ માટે SIP. આ સામાન્ય માહિતી છે, રોકાણ સલાહ નથી.",
      "FD: fixed aur pakka return (₹5 lakh tak bank insurance), byaj pe poora tax — 1–3 saal mein chahiye paise aur emergency fund ke liye sahi. Equity fund mein SIP: koi guarantee nahi, short term mein gir bhi sakta hai, par 5+ saal mein aksar inflation se aage raha hai — lambe goals ke liye behtar. Kai log dono rakhte hain: safety ke liye FD, growth ke liye SIP. Ye general jaankari hai, investment advice nahi.",
    ),
    next: [q("What is a SIP?", "SIP क्या है?", "SIP શું છે?", "SIP kya hai?")],
  },
  insurance: {
    title: q("How much insurance", "कितना बीमा चाहिए", "કેટલો વીમો જોઈએ", "Kitna insurance chahiye"),
    answer: q(
      "Two policies matter most: TERM life insurance — cover of about 10–15× your yearly income if anyone depends on you (pure term is cheap; avoid mixing insurance with investment). HEALTH insurance — at least ₹5–10 lakh family floater even if your employer covers you, because job cover ends when the job does. Buy young: premiums are lowest and fewer conditions are excluded.",
      "दो पॉलिसी सबसे ज़रूरी हैं: TERM लाइफ इंश्योरेंस — अगर कोई आप पर निर्भर है तो सालाना आमदनी का लगभग 10–15 गुना कवर (प्योर टर्म सस्ता है; बीमा और निवेश को मिलाएं नहीं)। HEALTH इंश्योरेंस — कंपनी का कवर होने पर भी कम से कम ₹5–10 लाख फैमिली फ्लोटर, क्योंकि नौकरी जाते ही वो कवर भी जाता है। जल्दी लें: प्रीमियम सबसे कम होता है।",
      "બે પોલિસી સૌથી જરૂરી છે: TERM લાઇફ ઇન્શ્યોરન્સ — કોઈ તમારા પર નિર્ભર હોય તો વાર્ષિક આવકના આશરે 10–15 ગણું કવર (પ્યોર ટર્મ સસ્તું છે; વીમો અને રોકાણ ભેગા ન કરો). HEALTH ઇન્શ્યોરન્સ — કંપનીનું કવર હોય તો પણ ઓછામાં ઓછું ₹5–10 લાખ ફેમિલી ફ્લોટર, કારણ કે નોકરી જાય તો તે કવર પણ જાય. વહેલું લો: પ્રીમિયમ સૌથી ઓછું હોય છે.",
      "Do policies sabse zaroori hain: TERM life insurance — agar koi aap par nirbhar hai to saalana income ka lagbhag 10–15 guna cover (pure term sasta hai; insurance aur investment ko mix mat kijiye). HEALTH insurance — company ka cover hone par bhi kam se kam ₹5–10 lakh family floater, kyunki naukri jaate hi wo cover bhi jaata hai. Jaldi lijiye: premium sabse kam hota hai.",
    ),
    next: [q("How much emergency fund do I need?", "मुझे कितना इमरजेंसी फंड चाहिए?", "મારે કેટલું ઇમરજન્સી ફંડ જોઈએ?", "Mujhe kitna emergency fund chahiye?")],
  },
  tax: {
    title: q("Saving income tax (India)", "टैक्स कैसे बचाएं (भारत)", "ટેક્સ કેવી રીતે બચાવવો (ભારત)", "Tax kaise bachayein (India)"),
    answer: q(
      "First compare the two regimes every year: the NEW regime has lower rates and a higher rebate but almost no deductions; the OLD regime allows deductions such as Section 80C (up to ₹1.5 lakh: EPF, PPF, ELSS funds, life insurance, home-loan principal, children's tuition), 80D (health insurance), home-loan interest (Sec 24) and HRA. If your deductions are small, the new regime usually wins. Rules change with each Budget, so confirm the current limits on the Income Tax portal or with a CA.",
      "हर साल दोनों टैक्स व्यवस्थाओं की तुलना करें: NEW व्यवस्था में दरें कम और छूट ज़्यादा, पर लगभग कोई डिडक्शन नहीं; OLD व्यवस्था में डिडक्शन मिलते हैं, जैसे धारा 80C (₹1.5 लाख तक: EPF, PPF, ELSS फंड, जीवन बीमा, होम लोन का मूलधन, बच्चों की फीस), 80D (हेल्थ इंश्योरेंस), होम लोन ब्याज (धारा 24) और HRA। डिडक्शन कम हों तो नई व्यवस्था अक्सर बेहतर रहती है। नियम हर बजट में बदलते हैं, इसलिए मौजूदा सीमाएं इनकम टैक्स पोर्टल या CA से ज़रूर जांचें।",
      "દર વર્ષે બંને ટેક્સ વ્યવસ્થાની સરખામણી કરો: NEW વ્યવસ્થામાં દર ઓછા અને છૂટ વધુ, પણ લગભગ કોઈ ડિડક્શન નહીં; OLD વ્યવસ્થામાં ડિડક્શન મળે છે, જેમ કે કલમ 80C (₹1.5 લાખ સુધી: EPF, PPF, ELSS ફંડ, જીવન વીમો, હોમ લોનનું મુદ્દલ, બાળકોની ફી), 80D (હેલ્થ ઇન્શ્યોરન્સ), હોમ લોન વ્યાજ (કલમ 24) અને HRA. ડિડક્શન ઓછા હોય તો નવી વ્યવસ્થા ઘણી વાર સારી રહે છે. નિયમો દરેક બજેટમાં બદલાય છે, એટલે વર્તમાન મર્યાદા ઇન્કમ ટેક્સ પોર્ટલ કે CA પાસે ચકાસો.",
      "Har saal dono tax regimes compare kijiye: NEW regime mein rates kam aur rebate zyada, par lagbhag koi deduction nahi; OLD regime mein deductions milte hain, jaise Section 80C (₹1.5 lakh tak: EPF, PPF, ELSS funds, life insurance, home loan principal, bachchon ki fees), 80D (health insurance), home loan interest (Sec 24) aur HRA. Deductions kam hon to new regime aksar behtar rehti hai. Rules har Budget mein badalte hain, isliye current limits Income Tax portal ya CA se zaroor check kijiye.",
    ),
    next: [q("How can I save more?", "ज़्यादा बचत कैसे करूं?", "વધુ બચત કેવી રીતે કરું?", "Zyada bachat kaise karun?")],
  },
  emi_calc: {
    title: q("How EMI is calculated", "EMI कैसे निकलती है", "EMI કેવી રીતે ગણાય", "EMI kaise calculate hoti hai"),
    answer: q(
      "EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1), where P = loan amount, r = yearly interest ÷ 12 ÷ 100, n = number of months. Example: ₹5 lakh at 10% for 5 years → EMI ≈ ₹10,624, total interest ≈ ₹1.37 lakh. Early EMIs are mostly interest, so prepaying in the first years saves the most. Try the free EMI calculator on our Tools page.",
      "EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1), जहां P = लोन की रकम, r = सालाना ब्याज ÷ 12 ÷ 100, n = महीनों की संख्या। उदाहरण: ₹5 लाख, 10% पर 5 साल → EMI ≈ ₹10,624, कुल ब्याज ≈ ₹1.37 लाख। शुरुआती EMI में ज़्यादातर ब्याज होता है, इसलिए शुरू के सालों में प्रीपेमेंट से सबसे ज़्यादा बचत होती है। हमारे Tools पेज पर मुफ़्त EMI कैलकुलेटर आज़माएं।",
      "EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1), જ્યાં P = લોનની રકમ, r = વાર્ષિક વ્યાજ ÷ 12 ÷ 100, n = મહિનાની સંખ્યા. ઉદાહરણ: ₹5 લાખ, 10% પર 5 વર્ષ → EMI ≈ ₹10,624, કુલ વ્યાજ ≈ ₹1.37 લાખ. શરૂઆતની EMI માં મોટાભાગે વ્યાજ હોય છે, એટલે શરૂઆતના વર્ષોમાં પ્રીપેમેન્ટથી સૌથી વધુ બચત થાય છે. અમારા Tools પેજ પર મફત EMI કેલ્ક્યુલેટર અજમાવો.",
      "EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1), jahan P = loan amount, r = saalana byaj ÷ 12 ÷ 100, n = mahino ki sankhya. Example: ₹5 lakh, 10% pe 5 saal → EMI ≈ ₹10,624, total byaj ≈ ₹1.37 lakh. Shuruaati EMIs mein zyadatar byaj hota hai, isliye shuru ke saalon mein prepayment se sabse zyada bachat hoti hai. Hamare Tools page pe free EMI calculator try kijiye.",
    ),
    next: [q("Show my loans", "मेरे लोन दिखाओ", "મારી લોન બતાવો", "Mere loans dikhao")],
  },
  saving_habits: {
    title: q("Habits that make you save", "बचत की अच्छी आदतें", "બચતની સારી આદતો", "Bachat ki achhi aadatein"),
    answer: q(
      "Habits that work: 1) Pay yourself first — auto-transfer savings on salary day. 2) The 24-hour rule — wait a day before any non-essential purchase above ₹2,000. 3) Track every expense (just tell me “chai 20”). 4) Cancel subscriptions you haven't used in a month. 5) Use cash or a fixed weekly limit for eating out and shopping. 6) Put raises and bonuses straight into goals before lifestyle catches up.",
      "काम करने वाली आदतें: 1) पहले खुद को पैसे दें — सैलरी आते ही बचत ट्रांसफर। 2) 24 घंटे का नियम — ₹2,000 से ऊपर की गैर-ज़रूरी ख़रीद से पहले एक दिन रुकें। 3) हर खर्च लिखें (बस बोलिए “चाय 20”)। 4) महीने भर से इस्तेमाल न हुए सब्सक्रिप्शन बंद करें। 5) बाहर खाने और शॉपिंग के लिए हफ्ते की तय लिमिट रखें। 6) इन्क्रीमेंट और बोनस सीधे गोल में डालें।",
      "કામ કરે એવી આદતો: 1) પહેલાં પોતાને ચૂકવો — પગાર આવતાં જ બચત ટ્રાન્સફર. 2) 24 કલાકનો નિયમ — ₹2,000 થી ઉપરની બિનજરૂરી ખરીદી પહેલાં એક દિવસ રાહ જુઓ. 3) દરેક ખર્ચ લખો (બસ કહો “ચા 20”). 4) મહિનાથી ન વપરાયેલાં સબ્સ્ક્રિપ્શન બંધ કરો. 5) બહાર જમવા અને શોપિંગ માટે અઠવાડિયાની નક્કી લિમિટ રાખો. 6) ઇન્ક્રીમેન્ટ અને બોનસ સીધા ગોલમાં નાખો.",
      "Kaam karne wali aadatein: 1) Pay yourself first — salary aate hi bachat transfer. 2) 24 ghante ka rule — ₹2,000 se upar ki gair-zaroori kharid se pehle ek din rukiye. 3) Har kharcha likhiye (bas boliye “chai 20”). 4) Mahine bhar se use na hue subscriptions band kijiye. 5) Bahar khane aur shopping ke liye hafte ki fixed limit rakhiye. 6) Increment aur bonus seedha goals mein daaliye.",
    ),
    next: [q("Where did most of my money go?", "सबसे ज़्यादा खर्च कहां हुआ?", "સૌથી વધુ ખર્ચ ક્યાં થયો?", "Sabse zyada kharcha kahan hua?")],
  },
  credit_card: {
    title: q("Using a credit card wisely", "क्रेडिट कार्ड का सही इस्तेमाल", "ક્રેડિટ કાર્ડનો સાચો ઉપયોગ", "Credit card ka sahi use"),
    answer: q(
      "Pay the FULL statement amount every month — paying only the 'minimum due' triggers 36–42% yearly interest on everything. Keep usage under 30% of your limit, never withdraw cash on a card, set up auto-pay for the full amount, and treat the card as a debit card: only spend what is already in your budget. Rewards are never worth interest.",
      "हर महीने पूरा स्टेटमेंट अमाउंट भरें — सिर्फ़ 'मिनिमम ड्यू' भरने पर पूरी रकम पर 36–42% सालाना ब्याज लगता है। लिमिट का 30% से कम इस्तेमाल करें, कार्ड से कभी कैश न निकालें, पूरी रकम का ऑटो-पे लगाएं और कार्ड को डेबिट कार्ड जैसा समझें: सिर्फ़ बजट में पहले से तय खर्च करें। रिवॉर्ड कभी ब्याज के लायक नहीं।",
      "દર મહિને પૂરું સ્ટેટમેન્ટ અમાઉન્ટ ભરો — માત્ર 'મિનિમમ ડ્યૂ' ભરવાથી આખી રકમ પર 36–42% વાર્ષિક વ્યાજ લાગે છે. લિમિટનો 30% થી ઓછો ઉપયોગ કરો, કાર્ડથી ક્યારેય કેશ ન ઉપાડો, પૂરી રકમનું ઓટો-પે રાખો અને કાર્ડને ડેબિટ કાર્ડ જેવું ગણો: માત્ર બજેટમાં નક્કી ખર્ચ કરો. રિવોર્ડ ક્યારેય વ્યાજને લાયક નથી.",
      "Har mahine poora statement amount bhariye — sirf 'minimum due' bharne pe poori rakam pe 36–42% saalana byaj lagta hai. Limit ka 30% se kam use kijiye, card se kabhi cash mat nikaliye, poori amount ka auto-pay lagaiye aur card ko debit card jaisa samjhiye: sirf budget mein pehle se tay kharcha kijiye. Rewards kabhi byaj ke laayak nahi.",
    ),
    next: [q("Am I over budget?", "क्या बजट पार हुआ?", "બજેટ પાર થયું?", "Budget cross hua kya?")],
  },
  retirement: {
    title: q("Saving for retirement", "रिटायरमेंट के लिए बचत", "નિવૃત્તિ માટે બચત", "Retirement ke liye bachat"),
    answer: q(
      "A common rule of thumb: build a corpus of about 25–30× your yearly expenses at retirement (inflation-adjusted). Start early and keep at least 10–15% of income going into long-term instruments (EPF, PPF, NPS, equity funds); raise it with every salary hike. Starting at 25 instead of 35 can roughly halve the monthly amount needed, thanks to compounding.",
      "एक आम नियम: रिटायरमेंट तक सालाना खर्च का लगभग 25–30 गुना फंड (महंगाई जोड़कर) बनाएं। जल्दी शुरू करें और आमदनी का कम से कम 10–15% लंबे निवेश (EPF, PPF, NPS, इक्विटी फंड) में लगाएं; हर इन्क्रीमेंट पर बढ़ाएं। 35 की बजाय 25 में शुरू करने से कंपाउंडिंग की वजह से हर महीने की ज़रूरत लगभग आधी हो जाती है।",
      "એક સામાન્ય નિયમ: નિવૃત્તિ સુધી વાર્ષિક ખર્ચના આશરે 25–30 ગણું ફંડ (મોંઘવારી ઉમેરીને) બનાવો. વહેલું શરૂ કરો અને આવકના ઓછામાં ઓછા 10–15% લાંબા રોકાણ (EPF, PPF, NPS, ઇક્વિટી ફંડ) માં રાખો; દરેક ઇન્ક્રીમેન્ટ પર વધારો. 35 ને બદલે 25 માં શરૂ કરવાથી કમ્પાઉન્ડિંગને લીધે દર મહિનાની જરૂર લગભગ અડધી થઈ જાય છે.",
      "Ek common rule: retirement tak saalana kharche ka lagbhag 25–30 guna fund (inflation jodkar) banaiye. Jaldi shuru kijiye aur income ka kam se kam 10–15% lambe investments (EPF, PPF, NPS, equity funds) mein lagaiye; har increment pe badhaiye. 35 ki bajaye 25 mein shuru karne se compounding ki wajah se har mahine ki zaroorat lagbhag aadhi ho jaati hai.",
    ),
    next: [q("How can I save more?", "ज़्यादा बचत कैसे करूं?", "વધુ બચત કેવી રીતે કરું?", "Zyada bachat kaise karun?")],
  },
  app_howto: {
    title: q("Using Budget Pro", "Budget Pro कैसे इस्तेमाल करें", "Budget Pro કેવી રીતે વાપરવું", "Budget Pro kaise use karein"),
    answer: q(
      "The fastest way: just tell me — “petrol 500”, “salary 50000 received”, “bike goal me 2000 daalo”, “EMI paid”, “food budget 5000”. Or use the menu: Income / Expenses to add entries (tick “auto-repeat” for monthly salary or rent), Budgets for category limits, Debts & EMIs for loans, Savings goals for targets, and Analytics / Insights for charts and my suggestions.",
      "सबसे आसान तरीका: बस मुझे बोलिए — “पेट्रोल 500”, “50000 सैलरी आई”, “बाइक गोल में 2000 डालो”, “EMI भर दी”, “खाने का बजट 5000”। या मेन्यू से: Income / Expenses में एंट्री (हर महीने की सैलरी या किराए के लिए “auto-repeat” चुनें), Budgets में कैटेगरी लिमिट, Debts & EMIs में लोन, Savings goals में टारगेट, और Analytics / Insights में चार्ट और मेरे सुझाव।",
      "સૌથી સરળ રીત: બસ મને કહો — “પેટ્રોલ 500”, “પગાર 50000 આવ્યો”, “બાઇક ગોલમાં 2000 નાખો”, “EMI ભરી દીધી”, “ખાવાનું બજેટ 5000”. અથવા મેનુથી: Income / Expenses માં એન્ટ્રી (દર મહિનાના પગાર કે ભાડા માટે “auto-repeat” પસંદ કરો), Budgets માં કેટેગરી લિમિટ, Debts & EMIs માં લોન, Savings goals માં ટાર્ગેટ, અને Analytics / Insights માં ચાર્ટ અને મારાં સૂચનો.",
      "Sabse aasaan tareeka: bas mujhe boliye — “petrol 500”, “50000 salary aayi”, “bike goal mein 2000 daalo”, “EMI bhar di”, “food budget 5000”. Ya menu se: Income / Expenses mein entries (har mahine ki salary ya rent ke liye “auto-repeat” chuniye), Budgets mein category limit, Debts & EMIs mein loans, Savings goals mein targets, aur Analytics / Insights mein charts aur mere suggestions.",
    ),
    next: [q("What can you do?", "तुम क्या कर सकती हो?", "તમે શું કરી શકો?", "Tum kya kar sakti ho?")],
  },
};
