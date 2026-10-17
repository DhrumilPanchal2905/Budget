// World currencies supported for display (amounts are stored as integer minor units, formatting via Intl).
// Shared by client + server.

export interface CurrencyDef {
  code: string;
  name: string;
  locale: string; // best-fit locale for number formatting
}

export const CURRENCIES: CurrencyDef[] = [
  { code: "INR", name: "Indian Rupee", locale: "en-IN" },
  { code: "USD", name: "US Dollar", locale: "en-US" },
  { code: "EUR", name: "Euro", locale: "de-DE" },
  { code: "GBP", name: "British Pound", locale: "en-GB" },
  { code: "AED", name: "UAE Dirham", locale: "en-AE" },
  { code: "SAR", name: "Saudi Riyal", locale: "en-SA" },
  { code: "QAR", name: "Qatari Riyal", locale: "en-QA" },
  { code: "KWD", name: "Kuwaiti Dinar", locale: "en-KW" },
  { code: "OMR", name: "Omani Rial", locale: "en-OM" },
  { code: "BHD", name: "Bahraini Dinar", locale: "en-BH" },
  { code: "SGD", name: "Singapore Dollar", locale: "en-SG" },
  { code: "AUD", name: "Australian Dollar", locale: "en-AU" },
  { code: "NZD", name: "New Zealand Dollar", locale: "en-NZ" },
  { code: "CAD", name: "Canadian Dollar", locale: "en-CA" },
  { code: "JPY", name: "Japanese Yen", locale: "ja-JP" },
  { code: "CNY", name: "Chinese Yuan", locale: "zh-CN" },
  { code: "HKD", name: "Hong Kong Dollar", locale: "en-HK" },
  { code: "KRW", name: "South Korean Won", locale: "ko-KR" },
  { code: "CHF", name: "Swiss Franc", locale: "de-CH" },
  { code: "SEK", name: "Swedish Krona", locale: "sv-SE" },
  { code: "NOK", name: "Norwegian Krone", locale: "nb-NO" },
  { code: "DKK", name: "Danish Krone", locale: "da-DK" },
  { code: "PLN", name: "Polish Złoty", locale: "pl-PL" },
  { code: "CZK", name: "Czech Koruna", locale: "cs-CZ" },
  { code: "HUF", name: "Hungarian Forint", locale: "hu-HU" },
  { code: "RUB", name: "Russian Ruble", locale: "ru-RU" },
  { code: "TRY", name: "Turkish Lira", locale: "tr-TR" },
  { code: "ZAR", name: "South African Rand", locale: "en-ZA" },
  { code: "NGN", name: "Nigerian Naira", locale: "en-NG" },
  { code: "KES", name: "Kenyan Shilling", locale: "en-KE" },
  { code: "EGP", name: "Egyptian Pound", locale: "en-EG" },
  { code: "BRL", name: "Brazilian Real", locale: "pt-BR" },
  { code: "MXN", name: "Mexican Peso", locale: "es-MX" },
  { code: "ARS", name: "Argentine Peso", locale: "es-AR" },
  { code: "CLP", name: "Chilean Peso", locale: "es-CL" },
  { code: "COP", name: "Colombian Peso", locale: "es-CO" },
  { code: "PKR", name: "Pakistani Rupee", locale: "en-PK" },
  { code: "BDT", name: "Bangladeshi Taka", locale: "en-BD" },
  { code: "LKR", name: "Sri Lankan Rupee", locale: "en-LK" },
  { code: "NPR", name: "Nepalese Rupee", locale: "en-NP" },
  { code: "MYR", name: "Malaysian Ringgit", locale: "en-MY" },
  { code: "THB", name: "Thai Baht", locale: "th-TH" },
  { code: "IDR", name: "Indonesian Rupiah", locale: "id-ID" },
  { code: "PHP", name: "Philippine Peso", locale: "en-PH" },
  { code: "VND", name: "Vietnamese Dong", locale: "vi-VN" },
  { code: "ILS", name: "Israeli Shekel", locale: "he-IL" },
];

const SET = new Set(CURRENCIES.map((c) => c.code));
export const isCurrency = (c: string) => SET.has(c);
export const currencyLocale = (code: string) => CURRENCIES.find((c) => c.code === code)?.locale ?? "en-IN";
