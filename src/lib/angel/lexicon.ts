// Angel AI — multilingual lexicon (English, Hindi, Gujarati — in native script AND romanised).
// Syntax of an entry:
//   "word"      → matches the token or (for long-enough stems) any token starting with it
//   "=word"     → exact token only
//   "two words" → phrase (matched on whole tokens, in order)
// Romanised entries are compared through `phonetic()`, so kharcha/kharchaa/kharchha are equal.

export const LEX = {
  // ---------------- question / command markers ----------------
  question: [
    "how", "what", "when", "which", "who", "where", "=why", "tell", "show", "list", "=give",
    "kitna", "kitne", "kitni", "=kya", "=kab", "kaun", "kahan", "kaha", "kaise", "kaisa", "kaisi", "batao", "bataiye", "bata", "dikhao", "dikha", "samjhao",
    "ketlu", "ketla", "ketli", "=shu", "kyare", "=kon", "kyan", "kevi", "batavo", "batav", "=kaho", "janavo",
    "कितना", "कितने", "कितनी", "क्या", "कब", "कौन", "कहां", "कहाँ", "कैसे", "कैसा", "कैसी", "बताओ", "बताइए", "बताइये", "बता", "दिखाओ", "दिखा",
    "કેટલું", "કેટલા", "કેટલી", "કેટલો", "શું", "ક્યારે", "કોણ", "ક્યાં", "કેવી", "કેવું", "બતાવો", "બતાવ", "કહો", "જણાવો",
  ],
  self: [
    "=my", "=me", "=i", "=mine", "=myself", "=mera", "=mere", "=meri", "=mujhe", "=maine", "=mai", "=main", "=hum", "=hamara", "=apna", "=apne",
    "=maru", "=mara", "=mari", "=maro", "=mane", "=me", "=hu",
    "मेरा", "मेरे", "मेरी", "मुझे", "मैंने", "मैं", "हमारा", "अपना", "अपने",
    "મારું", "મારા", "મારી", "મારો", "મને", "મેં", "હું",
  ],
  otherPronoun: [
    "=his", "=her", "=their", "=them", "=uska", "=uske", "=uski", "=unka", "=unke", "=unki", "=iska", "=iske", "=iski", "=enu", "=ena", "=eni", "=tenu", "=tena",
    "उसका", "उसके", "उसकी", "उनका", "उनके", "उनकी", "इसका", "इसके", "इसकी",
    "એનું", "એના", "એની", "તેનું", "તેના", "તેની",
  ],

  // ---------------- topics ----------------
  balance: [
    "balance", "=bal", "money left", "money do i have", "how much money", "=funds", "=cash", "net balance", "current balance",
    "belens", "balans", "kitne paise", "kitna paisa", "paise kitne", "paisa kitna", "=bacha", "=bache", "=bachi", "mere pas", "kitna pada", "kitne pade",
    "ketla paisa", "ketla rupiya", "=bachya", "=bachyu", "=baki", "mari pase",
    "बैलेंस", "बेलेंस", "बैलन्स", "शेष", "कितने पैसे", "कितना पैसा", "पैसे कितने", "=बचा", "=बचे", "=बची", "मेरे पास",
    "બેલેન્સ", "બેલન્સ", "બૅલેન્સ", "કેટલા પૈસા", "બચ્યા", "બચ્યું", "બાકી", "મારી પાસે",
  ],
  expense: [
    "expense", "expens", "spend", "spent", "spending", "=paid", "=expenditure", "=outflow", "=cost", "=costs",
    "kharcha", "kharch", "kharche", "kharchi", "kharach", "kharchyu", "kharchya", "vaparya", "lagaya", "lagaye",
    "खर्च", "खर्चा", "खर्चे", "खरच", "व्यय", "लगाया", "लगाए",
    "ખર્ચ", "ખર્ચો", "ખર્ચા", "ખરચ", "ખર્ચ્યા", "ખર્ચ્યો", "ખર્ચ્યું", "વાપર્યા",
  ],
  income: [
    "income", "earn", "earned", "earning", "salary", "=inflow", "=revenue",
    "kamai", "kamaya", "kamaye", "amdani", "aamdani", "=aay", "=aamad", "pagar", "pagaar", "aavak", "avak", "kamani", "vetan", "tankhwah", "tankha",
    "आमदनी", "=आय", "कमाई", "कमाया", "कमाए", "सैलरी", "वेतन", "तनख्वाह", "तनखा", "इनकम",
    "આવક", "કમાણી", "કમાયા", "કમાવ્યા", "પગાર", "સેલરી", "ઇન્કમ", "ઈન્કમ",
  ],
  savings: [
    "saving", "savings", "=save", "=saved", "=saves",
    "bachat", "bachaya", "bachaye", "=bachana", "=bachani", "=bachau", "=bachaun", "=bachao", "bachav", "bachavu", "bachavva", "bachavi",
    "बचत", "बचाया", "बचाए", "बचाना", "बचानी", "बचाऊं", "बचाऊँ", "बचाओ", "सेविंग",
    "બચત", "બચાવ", "બચાવ્યા", "બચાવવા", "બચાવવું", "બચાવું", "સેવિંગ",
  ],
  advice: [
    "how can", "how do", "how should", "=suggest", "suggestion", "=advice", "=advise", "=tips", "=tip", "=plan", "planning", "=strategy", "should i", "help me", "=reduce", "=improve", "=guide",
    "kaise", "kya karu", "kya karun", "kya karna", "kya kru", "salah", "sujhav", "upay", "kam karu", "kam karna", "kya kare",
    "kevi rite", "shu karu", "shu karvu", "shu karvanu", "ochhu",
    "कैसे", "क्या करूं", "क्या करूँ", "क्या करना", "सुझाव", "सलाह", "टिप्स", "प्लान", "उपाय", "कम करूं", "कम करना",
    "કેવી રીતે", "શું કરું", "શું કરવું", "શું કરવાનું", "સલાહ", "સૂચન", "ટિપ્સ", "પ્લાન", "ઉપાય", "ઓછો", "ઓછું",
  ],
  afford: [
    "afford", "can i buy", "should i buy", "=buy", "=purchase",
    "le sakta", "le sakti", "le sakte", "kharid sakta", "kharid sakti", "kharidu", "khareedu", "kharidna", "lena hai", "lai saku", "kharidi saku", "levu che", "levo che", "levi che",
    "ले सकता", "ले सकती", "ले सकते", "खरीद सकता", "खरीद सकती", "खरीदूं", "खरीदना", "लेना है",
    "લઈ શકું", "લઇ શકું", "ખરીદી શકું", "ખરીદવું", "લેવું છે", "લેવો છે", "લેવી છે",
  ],
  compare: [
    "compare", "comparison", "=vs", "versus", "than last", "difference", "=increased", "=decreased",
    "tulna", "mukable", "mukabale", "=fark", "=farak", "=antar", "sarkhamni",
    "तुलना", "मुकाबले", "मुक़ाबले", "फर्क", "फ़र्क", "अंतर",
    "સરખામણી", "તુલના", "ફરક", "કરતાં",
  ],
  most: [
    "=most", "=top", "kahan ja", "kaha ja", "kidhar ja", "where is my money", "money going", "kya kya kharch", "kyan jay", "kya jay", "highest", "maximum", "=max", "where did", "where do", "which category",
    "sabse jyada", "sabse zyada", "sabse adhik", "kaha gaya", "kahan gaya", "kaha gaye", "kahan gaye", "kis cheej", "kis cheez",
    "sauthi vadhu", "sauthi vadhare",
    "सबसे ज्यादा", "सबसे अधिक", "कहां गया", "कहाँ गया", "कहां गए", "किस चीज",
    "સૌથી વધુ", "સૌથી વધારે", "ક્યાં ગયા", "ક્યાં ગયું", "કઈ વસ્તુ",
  ],
  largest: [
    "biggest", "largest", "=costliest", "single biggest",
    "sabse bada", "sabse badi", "sabse bade", "sauthi moto", "sauthi motu", "sauthi moti",
    "सबसे बड़ा", "सबसे बडा", "सबसे बड़ी", "सबसे बडी",
    "સૌથી મોટો", "સૌથી મોટું", "સૌથી મોટી",
  ],
  category: ["category", "categories", "breakdown", "=split", "shreni", "श्रेणी", "कैटेगरी", "કેટેગરી", "વિભાગ"],
  debt: [
    "=debt", "=debts", "=loan", "=loans", "=owe", "=owed", "=emi", "=emis", "installment", "instalment", "=dues", "borrowed",
    "=karz", "=karza", "=karj", "=karja", "=udhar", "=udhaar", "=kist", "=kisht", "=hapto", "=hapta", "=devu", "=karaj",
    "कर्ज", "कर्जा", "लोन", "ईएमआई", "किस्त", "उधार", "ऋण",
    "લોન", "દેવું", "હપ્તો", "હપ્તા", "ઈએમઆઈ", "ઇએમઆઇ", "ઉધાર", "કરજ",
  ],
  goal: [
    "=goal", "=goals", "=target", "=targets", "=lakshya", "=lakshy", "=dhyey", "=dhyeya",
    "लक्ष्य", "गोल", "टारगेट",
    "ધ્યેય", "લક્ષ્ય", "ગોલ", "ટાર્ગેટ", "લક્ષ",
  ],
  recent: [
    "recent", "latest", "last transactions", "last entries", "=transactions", "=transaction", "=entries", "last few",
    "aakhri", "akhri", "haal hi", "pichli entry", "pichli entries", "chhella", "chhelli", "chhelle", "taja", "lenden", "vyavahar",
    "आखिरी", "हाल ही", "ताज़ा", "ताजा", "लेनदेन", "ट्रांजैक्शन", "एंट्री",
    "છેલ્લા", "છેલ્લી", "છેલ્લો", "તાજેતર", "વ્યવહાર", "ટ્રાન્ઝેક્શન", "એન્ટ્રી",
  ],
  health: [
    "=health", "=score", "financial health", "=condition", "=status",
    "=halat", "=haalat", "=sthiti", "=stithi", "kaisi hai halat", "=paristhiti",
    "स्वास्थ्य", "स्थिति", "हालत", "स्कोर", "हेल्थ",
    "સ્થિતિ", "હાલત", "સ્કોર", "હેલ્થ", "પરિસ્થિતિ",
  ],
  insight: [
    "insight", "insights", "analysis", "analyse", "analyze", "=review",
    "vishleshan", "samjhao", "samjao",
    "विश्लेषण", "इनसाइट", "समझाओ",
    "વિશ્લેષણ", "ઇનસાઇટ", "સમજાવો",
  ],
  overview: [
    "=summary", "=overview", "=report", "how am i doing", "how is my", "my budget", "=budget", "=situation", "=position", "everything", "full picture",
    "=hisab", "=hisaab", "=hisaab-kitaab", "hisab kitab", "sab kuch", "sab kuchh", "sab batao", "kaisa chal", "kaise chal", "kya haal", "=haal", "=riport", "=saransh", "pura hisab", "poora hisab",
    "kevu chale", "kem chale", "badhu batavo", "badhu kaho", "=hisab-kitab",
    "हिसाब", "सब कुछ", "सारांश", "रिपोर्ट", "बजट", "कैसा चल", "क्या हाल",
    "હિસાબ", "બધું", "સારાંશ", "રિપોર્ટ", "બજેટ", "કેવું ચાલે", "કેમ ચાલે",
  ],
  profile: [
    "=details", "=detail", "=email", "=mail", "email id", "mail id", "=login", "=logged", "last login", "=account", "=naam", "=name", "=joined", "=join", "=records", "=record", "=data", "baare mein", "bare mein", "bare me", "bare mai", "baare me", "=about", "=info", "information", "=jankari", "=jaankari", "=profile", "=mahiti", "=vishe", "=sign",
    "जानकारी", "बारे में", "ईमेल", "लॉगिन", "नाम", "प्रोफाइल", "डिटेल",
    "માહિતી", "વિશે", "ઈમેલ", "લૉગિન", "લોગિન", "નામ", "પ્રોફાઇલ", "ડિટેલ",
  ],
  ack: ["=achha", "=acha", "=accha", "=hmm", "=hm", "=nice", "=great", "=cool", "=badhiya", "=badiya", "=saras", "=mast", "=sahi", "theek hai", "thik hai", "=okk", "अच्छा", "बढ़िया", "सही", "સરસ", "મસ્ત", "બરાબર છે"],
  adminWord: ["=admin", "=admins", "=administrator", "एडमिन", "એડમિન"],
  whoWord: ["=who", "=whom", "=kisne", "kis user", "kaun sa user", "kaunsa user", "which user", "=kone", "kya user", "किसने", "किस यूज़र", "कौन", "કોણે", "કયા યુઝર"],
  userFilter: [
    "=active", "=inactive", "=disabled", "=blocked", "=new", "=naye", "=naya", "=latest", "=newest", "=old", "=oldest", "=purana", "=purane", "=sabse purana", "=logged", "=login", "=signup", "joined",
    "नए", "पुराने", "पुराना", "एक्टिव", "बंद", "નવા", "જૂના", "એક્ટિવ",
  ],
  forecast: [
    "forecast", "predict", "projection", "end of month", "month end", "will i save", "will be left",
    "mahine ke end", "mahine ke aakhir", "mahine ke ant", "mahina khatam", "bachega", "bachegi", "bachenge", "mahina na ante", "mahinana ante", "bachse",
    "अनुमान", "महीने के अंत", "महीने के आखिर", "महीने के एंड", "बचेगा", "बचेगी", "बचेंगे",
    "અંદાજ", "મહિનાના અંતે", "મહિનાના છેલ્લે", "બચશે",
  ],
  average: [
    "average", "=avg", "per day", "=daily", "every day", "=roj", "=roz", "rojana", "rozana", "har din", "=ausat", "=sarerash", "=darroj",
    "औसत", "रोज़", "रोज", "रोजाना", "रोज़ाना", "प्रतिदिन", "हर दिन",
    "સરેરાશ", "રોજ", "દરરોજ", "રોજનો", "રોજનું",
  ],
  greet: [
    "=hi", "=hii", "=hello", "=hey", "=namaste", "=namaskar", "good morning", "good evening", "good afternoon", "good night", "how are you", "kaise ho", "kaisi ho", "kya haal hai", "haal chal", "=kem", "kem cho", "kem che", "=jai", "jai shree krishna", "=helo",
    "नमस्ते", "नमस्कार", "हेलो", "हैलो", "कैसी हो", "कैसे हो", "जय श्री कृष्ण",
    "નમસ્તે", "નમસ્કાર", "કેમ છો", "કેમ છે", "હેલો", "જય શ્રી કૃષ્ણ",
  ],
  thanks: ["thanks", "thank", "=thx", "=ty", "shukriya", "dhanyavad", "dhanyawad", "=aabhar", "=abhar", "=shukriya", "धन्यवाद", "शुक्रिया", "थैंक", "આભાર", "ધન્યવાદ", "થેંક"],
  identity: [
    "who are you", "your name", "who made you", "who created you", "who built you", "about you", "what are you",
    "tum kaun", "aap kaun", "tumhara naam", "aapka naam", "kisne banaya", "kisne banai", "tame kon", "tu kon", "taru naam", "tamaru naam", "kone banavi", "kone banavyu",
    "तुम कौन", "आप कौन", "तुम्हारा नाम", "आपका नाम", "किसने बनाया", "किसने बनाई",
    "તમે કોણ", "તું કોણ", "તારું નામ", "તમારું નામ", "કોણે બનાવી", "કોણે બનાવ્યું", "કોણે બનાવ્યા",
  ],
  help: [
    "=help", "what can you do", "what can you", "=features", "=commands",
    "=madad", "kya kar sakti", "kya kar sakte", "shu kari shake", "shu kari sako",
    "मदद", "क्या कर सकती", "क्या कर सकते",
    "મદદ", "શું કરી શકે", "શું કરી શકો",
  ],

  // ---------------- actions ----------------
  addVerb: [
    "=add", "=added", "add karo", "add kar", "=record", "=log", "=enter", "=note", "=entry", "=put",
    "dalo", "daalo", "dal do", "daal do", "dal de", "likho", "likh do", "likh de", "jodo", "jod do", "jod de", "darj",
    "umero", "umeri", "nakho", "nakhi", "lakho", "lakhi", "nondh", "nondho",
    "जोड़ो", "जोडो", "जोड़ दो", "डालो", "डाल दो", "लिखो", "लिख दो", "ऐड", "एड", "दर्ज", "नोट",
    "ઉમેરો", "ઉમેરી", "નાખો", "નાખી", "લખો", "લખી", "એડ", "ઍડ", "નોંધો", "નોંધ", "ઉમેર",
  ],
  spentPast: [
    "=spent", "=paid", "=bought", "=gave",
    "kharch kiye", "kharch kiya", "kharcha kiya", "kharch kar diye", "kharch ho gaye", "kharch hue", "=diye", "=diya", "=bhara", "=bhare", "=lagaye", "=lage", "=gaye", "=kharide", "=kharida", "=liya",
    "kharchya", "kharchyo", "kharch karya", "chukavya", "=apya", "=bharya", "vaparya", "=lidhu", "=lidha", "kharidyu", "kharidya",
    "खर्च किए", "खर्च किये", "खर्च किया", "खर्च हुए", "खर्च हो गए", "दिए", "दिये", "भरे", "भरा", "चुकाए", "खरीदा", "खरीदे", "लिया",
    "ખર્ચ્યા", "ખર્ચ્યો", "ખર્ચ કર્યા", "ચૂકવ્યા", "આપ્યા", "ભર્યા", "વાપર્યા", "લીધું", "લીધા", "ખરીદ્યું", "ખરીદ્યા",
  ],
  received: [
    "=received", "=got", "=credited", "=credit",
    "=aaya", "=aayi", "=aai", "=aaye", "=aya", "=ayi", "=mila", "=mili", "=mile", "=jama", "=avyo", "=avi", "=avya", "=malyo", "=mali", "=malya", "=aavyo", "=aavi", "=aavya",
    "आया", "आई", "आए", "आये", "मिला", "मिली", "मिले", "जमा",
    "આવ્યો", "આવી", "આવ્યા", "આવ્યું", "મળ્યો", "મળી", "મળ્યા", "મળ્યું", "જમા",
  ],
  payWords: [
    "=pay", "=paid", "=payment", "=bhari", "=bhara", "=bhar", "bhar di", "bhar diya", "=chukai", "=chukaya", "=chukta", "=bharyo", "=bharyu", "=bharya", "=chukavyo", "=chukavya", "=chukvi",
    "भरी", "भरा", "भर दी", "भर दिया", "चुकाई", "चुकाया", "चुकता", "पे",
    "ભર્યો", "ભર્યા", "ભર્યું", "ભરી", "ચૂકવ્યો", "ચૂકવ્યા", "ચૂકવી", "પે",
  ],
  createVerb: [
    "=create", "=new", "=make", "=start", "=set", "=setup", "=open",
    "=banao", "=bana", "bana do", "bana de", "=banaiye", "=naya", "=nayi", "=nai", "=shuru", "=banavo", "=banavi", "=navu", "=navo", "=navi",
    "बनाओ", "बना दो", "बनाइए", "नया", "नई", "शुरू",
    "બનાવો", "બનાવી", "નવું", "નવો", "નવી", "શરૂ",
  ],
  takeLoan: ["=took", "taken", "=liya", "=lidhi", "=lidhu", "=lidho", "लिया", "લીધી", "લીધું", "લીધો"],
  deleteVerb: [
    "=delete", "=remove", "=erase", "=hatao", "hata do", "=mitao", "mita do", "=kadho", "=kadhi", "=hatavo", "=kadhi nakho",
    "हटाओ", "हटा दो", "मिटाओ", "मिटा दो", "डिलीट", "रद्द",
    "કાઢો", "કાઢી", "હટાવો", "ડિલીટ", "રદ",
  ],
  undo: ["=undo", "=revert", "=wapas", "=vapas", "=galti", "=galat", "=bhul", "वापस", "गलती", "ग़लती", "गलत", "ભૂલ", "પાછું", "અનડુ", "अनडू"],
  yes: [
    "=yes", "=yeah", "=yep", "=ok", "=okay", "=sure", "=confirm", "=done", "=haan", "=han", "=ha", "=haa", "=ji", "=theek", "=thik", "=bilkul", "=karo", "kar do", "=kardo", "=chalega", "=barabar", "=chokkas", "=sachu",
    "हाँ", "हां", "हा", "ठीक", "जी", "बिल्कुल", "करो", "कर दो",
    "હા", "હાં", "બરાબર", "ચોક્કસ", "કરો", "કરી દો", "ઓકે",
  ],
  no: [
    "=no", "=nope", "=cancel", "=nahi", "=nahin", "=na", "=mat", "rehne do", "=rehne", "=nai", "=nathi", "=rehva", "=raheva",
    "नहीं", "नही", "ना", "मत", "रहने", "कैंसल",
    "ના", "નહીં", "નહિ", "રહેવા", "કેન્સલ",
  ],
  stop: [
    "=bye", "=goodbye", "=stop", "deactivate", "=sleep", "band karo", "band kar", "=chup", "so jao", "=alvida", "=aavjo", "=avjo", "band kari do",
    "बंद करो", "बंद कर", "अलविदा", "चुप", "सो जाओ", "रुको",
    "બંધ કરો", "બંધ કર", "આવજો", "ચૂપ",
  ],

  // ---------------- admin ----------------
  users: [
    "=user", "=users", "=member", "=members", "=customer", "=customers", "=signup", "=signups", "sign up", "sign ups", "=registered", "=accounts", "=account",
    "=yujar", "=yuser", "=sadasya",
    "यूज़र", "यूजर", "उपयोगकर्ता", "सदस्य", "अकाउंट", "खाता",
    "યુઝર", "યૂઝર", "વપરાશકર્તા", "સભ્ય", "એકાઉન્ટ", "ખાતું",
  ],
  platform: [
    "all users", "every user", "=everyone", "=platform", "other users", "=dusre", "=doosre", "=dusron", "दूसरे", "दूसरों", "બીજા", "=bija", "=everybody", "whole app", "entire app", "all accounts",
    "=sabka", "=sabke", "=sabki", "sab ka", "sab ke", "=sabhi", "sab log", "sab users", "=badhanu", "=badhana", "=badhani",
    "सबका", "सबके", "सबकी", "सभी", "सब लोग", "प्लेटफॉर्म", "प्लेटफार्म",
    "બધાનું", "બધાના", "બધાની", "બધા", "પ્લેટફોર્મ",
  ],
  plan: ["=plan", "=plans", "=subscription", "=upgrade", "=downgrade", "प्लान", "प्लैन", "અપગ્રેડ", "પ્લાન", "अपग्रेड"],
  changeVerb: [
    "=change", "=switch", "=upgrade", "=downgrade", "=set", "=make", "=move",
    "=badlo", "badal do", "=badal", "kar do", "=kardo", "=karo", "=badlavo", "=badli", "kari do", "kari nakho",
    "बदलो", "बदल दो", "कर दो", "करो",
    "બદલો", "બદલી", "કરી દો", "કરો",
  ],
} as const;

export type LexKey = keyof typeof LEX;

export const PLAN_WORDS: Record<"free" | "plus" | "pro" | "unlimited", string[]> = {
  free: ["=free", "फ्री", "मुफ्त", "ફ્રી", "મફત"],
  plus: ["=plus", "प्लस", "પ્લસ"],
  pro: ["=pro", "प्रो", "પ્રો"],
  unlimited: ["unlimited", "=unlimit", "अनलिमिटेड", "असीमित", "અનલિમિટેડ", "અમર્યાદિત"],
};

// ---------------- categories ----------------
// Order = priority when several match ("ghar ka rent" → Rent, not Family).
export const EXPENSE_CATEGORY_WORDS: [string, string[]][] = [
  ["Fuel", ["petrol", "diesel", "=fuel", "=cng", "पेट्रोल", "डीजल", "ईंधन", "પેટ્રોલ", "ડીઝલ", "ઇંધણ"]],
  ["Rent", ["=rent", "house rent", "=kiraya", "=kiraaya", "=bhada", "=bhadu", "किराया", "ભાડું", "ભાડુ"]],
  ["EMI / Debt", ["loan payment", "emi payment", "credit card bill"]],
  ["Utilities", ["electricity", "=bijli", "light bill", "=light", "water bill", "pani bill", "=gas", "cylinder", "internet", "=wifi", "broadband", "recharge", "mobile bill", "phone bill", "=dth", "=bill", "=bills", "बिजली", "पानी का बिल", "गैस", "इंटरनेट", "रिचार्ज", "बिल", "વીજળી", "લાઇટ", "લાઈટ", "પાણી", "ગેસ", "ઇન્ટરનેટ", "રિચાર્જ", "બિલ"]],
  ["Groceries", ["grocery", "groceries", "kirana", "kiraana", "=sabzi", "=sabji", "vegetable", "=fruits", "=fruit", "=doodh", "=dudh", "=milk", "=ration", "dmart", "d mart", "bigbasket", "blinkit", "zepto", "shakbhaji", "=shak", "=karyanu", "=kariyanu", "किराना", "सब्जी", "दूध", "राशन", "फल", "કરિયાણું", "કરિયાણા", "શાકભાજી", "શાક", "દૂધ", "ફળ", "રાશન"]],
  ["Food & Dining", ["=food", "=khana", "=khaana", "=lunch", "=dinner", "breakfast", "=nashta", "=nasta", "=nasto", "restaurant", "=hotel", "zomato", "swiggy", "=pizza", "=burger", "=chai", "=tea", "=coffee", "=snacks", "=dining", "=jaman", "jamvanu", "khavanu", "=dinner", "खाना", "भोजन", "नाश्ता", "रेस्टोरेंट", "होटल", "चाय", "कॉफी", "जमवानु", "જમવાનું", "જમણ", "નાસ્તો", "ખાવાનું", "હોટલ", "ચા", "રેસ્ટોરન્ટ", "કોફી"]],
  ["Transport", ["=auto", "rickshaw", "=riksha", "=cab", "=taxi", "=uber", "=ola", "rapido", "=bus", "=train", "=metro", "parking", "=toll", "transport", "ऑटो", "रिक्शा", "टैक्सी", "बस", "ट्रेन", "मेट्रो", "पार्किंग", "રિક્ષા", "ટેક્સી", "બસ", "ટ્રેન", "પાર્કિંગ"]],
  ["Health", ["=health", "medicine", "=dawai", "=dawa", "=dava", "=davai", "doctor", "hospital", "medical", "pharmacy", "chemist", "checkup", "दवाई", "दवा", "डॉक्टर", "डाक्टर", "अस्पताल", "मेडिकल", "દવા", "દવાખાનું", "ડોક્ટર", "હોસ્પિટલ", "મેડિકલ"]],
  ["Education", ["education", "school", "college", "=fees", "=fee", "tuition", "=books", "=book", "course", "coaching", "padhai", "स्कूल", "कॉलेज", "फीस", "ट्यूशन", "किताब", "पढ़ाई", "पढाई", "શાળા", "સ્કૂલ", "કોલેજ", "ફી", "ટ્યુશન", "પુસ્તક", "ભણતર"]],
  ["Insurance", ["insurance", "=policy", "premium", "=lic", "=bima", "बीमा", "पॉलिसी", "प्रीमियम", "વીમો", "વીમા", "પોલિસી", "પ્રીમિયમ"]],
  ["Subscriptions", ["subscription", "netflix", "=prime", "hotstar", "spotify", "youtube premium", "=ott", "सब्सक्रिप्शन", "સબ્સ્ક્રિપ્શન"]],
  ["Investments", ["investment", "=invest", "=sip", "mutual fund", "=stocks", "=shares", "=fd", "=gold", "=sona", "=sonu", "निवेश", "एसआईपी", "सोना", "शेयर", "રોકાણ", "સોનું", "શેર"]],
  ["Travel", ["travel", "=trip", "=tour", "flight", "vacation", "holiday", "=yatra", "ghumne", "=farva", "यात्रा", "ट्रिप", "घूमने", "फ्लाइट", "પ્રવાસ", "ટ્રિપ", "ફરવા", "ફ્લાઇટ"]],
  ["Entertainment", ["=movie", "=movies", "=film", "cinema", "=party", "=game", "=games", "concert", "outing", "picnic", "entertainment", "फिल्म", "मूवी", "सिनेमा", "पार्टी", "मनोरंजन", "ફિલ્મ", "મૂવી", "પાર્ટી", "મનોરંજન"]],
  ["Shopping", ["shopping", "=clothes", "=kapde", "=kapda", "=kapda", "=shoes", "=joote", "=jute", "amazon", "flipkart", "myntra", "meesho", "=mall", "=dress", "=shirt", "=saree", "=sari", "electronics", "gadget", "=mobile", "=phone", "=kapda", "शॉपिंग", "कपड़े", "कपडे", "जूते", "खरीदारी", "મોબાઇલ", "શોપિંગ", "કપડાં", "કપડા", "બૂટ", "ખરીદી"]],
  ["Family", ["family", "=parivar", "=kids", "=bachche", "=bacche", "=mummy", "=papa", "=wife", "=gift", "=gifts", "परिवार", "बच्चे", "गिफ्ट", "પરિવાર", "બાળકો", "ગિફ્ટ", "ભેટ"]],
];

export const INCOME_CATEGORY_WORDS: [string, string[]][] = [
  ["Salary", ["salary", "=pagar", "=pagaar", "=vetan", "tankhwah", "=tankha", "सैलरी", "वेतन", "तनख्वाह", "તનખા", "પગાર", "સેલરી"]],
  ["Bonus", ["=bonus", "बोनस", "બોનસ"]],
  ["Freelance", ["freelance", "=project", "=client", "फ्रीलांस", "ફ્રીલાન્સ"]],
  ["Business", ["business", "=dhandha", "=dhanda", "=dhandho", "=vyapar", "=vepar", "=dukan", "=profit", "=munafa", "=sale", "=sales", "धंधा", "व्यापार", "बिजनेस", "बिज़नेस", "दुकान", "मुनाफा", "ધંધો", "ધંધા", "વેપાર", "બિઝનેસ", "દુકાન", "નફો"]],
  ["Investment", ["=interest", "=byaj", "=vyaj", "dividend", "=returns", "ब्याज", "लाभांश", "વ્યાજ", "ડિવિડન્ડ"]],
  ["Rental", ["=rent", "=kiraya", "=bhadu", "=bhada", "rental", "किराया", "ભાડું", "ભાડુ"]],
  ["Gift", ["=gift", "=tohfa", "=shagun", "=chandlo", "उपहार", "गिफ्ट", "शगुन", "ભેટ", "ગિફ્ટ", "ચાંદલો"]],
  ["Refund", ["refund", "cashback", "=wapsi", "रिफंड", "वापसी", "રિફંડ", "કેશબેક"]],
];

/** Words never treated as a person's name or as a goal/debt title. */
export const STOPWORDS = new Set<string>([
  "the", "a", "an", "of", "for", "to", "in", "on", "at", "is", "are", "was", "and", "or", "me", "my", "i", "this", "that", "it", "be", "do", "did", "much", "many", "please", "pls", "plz", "rs", "inr", "rupees", "rupee", "rupaye", "rupay", "rupiya", "rupiya", "rupees",
  "ka", "ke", "ki", "ko", "se", "me", "mein", "main", "par", "pe", "hai", "hain", "tha", "thi", "the", "ho", "hua", "hue", "kar", "karo", "kr", "ye", "yeh", "wo", "woh", "aur", "bhi", "to", "toh", "liye", "wala", "wali", "ek", "jo",
  "nu", "na", "ni", "no", "ne", "ma", "che", "chhe", "tak", "sudhi", "chahiye", "chaiye", "chiye", "joie", "joiye", "lo", "gayi", "gaya", "hota", "hoga", "wali", "vala", "vali", "kuch", "koi", "hatu", "hata", "ane", "pan", "aa", "e", "mate", "thi", "par", "upar",
  "का", "के", "की", "को", "तक", "चाहिए", "कुछ", "कोई", "से", "में", "पर", "है", "हैं", "था", "थी", "थे", "हो", "और", "भी", "तो", "लिए", "वाला", "ये", "यह", "वो", "वह", "जो", "एक", "रुपये", "रुपए", "रुपया",
  "નું", "ના", "ની", "નો", "સુધી", "જોઈએ", "કંઈ", "કોઈ", "ને", "માં", "મા", "છે", "હતું", "હતા", "અને", "પણ", "આ", "એ", "માટે", "થી", "પર", "રૂપિયા", "રૂ",
]);
