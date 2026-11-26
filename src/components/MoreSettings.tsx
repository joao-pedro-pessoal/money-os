"use client";

import Link from "next/link";
import MobileModeSwitch from "./MobileMode";
import PhoneIcon from "./PhoneIcon";
import { useNav } from "./NavContext";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { useText } from "./useText";

/**
 * The settings a phone reaches from "More" (F30): what used to crowd the top
 * of every screen — light or dark, Simple or Complex — and the full menu,
 * which stays one tap away for any page the tiles above do not name.
 */
export default function MoreSettings() {
  const uiText = useText();
  const { t } = useLanguage();
  const { mode, toggleMode } = useTheme();
  const { setOpen } = useNav();
  return (
    <ul className="ph-list">
      <li className="ph-list-row ph-mode-row">
        <span>{uiText("Display")}</span>
        <MobileModeSwitch />
      </li>
      <li>
        <button type="button" className="ph-list-row" onClick={toggleMode}>
          <span>{mode === "light" ? t.switchDark : t.switchLight}</span>
          <PhoneIcon name={mode === "light" ? "moon" : "sun"} size={18} />
        </button>
      </li>
      <li>
        <Link href="/settings" className="ph-list-row">
          <span>{t.settings}</span>
          <span className="ph-list-hint">{uiText("Theme, language, account and backups")}<PhoneIcon name="chevron" size={16} strokeWidth={2} /></span>
        </Link>
      </li>
      <li>
        <button type="button" className="ph-list-row" onClick={() => setOpen(true)} aria-controls="app-nav">
          <span>{uiText("All pages")}</span>
          <PhoneIcon name="menu" size={18} />
        </button>
      </li>
    </ul>
  );
}
