import es from "./catalogs/es.json";
import fr from "./catalogs/fr.json";
import de from "./catalogs/de.json";
import it from "./catalogs/it.json";
import nl from "./catalogs/nl.json";
import pl from "./catalogs/pl.json";
import ru from "./catalogs/ru.json";
import tr from "./catalogs/tr.json";
import ar from "./catalogs/ar.json";
import hi from "./catalogs/hi.json";
import bn from "./catalogs/bn.json";
import zh from "./catalogs/zh-CN.json";
import ja from "./catalogs/ja.json";
import type { Language } from "../i18n/languages";

// Legal pages import these on the server; they are not part of the client UI.
export const legalCatalogs: Record<Exclude<Language, "en" | "pt">, Record<string, string>> = {
  es, fr, de, it, nl, pl, ru, tr, ar, hi, bn, "zh-CN": zh, ja,
};
