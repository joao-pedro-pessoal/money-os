/**
 * Line icons for the phone screens (F30), drawn on a 24-unit grid with a
 * round stroke. Paths only, so a server component can draw them without
 * shipping an icon library; `PhoneIcon` puts them in an <svg>.
 */
export const PHONE_ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  wallet: "M3 7a2 2 0 0 1 2-2h12v4 M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z M16 14.5h.01",
  flows: "M7 4v16 M3 8l4-4 4 4 M17 20V4 M13 16l4 4 4-4",
  grid: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  plus: "M12 5v14 M5 12h14",
  out: "M7 17 17 7 M9 7h8v8",
  in: "M17 7 7 17 M7 9v8h8",
  transfer: "M4 8h14l-3-3 M20 16H6l3 3",
  import: "M14 3H6v18h12V7z M14 3v4h4 M12 11v6 M9 14l3 3 3-3",
  chevron: "M9 6l6 6-6 6",
  calendar: "M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 12h.01",
  pie: "M12 3a9 9 0 1 0 9 9h-9z M15 3.5A9 9 0 0 1 20.5 9H15z",
  repeat: "M4 12a8 8 0 0 1 14-5.3L20 9 M20 4v5h-5 M20 12a8 8 0 0 1-14 5.3L4 15 M4 20v-5h5",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
  bars: "M5 20v-9 M10 20V5 M15 20v-7 M20 20V9",
  report: "M6 3h9l4 4v14H6z M14 3v5h5 M9 13h6 M9 17h6",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7 M12 17h.01",
  sliders: "M4 6h10 M18 6h2 M16 4v4 M4 12h4 M12 12h8 M10 10v4 M4 18h12 M20 18h0 M18 16v4",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  invest: "M3 3v18h18 M6 15l5-5 4 3 6-8 M16 5h5v5",
  check: "M20 6 9 17l-5-5",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z",
  // Accounts
  bank: "M3 10h18 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18 M12 3l9 5H3z",
  cash: "M3 7h18v10H3z M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M6 10v4 M18 10v4",
  card: "M3 6h18v12H3z M3 10h18 M7 15h3",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  // Categories
  dining: "M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M17 10h2a2 2 0 0 1 0 4h-2 M8 3v2 M12 3v2",
  groceries: "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2 M9 20h.01 M17 20h.01",
  transport: "M4 16h16 M5.5 16l1.8-5.4a1 1 0 0 1 1-.6h7.4a1 1 0 0 1 1 .6l1.8 5.4 M5 16v3 M19 16v3",
  leisure: "M4 5h16v14H4z M8 5v14 M16 5v14 M4 9.5h4 M4 14.5h4 M16 9.5h4 M16 14.5h4",
  health: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  shopping: "M6 8h12l-1 12H7z M9 8a3 3 0 0 1 6 0",
  travel: "M3 13l18-7-4 15-5-5-4 3v-5z",
  education: "M3 9l9-5 9 5-9 5z M7 11.5V16c2.5 2 7.5 2 10 0v-4.5",
  salary: "M4 7h16v13H4z M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M4 12h16",
  refund: "M9 14l-5-5 5-5 M4 9h10a6 6 0 0 1 0 12h-3",
  gift: "M4 11h16v9H4z M3 7h18v4H3z M12 7v13 M12 7c-2-3-6-3-6-1s4 1 6 1 M12 7c2-3 6-3 6-1s-4 1-6 1",
  tag: "M3 12V4h8l10 10-8 8z M7.5 7.5h.01",
} as const;

export type PhoneIconName = keyof typeof PHONE_ICONS;

/** Lower case, accents gone, so "Saúde" and "saude" are one word. */
function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** First match wins, so the narrower words come before the broad ones. */
const CATEGORY_WORDS: [PhoneIconName, string[]][] = [
  ["salary", ["salar", "wage", "ordenado", "vencimento", "payroll", "paycheck"]],
  ["refund", ["refund", "reembols", "cashback", "devoluc"]],
  ["gift", ["gift", "present", "prenda", "oferta"]],
  ["repeat", ["subscri", "assinatura"]],
  ["groceries", ["grocer", "supermerc", "mercear", "supermarket"]],
  ["dining", ["restaur", "dining", "cafe", "coffee", "lunch", "almoco", "jantar", "dinner", "takeaway", "meal", "refeic", "bar"]],
  ["transport", ["transport", "fuel", "combust", "gasol", "uber", "taxi", "car", "parking", "estacion", "portagem", "toll", "train", "comboio", "metro", "bus"]],
  ["home", ["home", "casa", "rent", "renda", "housing", "habitac", "mortgage", "utilit", "agua", "water", "electric", "luz", "internet", "condomin"]],
  ["health", ["health", "saude", "farmac", "pharm", "doctor", "medic", "gym", "ginasio", "fitness", "dentist"]],
  ["travel", ["travel", "viage", "holiday", "ferias", "trip", "flight", "voo", "hotel"]],
  ["education", ["educ", "school", "escola", "curso", "course", "book", "livro", "propina", "tuition"]],
  ["leisure", ["leisure", "lazer", "entertain", "cinema", "film", "movie", "hobby", "game", "jogo", "stream", "music", "musica", "sport", "desporto"]],
  ["shopping", ["shop", "compra", "cloth", "roupa", "fashion", "electron"]],
  ["bars", ["interest", "juro", "dividend", "invest"]],
];

/**
 * A picture for a category the person named themselves. Only a hint to find a
 * row faster: an unknown name gets the plain tag, never a wrong guess shown as
 * certain, and the name is always written beside it.
 */
export function categoryIcon(name: string | null | undefined, kind: "income" | "expense" | "transfer" | string = "expense"): PhoneIconName {
  if (kind === "transfer") return "transfer";
  if (name) {
    const words = plain(name);
    for (const [icon, keys] of CATEGORY_WORDS) if (keys.some(key => words.includes(key))) return icon;
  }
  return kind === "income" ? "in" : "tag";
}

/** An account's picture from what kind of account it is. */
export function accountIcon(type: string | null | undefined, balance = 0): PhoneIconName {
  if (balance < 0) return "card";
  if (type === "cash") return "cash";
  if (type === "broker" || type === "exchange") return "invest";
  if (type === "bank") return "bank";
  return "wallet";
}
