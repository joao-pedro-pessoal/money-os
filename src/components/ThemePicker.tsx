"use client";

import { THEMES, useTheme } from "./ThemeContext";

export default function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-4 gap-3">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          className="text-left rounded-lg overflow-hidden border"
          style={{
            borderColor: theme === t.id ? t.swatch : "var(--border)",
            borderWidth: theme === t.id ? 2 : 1,
          }}
        >
          <div style={{ background: t.bg, height: 40 }} className="flex items-end p-2">
            <div style={{ background: t.swatch, width: 20, height: 8, borderRadius: 4 }} />
          </div>
          <div className="px-2 py-1.5 text-xs" style={{ background: "var(--surface-2)" }}>
            {t.label}
          </div>
        </button>
      ))}
    </div>
  );
}
