"use client";

import { formatFor } from "@/lib/format";
import { useLanguage } from "./LanguageContext";

export function useFormat() {
  return formatFor(useLanguage().language);
}
